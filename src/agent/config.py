"""Configuration shared by local parsing, API models and the agent."""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from .routing import EvidenceLevel, QueryRouting

DOX_AGENT_ROOT = Path(__file__).resolve().parents[2]
KNOWLEDGE_ROOT = DOX_AGENT_ROOT.parent / "knowledge"


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
    data_dir: Path = DOX_AGENT_ROOT / "data"
    embedding_path: str = ""
    embedding_device: str = "cpu"
    embedding_query_prompt: str = ""
    knowledge_root: Path = KNOWLEDGE_ROOT
    text_root: Path = KNOWLEDGE_ROOT / "project_progress/texts/v4"
    web_provider: str = "crawl4ai"
    web_sessions_file: Path | None = None
    firecrawl_api_key: SecretStr | None = None
    firecrawl_base_url: str = "https://api.firecrawl.dev"
    pdf_ocr: bool = True
    pdf_ocr_language: str = "eng"
    max_research_steps: int = Field(default=24, ge=4, le=100)
    max_rounds: int = Field(default=2, ge=1, le=3)
    quick_verification: bool = True
    evidence_routing: bool = True
    query_routing: QueryRouting = "auto"
    evidence_level: EvidenceLevel = "middle"
    max_searches: int = Field(default=6, ge=1, le=20)
    max_reads: int = Field(default=8, ge=2, le=20)
    max_model_calls: int = Field(default=12, ge=3, le=40)
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
