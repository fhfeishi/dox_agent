"""Configuration shared by local parsing, API models and the agent."""

import os
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DOX_AGENT_ROOT = Path(__file__).resolve().parents[2]
# 方案 A（每个直接子目录 = 一个自包含知识库）：
# .knowledge/<corpus>/ 内含 source/（原始文件）、datadb/（sqlite）、vectordb/（向量库）。
CORPORA_ROOT_DEFAULT = DOX_AGENT_ROOT / ".knowledge"


def env_files() -> tuple[Path, ...]:
    """The .env files Settings reads; later files win, and exported variables beat all of them.

    Changed in F6/Q4 (2026-10-19): the parent directory's .env (DOX_AGENT_ROOT.parent / ".env") used
    to be read automatically. It is now read only when DOX_ENV_FILE names it (or any other file),
    with the same lower priority than the project .env. Old line:
    env_file=(DOX_AGENT_ROOT.parent / ".env", DOX_AGENT_ROOT / ".env"). See .logsdev/cleanup-log.md.
    """
    extra = os.environ.get("DOX_ENV_FILE")
    return (Path(extra), DOX_AGENT_ROOT / ".env") if extra else (DOX_AGENT_ROOT / ".env",)


class Settings(BaseSettings):
    # DeepSeek retired deepseek-chat / deepseek-reasoner on 2026-07-24; V4 names are the current ones.
    model_name: str = Field(
        default="deepseek-v4-flash", validation_alias=AliasChoices("MODEL_NAME", "DEEPSEEK_MODEL")
    )
    model_base_url: str = Field(
        default="https://api.deepseek.com",
        validation_alias=AliasChoices("MODEL_BASE_URL", "DEEPSEEK_BASE_URL"),
    )
    model_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("MODEL_API_KEY", "DEEPSEEK_API_KEY")
    )
    # Model calls always connect directly and never use the system proxy (HTTP(S)_PROXY); there is
    # no switch (user, 2026-10-20). An old MODEL_USE_PROXY line in .env is ignored.
    # §10: all local persistence lives under CORPORA_ROOT (default .knowledge); no data/ dir.
    # 语料根：其下每个直接子目录是一个自包含知识库（source/datadb/vectordb）。
    corpora_root: Path = CORPORA_ROOT_DEFAULT
    # 应用级状态目录（会话/报告/覆盖）；缺省从 corpora_root 派生为 <corpora_root>/.state。
    state_dir: Path | None = None
    user_dir: Path | None = None
    embedding_path: str = ""
    embedding_device: str = "cpu"
    embedding_query_prompt: str = ""
    # B6: the corpus is configurable, so nothing may hard-code one corpus' names or queries.
    warmup_query: str = ""
    # H1: corpus registry. CORPORA is a JSON list overriding id/name/kind/domain
    # per corpus-root-relative path.
    corpora: list[dict] = Field(default_factory=list)
    web_provider: str = "crawl4ai"
    web_sessions_file: Path | None = None
    firecrawl_api_key: SecretStr | None = None
    firecrawl_base_url: str = "https://api.firecrawl.dev"
    # K13: mineru CLI (external). Template must contain {pdf} and {out}; run once per PDF.
    # `zip` emits markdown.md + middle_json.json (+images) in one parse.
    mineru_cmd: str = 'mineru-kit parse "{pdf}" -o "{out}/result.zip" --tier standard --ocr-mode auto --format zip'
    mineru_home: Path | None = None
    mineru_timeout: float = Field(default=3600, ge=30, le=7200)
    # Removed 8 settings nothing read any more (F4/Q3, 2026-10-19): max_research_steps, max_rounds,
    # evidence_routing, max_searches, max_reads, model_context_tokens, answer_reserve_tokens,
    # research_timeout. Old .env values are ignored (extra="ignore"). See .logsdev/cleanup-log.md;
    # restore with: git show 4ce4616:src/agent/config.py
    retrieve_retry: int = Field(default=1, ge=0, le=1)  # L6: at most one bounded re-retrieve
    max_model_calls: int = Field(default=12, ge=3, le=40)
    # D-L3/D-L8: conservative token budget (no tiktoken); uncalibrated.
    retrieve_context_tokens: int = Field(default=24000, ge=1024, le=200000)
    retrieve_report_tokens: int = Field(default=12000, ge=512, le=200000)
    history_tokens: int = Field(default=12000, ge=0, le=200000)
    answer_timeout: float = Field(default=180, ge=10, le=600)
    run_timeout: float = Field(default=180, ge=10, le=600)
    langsmith_tracing: bool = False
    langsmith_api_key: SecretStr | None = None
    langsmith_project: str = "dox-agent"
    # Review model overrides (F6/Q4): read from the project .env like everything else. An exported
    # REVIEW_* variable still wins (review/model_client.py checks os.environ first). Empty means
    # "reuse MODEL_*". Numbers stay lenient as before: invalid -> default, out of range -> clamped
    # in model_client.config().
    review_model_api_key: SecretStr | None = None
    review_model_base_url: str = ""
    review_model_name: str = ""
    review_model_timeout: int | None = None
    review_run_timeout: int | None = None
    review_max_calls: int | None = None
    review_chunk_chars: int | None = None
    review_max_document_chars: int | None = None
    review_max_output_tokens: int | None = None
    model_config = SettingsConfigDict(
        env_file=env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @field_validator("review_model_timeout", "review_run_timeout", "review_max_calls", "review_chunk_chars",
                     "review_max_document_chars", "review_max_output_tokens", mode="before")
    @classmethod
    def _lenient_review_number(cls, value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @model_validator(mode="after")
    def _derive_state_dir(self):
        if self.state_dir is None:
            object.__setattr__(self, "state_dir", Path(self.corpora_root) / ".state")
        if self.user_dir is None:
            default_state = Path(self.corpora_root) / ".state"
            self.user_dir = (Path(self.corpora_root).parent / ".local" / "usr"
                             if Path(self.state_dir) == default_state else Path(self.state_dir) / "usr")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
