"""形式审查请求与规则数据模型。

单引擎：只保留指南驱动动态检查清单。legacy 手工规则（words/age/required_sections/
budget_cap）、use_model=false 路径按 2026-09-29 裁决整体删除，不保留兼容字段。
"""
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CheckExecution(BaseModel):
    field: Literal["budget", "application_budget", "organization_count", "patent_count", "university_present", "education",
                   "submitted_at", "characters", "file_bytes", "pdf_pages",
                   "section_characters", "organizations", "total_budget", "plan_interval",
                   "docx_font", "docx_font_size"]
    operator: Literal["le", "ge", "eq", "before", "on_or_before", "within"]
    value: str = Field(default="", max_length=100)
    unit: str = Field(default="", max_length=30)
    section: str = Field(default="", max_length=100)
    end: str = Field(default="", max_length=100)
    counting: Literal["visible-codepoints-v1"] = "visible-codepoints-v1"

class GuideCheck(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    category: str = Field(default="指南要求", max_length=100)
    requirement: str = Field(min_length=1, max_length=3000)
    applicability: str = Field(min_length=1, max_length=2000)
    strength: Literal["hard", "advisory", "uncertain"] = "uncertain"
    method: Literal["model", "calculation", "manual"] = "model"
    needed_materials: list[str] = Field(default_factory=list, max_length=20)
    source: str = Field(default="用户编写", max_length=5000)
    source_id: str = Field(default="", max_length=150)
    guideline_id: str = Field(default="", max_length=100)
    quote: str = Field(default="", max_length=5000)
    page: int | None = Field(default=None, ge=1)
    original: dict = Field(default_factory=dict)
    revised: bool = False
    evidence_need: Literal["internal", "comparison", "policy"] = "internal"
    enabled: bool = True
    execution: CheckExecution | None = None


class RulePack(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["formal", "professional"]
    source_kind: Literal["builtin", "manual", "upload"] = "manual"
    archived: bool = False
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    name: str = Field(min_length=1, max_length=150)
    fund: str = Field(default="", max_length=100)
    category: str = Field(default="", max_length=100)
    year: int | None = Field(default=None, ge=1990, le=2100)
    version: int = Field(default=1, ge=1)
    scope_note: str = Field(default="", max_length=2000)
    budget_source: str = Field(
        default="仅检查金额算术与文内一致性，不代表政策合规性结论。", max_length=2000
    )
    engine: Literal["guideline"] = "guideline"
    checks: list[GuideCheck] = Field(default_factory=list, max_length=100)
    missing_documents: list[str] = Field(default_factory=list, max_length=30)
    extraction_notes: list[str] = Field(default_factory=list, max_length=40)
    generation: dict = Field(default_factory=dict)
    guideline_ids: list[str] = Field(default_factory=list, max_length=5)
    confirmed: bool = False


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rule_version: int = Field(ge=1)
    document_id: str
    information_sheet_id: str | None = None
    kind: Literal["formal", "professional"]
    corpus_ids: list[str] = Field(default_factory=list, max_length=6)
    rule_id: str
    cutoff_date: date | None = None
    mode: Literal["historical", "update"] = "update"
    evidence_ids: list[str] = Field(default_factory=list, max_length=30)
    reference_count: int = Field(default=3, ge=1, le=5)

    @model_validator(mode="after")
    def scope_valid(self):
        if self.kind == "professional" and len(self.corpus_ids) != 1:
            raise ValueError("专业审查需选择一个对照资料库")
        if self.kind == "professional" and self.mode == "historical" and not self.cutoff_date:
            raise ValueError("历史评价需指定评价时点")
        if len(set(self.corpus_ids)) != len(self.corpus_ids) or len(set(self.evidence_ids)) != len(self.evidence_ids):
            raise ValueError("资料范围不能重复")
        return self


class MappingEntry(BaseModel):
    check_id: str
    block_ids: list[str] = Field(default_factory=list)
    missing: bool = False


class MappingUpdate(BaseModel):
    rule_id: str
    rule_version: int
    revision: int = Field(ge=0)
    mappings: list[MappingEntry]


class MetadataUpdate(BaseModel):
    application_budget: float | None = Field(default=None, ge=0)
    organization_count: int | None = Field(default=None, ge=0)
    patent_count: int | None = Field(default=None, ge=0)
    university_present: bool | None = None
    education: str = Field(default="", max_length=30)
    submitted_at: str = Field(default="", max_length=50)
    title: str = Field(min_length=1, max_length=200)
    birth_date: str = Field(default="", max_length=10, pattern=r"^(\d{4}-\d{2}(-\d{2})?)?$")
    domain: str = Field(default="", max_length=100)
    budget: float | None = Field(default=None, ge=0)
    year: int | None = Field(default=None, ge=1990, le=2100)
    category: str = Field(default="", max_length=100)
    fund: str = Field(default="", max_length=100)
    organizations: list[str] = Field(default_factory=list, max_length=50)
    total_budget: float | None = Field(default=None, ge=0)
    plan_start: str = Field(default="", max_length=10, pattern=r"^(\d{4}(-\d{2}(-\d{2})?)?)?$")
    plan_end: str = Field(default="", max_length=10, pattern=r"^(\d{4}(-\d{2}(-\d{2})?)?)?$")


class EvidenceInput(BaseModel):
    title: str = Field(min_length=2, max_length=400)
    published: date
    url: str = Field(pattern=r"^https?://", max_length=1500)
    summary: str = Field(min_length=15, max_length=6000)
    keywords: list[str] = Field(default_factory=list, max_length=30)


class ResearchQuery(BaseModel):
    query: str = Field(min_length=3, max_length=150)
    cutoff: date
