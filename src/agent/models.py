"""One replacement point for model providers and optional LangSmith tracing."""

from contextlib import contextmanager

from langchain_openai import ChatOpenAI
from langsmith import Client, tracing_context

from .config import Settings


def model_for(settings: Settings):
    if not settings.model_api_key:
        raise ValueError("请配置 MODEL_API_KEY（兼容 DEEPSEEK_API_KEY）")
    return ChatOpenAI(
        model=settings.model_name,
        base_url=settings.model_base_url,
        api_key=settings.model_api_key.get_secret_value(),
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
