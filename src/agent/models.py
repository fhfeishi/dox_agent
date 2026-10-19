"""One replacement point for model providers and optional LangSmith tracing."""

import time
from contextlib import contextmanager
from functools import lru_cache

import httpx
from langchain_openai import ChatOpenAI
from langsmith import Client, tracing_context

from .config import Settings


def use_proxy(settings: Settings) -> bool:
    """Model calls connect directly unless MODEL_USE_PROXY=true asks for the system proxy."""
    return settings.model_use_proxy


@lru_cache(maxsize=2)
def _http_clients(trust_env: bool):
    # httpx only reads HTTP(S)_PROXY when trust_env is on; off means a direct connection.
    return httpx.Client(trust_env=trust_env, timeout=60), httpx.AsyncClient(trust_env=trust_env, timeout=60)


def check_model(settings: Settings) -> dict:
    """One minimal completion; proves address, key and model name together.

    A model-list request is not enough: a retired or misspelled model name still lists fine but fails
    every later call, which shows up as a broken demo instead of a configuration error.
    """
    if not settings.model_api_key:
        return {"ok": False, "error": "未配置 MODEL_API_KEY"}
    base = settings.model_base_url.rstrip("/")
    started = time.monotonic()
    payload = {"model": settings.model_name, "messages": [{"role": "user", "content": "ping"}],
               "max_tokens": 8, "stream": False}
    try:
        # Short timeout: this runs as a launch preflight and must not hold the start for 20 s.
        with httpx.Client(trust_env=use_proxy(settings), timeout=8) as http:
            response = http.post(base + "/chat/completions",
                                 headers={"Authorization": "Bearer " + settings.model_api_key.get_secret_value()},
                                 json=payload)
    except httpx.TimeoutException:
        return {"ok": False, "error": "连接超时：网络不可达（默认直连，不经代理）",
                "latency_ms": round((time.monotonic() - started) * 1000)}
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"无法连接 {base}（DNS 或网络不可达）：{type(exc).__name__}",
                "latency_ms": round((time.monotonic() - started) * 1000)}
    latency = round((time.monotonic() - started) * 1000)
    if response.is_error:
        detail = ""
        try:
            detail = str(response.json().get("error", {}).get("message", ""))[:120]
        except ValueError:
            detail = response.text[:120]
        if response.status_code in (401, 403):
            reason = "密钥被拒绝（401/403）"
        elif response.status_code == 404:
            reason = "接口地址不存在（404）"
        elif response.status_code == 400:
            reason = f"请求被拒绝（400，常见原因：模型名 {settings.model_name} 不可用）"
        else:
            reason = f"服务返回 HTTP {response.status_code}"
        return {"ok": False, "error": reason + (f"：{detail}" if detail else ""), "latency_ms": latency}
    return {"ok": True, "latency_ms": latency, "model": settings.model_name}


def model_for(settings: Settings, timeout: float | None = None):
    """A chat model client. Without an explicit timeout it waits as long as an answer may take
    (``answer_timeout``): a question over whole reports can wait over a minute for its first token,
    which the former fixed 60 s cut off as a failed answer (query 2026-1015 1518)."""
    if not settings.model_api_key:
        raise ValueError("请配置 MODEL_API_KEY（兼容 DEEPSEEK_API_KEY）")
    http_client, http_async_client = _http_clients(use_proxy(settings))
    return ChatOpenAI(
        model=settings.model_name,
        base_url=settings.model_base_url,
        api_key=settings.model_api_key.get_secret_value(),
        http_client=http_client,
        http_async_client=http_async_client,
        http_socket_options=(),  # our own clients decide proxy use; keep langchain from overriding it
        temperature=0.1,
        timeout=timeout if timeout is not None else settings.answer_timeout,
        max_retries=1,
        max_tokens=4096,
        stream_usage=True,
    )


@contextmanager
def tracing(settings: Settings):
    client = None
    if settings.langsmith_tracing:
        if not settings.langsmith_api_key:
            raise ValueError("启用 LangSmith 时请配置 LANGSMITH_API_KEY")
        client = Client(api_key=settings.langsmith_api_key.get_secret_value())
    try:
        with tracing_context(
            enabled=settings.langsmith_tracing, project_name=settings.langsmith_project, client=client
        ):
            yield
    finally:
        if client:
            client.flush()
            client.close()
