"""形式审查请求与规则数据模型。

单引擎：只保留指南驱动动态检查清单。legacy 手工规则（words/age/required_sections/
budget_cap）、use_model=false 路径按 2026-09-29 裁决整体删除，不保留兼容字段。
"""
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class GuideCheck(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    category: str = Field(default="指南要求", max_length=100)
    requirement: str = Field(min_length=1, max_length=3000)
    applicability: str = Field(min_length=1, max_length=2000)
    strength: Literal["hard", "advisory", "uncertain"] = "uncertain"
    method: Literal["model", "calculation", "manual"] = "model"
    needed_materials: list[str] = Field(default_factory=list, max_length=20)
    source: str = Field(min_length=1, max_length=5000)
    source_id: str = Field(min_length=1, max_length=150)
    guideline_id: str = Field(min_length=1, max_length=100)
    quote: str = Field(min_length=1, max_length=5000)
    page: int = Field(ge=1)
    enabled: bool = True


class RulePack(BaseModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    name: str = Field(min_length=1, max_length=150)
    fund: str = Field(default="", max_length=100)
    category: str = Field(default="", max_length=100)
    year: int = Field(ge=1990, le=2100)
    version: int = Field(default=1, ge=1)
    scope_note: str = Field(max_length=2000)
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
    document_id: str
    rule_id: str
    cutoff_date: date
    mode: Literal["historical", "update"] = "historical"
    evidence_ids: list[str] = Field(default_factory=list, max_length=30)


class MetadataUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    birth_date: str = Field(default="", max_length=10, pattern=r"^(\d{4}-\d{2}(-\d{2})?)?$")
    domain: str = Field(default="", max_length=100)
    budget: float | None = Field(default=None, ge=0)
    year: int | None = Field(default=None, ge=1990, le=2100)
    category: str = Field(default="", max_length=100)
    fund: str = Field(default="", max_length=100)


class EvidenceInput(BaseModel):
    title: str = Field(min_length=2, max_length=400)
    published: date
    url: str = Field(pattern=r"^https?://", max_length=1500)
    summary: str = Field(min_length=15, max_length=6000)
    keywords: list[str] = Field(default_factory=list, max_length=30)


class ResearchQuery(BaseModel):
    query: str = Field(min_length=3, max_length=150)
    cutoff: date
