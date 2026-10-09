"""One replacement point for model providers and optional LangSmith tracing."""

import json
import os
import time
from contextlib import contextmanager
from functools import lru_cache

import httpx
from langchain_openai import ChatOpenAI
from langsmith import Client, tracing_context

from .config import Settings

PROXY_FILE = "model_settings.json"


def proxy_setting(settings: Settings) -> dict:
    """Whether model calls use the system proxy: the settings-panel choice, else MODEL_USE_PROXY."""
    try:
        saved = json.loads((settings.state_dir / PROXY_FILE).read_text(encoding="utf-8"))
        enabled, source = bool(saved["use_proxy"]), "panel"
    except (OSError, ValueError, KeyError, TypeError):
        enabled, source = settings.model_use_proxy, "env"
    address = next((os.environ[k] for k in ("HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy")
                    if os.environ.get(k)), "")
    return {"enabled": enabled, "source": source, "address": address}


def save_proxy_setting(settings: Settings, enabled: bool) -> dict:
    settings.state_dir.mkdir(parents=True, exist_ok=True)
    (settings.state_dir / PROXY_FILE).write_text(json.dumps({"use_proxy": enabled}), encoding="utf-8")
    return proxy_setting(settings)


def use_proxy(settings: Settings) -> bool:
    return proxy_setting(settings)["enabled"]


@lru_cache(maxsize=2)
def _http_clients(trust_env: bool):
    # httpx only reads HTTP(S)_PROXY when trust_env is on; off means a direct connection.
    return httpx.Client(trust_env=trust_env, timeout=60), httpx.AsyncClient(trust_env=trust_env, timeout=60)


def check_model(settings: Settings) -> dict:
    """One bounded request to the provider's model list; proves reachability and credentials only."""
    if not settings.model_api_key:
        return {"ok": False, "error": "未配置 MODEL_API_KEY"}
    started = time.monotonic()
    try:
        with httpx.Client(trust_env=use_proxy(settings), timeout=15) as http:
            response = http.get(settings.model_base_url.rstrip("/") + "/models",
                                headers={"Authorization": "Bearer " + settings.model_api_key.get_secret_value()})
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"连接失败：{type(exc).__name__}", "latency_ms": round((time.monotonic() - started) * 1000)}
    latency = round((time.monotonic() - started) * 1000)
    if response.is_error:
        return {"ok": False, "error": f"服务返回 HTTP {response.status_code}", "latency_ms": latency}
    return {"ok": True, "latency_ms": latency}


def model_for(settings: Settings):
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
        timeout=60,
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
