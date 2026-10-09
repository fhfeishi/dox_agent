"""OpenAI-compatible JSON client for review stages; placeholder credentials never leave this process."""
import hashlib
import json
import logging
import os
import time
from urllib.parse import urlparse

import httpx

from ..agent.config import get_settings
from ..agent.models import use_proxy
from .research import redact

logger = logging.getLogger(__name__)

PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")


class ModelError(ValueError):
    pass


class TruncatedModelError(ModelError):
    """The reply hit the output limit; the caller may retry with a smaller input."""


class TransientModelError(ModelError):
    """Network failure or unparseable reply; worth exactly one retry within the call budget."""


def _number(value, default, low, high):
    try:
        return max(low, min(high, int(value)))
    except (ValueError, TypeError):
        return default


def config():
    """REVIEW_MODEL_* 可选覆盖优先；未设置时复用主配置 MODEL_*。"""
    settings = get_settings()
    env = os.environ
    key = env.get("REVIEW_MODEL_API_KEY") or (
        settings.model_api_key.get_secret_value() if settings.model_api_key else ""
    )
    base = (env.get("REVIEW_MODEL_BASE_URL") or settings.model_base_url).rstrip("/")
    model = env.get("REVIEW_MODEL_NAME") or settings.model_name
    placeholder = not key or any(
        x in key.lower() for x in ("replace", "placeholder", "your_", "example")
    )
    u = urlparse(base)
    local = u.hostname in ("127.0.0.1", "localhost")
    valid = (
        u.scheme == "https" and bool(u.hostname) and not u.username and not u.query
    ) or (local and u.scheme in ("http", "https") and not u.username and not u.query)
    return dict(
        key=key,
        base=base,
        model=model,
        ready=not placeholder and valid,
        timeout=_number(env.get("REVIEW_MODEL_TIMEOUT"), 180, 10, 300),
        deadline=_number(env.get("REVIEW_RUN_TIMEOUT"), 900, 60, 1800),
        max_calls=_number(env.get("REVIEW_MAX_CALLS"), 32, 5, 60),
        chunk=_number(env.get("REVIEW_CHUNK_CHARS"), 12000, 2000, 20000),
        max_chars=_number(env.get("REVIEW_MAX_DOCUMENT_CHARS"), 240000, 10000, 500000),
        tokens=_number(env.get("REVIEW_MAX_OUTPUT_TOKENS"), 16000, 1000, 32768),
    )


def model_configured():
    return config()["ready"]


class Client:
    """单次审核任务的模型客户端：预算旋钮（调用数/截止时间）内置，不做无界调用。"""

    def __init__(self, transport=None):
        self.settings = config()
        self.calls = []
        self.started = time.monotonic()
        self.transport = transport

    def ask(self, stage, data):
        # One bad reply or dropped connection should not end a multi-step review.
        try:
            return self._ask(stage, data)
        except TransientModelError:
            return self._ask(stage, data)

    def _ask(self, stage, data):
        c = self.settings
        if not c["ready"]:
            raise ModelError("审查模型尚未配置：请设置 MODEL_API_KEY，或用 REVIEW_MODEL_* 单独配置。")
        remaining = c["deadline"] - (time.monotonic() - self.started)
        if len(self.calls) >= c["max_calls"] or remaining <= 0:
            raise ModelError("已达到本次审核的调用次数或时间上限，请缩小材料范围后重试。")
        with open(os.path.join(PROMPTS_DIR, f"{stage}.md"), encoding="utf-8-sig") as handle:
            prompt = handle.read()
        call = {
            "stage": stage,
            "model": c["model"],
            "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
            "status": "started",
        }
        self.calls.append(call)
        payload = {
            "model": c["model"],
            "temperature": 0.1,
            "max_tokens": c["tokens"],
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": redact(json.dumps(data, ensure_ascii=False))},
            ],
        }
        try:
            # Same proxy switch as the main model client.
            with httpx.Client(timeout=min(c["timeout"], remaining), transport=self.transport,
                              trust_env=use_proxy(get_settings())) as http:
                response = http.post(
                    c["base"] + "/chat/completions",
                    headers={"Authorization": "Bearer " + c["key"]},
                    json=payload,
                )
            if response.status_code in (401, 403):
                raise ModelError("审查模型认证失败：请检查密钥、服务地址及模型权限。")
            if response.status_code == 429:
                raise ModelError("审查模型限流或额度不足，请检查账户后重试。")
            if response.is_error:
                raise ModelError(f"审查模型服务返回 HTTP {response.status_code}，本次模型审核未完成。")
            body = response.json()
            choice = body["choices"][0]
            if choice.get("finish_reason") == "length":
                raise TruncatedModelError("模型输出被截断，请提高输出上限或缩小输入。")
            result = json.loads(choice["message"]["content"])
            if not isinstance(result, dict):
                raise ValueError()
            call.update(status="completed", request_id=body.get("id"), usage=body.get("usage", {}))
            return result
        except ModelError:
            call["status"] = "failed"
            raise
        except Exception as exc:
            call["status"] = "failed"
            logger.warning("review model call %s failed: %s: %s", stage, type(exc).__name__, exc, exc_info=True)
            raise TransientModelError("审查模型请求超时、网络异常或返回了无效 JSON；未生成完整审核结论。") from None
