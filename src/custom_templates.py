"""W4-B: versioned user output-template definitions stored with application state.

A template is a product-level Markdown section structure plus an optional variable contract.
Built-in templates (``src/templates/*.md``) stay the read-only source and can be copied into a
custom draft; editing an already published custom template produces a new draft, and publishing
appends an immutable version so old reports keep reading their original structure.
"""

import json
import re
import sqlite3
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .prompts import list_templates, report_template

# Variables a template may declare; they can only reference declared report parameters.
TEMPLATE_VARIABLES = ("domain", "year_range", "year_from", "year_to", "fund_type", "focus")


class TemplateConflict(ValueError):
    pass


class TemplateMissing(ValueError):
    pass


class TemplateInvalid(ValueError):
    pass


class OutputTemplate(BaseModel):
    """A bounded Markdown structure; templates cannot add execution or capability fields."""

    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    purpose: str = Field(default="", max_length=500)
    content: str = Field(min_length=1, max_length=20000)
    variables: list[str] = Field(default_factory=list, max_length=len(TEMPLATE_VARIABLES))

    @model_validator(mode="after")
    def check_definition(self):
        if len(self.variables) != len(set(self.variables)):
            raise ValueError("模板变量不能重复")
        unknown = set(self.variables) - set(TEMPLATE_VARIABLES)
        if unknown:
            raise ValueError(f"模板只能引用已声明的报告参数：{', '.join(sorted(unknown))}")
        used = set(re.findall(r"\{\{\s*([a-z_]+)\s*\}\}", self.content))
        if used - set(self.variables):
            raise ValueError(f"模板正文引用了未声明的变量：{', '.join(sorted(used - set(self.variables)))}")
        if set(self.variables) - used:
            raise ValueError(f"声明但未使用的变量：{', '.join(sorted(set(self.variables) - used))}")
        if not re.search(r"^#{1,6}\s+\S", self.content, re.MULTILINE):
            raise ValueError("模板正文至少需要一个章节标题")
        return self


def render_template(content: str, values: dict) -> str:
    """Substitute declared ``{{var}}`` slots; declared variables are validated before publish."""
    def replace(match: "re.Match[str]") -> str:
        value = values.get(match.group(1))
        return str(value) if value not in (None, "") else "（未指定）"

    return re.sub(r"\{\{\s*([a-z_]+)\s*\}\}", replace, content)


class TemplateStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, draft TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS versions (template_id TEXT NOT NULL, version INTEGER NOT NULL, "
                       "definition TEXT NOT NULL, PRIMARY KEY (template_id, version))")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def copy_builtin(self, source_template_id: str) -> dict:
        source = next((item for item in list_templates() if item["id"] == source_template_id), None)
        if source is None:
            raise TemplateMissing("只能复制内置报告模板")
        template = {"id": f"custom-{uuid4().hex}", "kind": "custom", "status": "draft", "revision": 1,
                    "version": 0, "source_template_id": source_template_id,
                    "name": f"{source['name']}（副本）", "purpose": "", "variables": [],
                    "content": report_template(source_template_id)}
        with self.connect() as db:
            db.execute("INSERT INTO templates (id, draft) VALUES (?,?)",
                       (template["id"], json.dumps(template, ensure_ascii=False)))
        return template

    def get(self, template_id: str) -> dict:
        with self.connect() as db:
            row = db.execute("SELECT draft FROM templates WHERE id=?", (template_id,)).fetchone()
        if row is None:
            raise TemplateMissing("模板不存在")
        return json.loads(row[0])

    def list(self) -> list[dict]:
        with self.connect() as db:
            rows = db.execute("SELECT draft FROM templates ORDER BY rowid DESC").fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_draft(self, template_id: str, revision: int, changes: dict) -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT draft FROM templates WHERE id=?", (template_id,)).fetchone()
            if row is None:
                raise TemplateMissing("模板不存在")
            template = json.loads(row[0])
            if template["revision"] != revision:
                raise TemplateConflict("草稿已由其他编辑更新，请刷新后重试")
            template.update(changes)
            OutputTemplate.model_validate({k: template[k] for k in ("name", "purpose", "content", "variables")})
            template["revision"] += 1
            template["status"] = "draft"
            db.execute("UPDATE templates SET draft=? WHERE id=?",
                       (json.dumps(template, ensure_ascii=False), template_id))
        return template

    def publish(self, template_id: str, revision: int) -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT draft FROM templates WHERE id=?", (template_id,)).fetchone()
            if row is None:
                raise TemplateMissing("模板不存在")
            template = json.loads(row[0])
            if template["revision"] != revision:
                raise TemplateConflict("草稿已由其他编辑更新，请刷新后重试")
            OutputTemplate.model_validate({k: template[k] for k in ("name", "purpose", "content", "variables")})
            template["version"] += 1
            template["status"] = "published"
            db.execute("INSERT INTO versions VALUES (?,?,?)",
                       (template_id, template["version"], json.dumps(template, ensure_ascii=False)))
            db.execute("UPDATE templates SET draft=? WHERE id=?",
                       (json.dumps(template, ensure_ascii=False), template_id))
        return template

    def version(self, template_id: str, version: int | None = None) -> dict:
        with self.connect() as db:
            if version is None:
                row = db.execute("SELECT definition FROM versions WHERE template_id=? "
                                 "ORDER BY version DESC LIMIT 1", (template_id,)).fetchone()
            else:
                row = db.execute("SELECT definition FROM versions WHERE template_id=? AND version=?",
                                 (template_id, version)).fetchone()
        if row is None:
            raise TemplateMissing("模板尚未发布或版本不存在")
        return json.loads(row[0])
