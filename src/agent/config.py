"""Configuration shared by local parsing, API models and the agent."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

DOX_AGENT_ROOT = Path(__file__).resolve().parents[2]
# 方案 A（每个直接子目录 = 一个自包含知识库）：
# .knowledge/<corpus>/ 内含 source/（原始文件）、datadb/（sqlite）、vectordb/（向量库）。
KNOWLEDGE_ROOT = DOX_AGENT_ROOT / ".knowledge"

# K4: OCR mode/language are runtime-configurable and persisted outside .env.
OCR_MODES = ("off", "force", "auto")
OCR_LANGUAGES = ("eng", "chi_sim", "chi_sim+eng")
OCR_CONFIG_FILENAME = "ocr.json"


def load_ocr_config(state_dir: Path) -> dict:
    try:
        data = json.loads((state_dir / OCR_CONFIG_FILENAME).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def save_ocr_config(state_dir: Path, mode: str, language: str) -> None:
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / OCR_CONFIG_FILENAME).write_text(
        json.dumps({"mode": mode, "language": language}, ensure_ascii=False, indent=2), encoding="utf-8")


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
    # 当前活动库（默认库）的 sqlite 目录；缺省落在仓库内 data/。
    data_dir: Path = DOX_AGENT_ROOT / "data"
    # 活动库的向量库目录（与 DATA_DIR 分离时使用）；缺省为 DATA_DIR/chroma。
    vectordb_dir: Path | None = None
    # K0: 应用级状态目录（会话/笔记），独立于当前活动语料；切换/删除库不移动历史会话。
    state_dir: Path = DOX_AGENT_ROOT / "data"
    # 语料根：其下每个直接子目录是一个自包含知识库（source/datadb/vectordb）。
    corpora_root: Path = KNOWLEDGE_ROOT
    embedding_path: str = ""
    embedding_device: str = "cpu"
    embedding_query_prompt: str = ""
    knowledge_root: Path = KNOWLEDGE_ROOT
    # 新布局下 txt/md 与 PDF 同在 .knowledge 各库内，故默认与 KNOWLEDGE_ROOT 一致。
    text_root: Path = KNOWLEDGE_ROOT
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
    # K2: OCR tiers. off = text layer only; force = always OCR; auto = OCR only text-less pages.
    pdf_ocr_mode: Literal["off", "force", "auto"] = "auto"
    pdf_ocr_language: str = "chi_sim+eng"
    # K3: liteparse internal workers (0 = library default).
    pdf_num_workers: int = 0
    max_research_steps: int = Field(default=24, ge=4, le=100)
    max_rounds: int = Field(default=2, ge=1, le=3)
    quick_verification: bool = True
    evidence_routing: bool = True
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
