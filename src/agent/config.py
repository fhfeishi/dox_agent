"""Configuration shared by local parsing, API models and the agent."""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DOX_AGENT_ROOT = Path(__file__).resolve().parents[2]
# 方案 A（每个直接子目录 = 一个自包含知识库）：
# .knowledge/<corpus>/ 内含 source/（原始文件）、datadb/（sqlite）、vectordb/（向量库）。
CORPORA_ROOT_DEFAULT = DOX_AGENT_ROOT / ".knowledge"


class Settings(BaseSettings):
    model_name: str = Field(
        default="deepseek-chat", validation_alias=AliasChoices("MODEL_NAME", "DEEPSEEK_MODEL")
    )
    model_base_url: str = Field(
        default="https://api.deepseek.com",
        validation_alias=AliasChoices("MODEL_BASE_URL", "DEEPSEEK_BASE_URL"),
    )
    model_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("MODEL_API_KEY", "DEEPSEEK_API_KEY")
    )
    # §10: all local persistence lives under CORPORA_ROOT (default .knowledge); no data/ dir.
    # 语料根：其下每个直接子目录是一个自包含知识库（source/datadb/vectordb）。
    corpora_root: Path = CORPORA_ROOT_DEFAULT
    # 应用级状态目录（会话/报告/覆盖）；缺省从 corpora_root 派生为 <corpora_root>/.state。
    state_dir: Path | None = None
    # 默认库相对名（M4）；缺失时回退首个 ready 库，全无 ready 不抛异常。
    default_corpus: str = "demo_langchain"
    embedding_path: str = ""
    embedding_device: str = "cpu"
    embedding_query_prompt: str = ""
    # B6: the corpus is configurable, so nothing may hard-code one corpus' names or queries.
    auto_import_official: bool = True
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
    max_research_steps: int = Field(default=24, ge=4, le=100)
    max_rounds: int = Field(default=2, ge=1, le=3)
    retrieve_retry: int = Field(default=1, ge=0, le=1)  # L6: at most one bounded re-retrieve
    evidence_routing: bool = True
    max_searches: int = Field(default=6, ge=1, le=20)
    max_reads: int = Field(default=8, ge=2, le=20)
    max_model_calls: int = Field(default=12, ge=3, le=40)
    # D-L3/D-L8: conservative token budget (no tiktoken); uncalibrated.
    model_context_tokens: int = Field(default=65536, ge=4096, le=200000)
    retrieve_context_tokens: int = Field(default=24000, ge=1024, le=200000)
    retrieve_report_tokens: int = Field(default=12000, ge=512, le=200000)
    answer_reserve_tokens: int = Field(default=2048, ge=256, le=32768)
    history_tokens: int = Field(default=12000, ge=0, le=200000)
    answer_timeout: float = Field(default=180, ge=10, le=600)
    research_timeout: float = Field(default=120, ge=10, le=540)
    run_timeout: float = Field(default=180, ge=10, le=600)
    langsmith_tracing: bool = False
    langsmith_api_key: SecretStr | None = None
    langsmith_project: str = "dox-agent"
    model_config = SettingsConfigDict(
        env_file=(DOX_AGENT_ROOT.parent / ".env", DOX_AGENT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @model_validator(mode="after")
    def _derive_state_dir(self):
        if self.state_dir is None:
            object.__setattr__(self, "state_dir", Path(self.corpora_root) / ".state")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
