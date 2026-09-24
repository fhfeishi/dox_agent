"""Versioned user task definitions stored with application state."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .custom_templates import TemplateMissing, TemplateStore
from .prompt_skills import AssetMissing, PromptSkillStore, validate_asset
from .prompts import REPORT_TEMPLATES, list_tasks


class TaskConflict(ValueError):
    pass


class TaskMissing(ValueError):
    pass


class TaskInvalid(ValueError):
    pass


RESERVED_KEYS = {"task_id", "task_version", "corpus_id", "corpus_ids", "allowed_doc_ids",
                 "model", "resource_policy", "output_intent", "run_id"}


class TaskParameter(BaseModel):
    """A bounded, declarative input; task definitions cannot grant runtime capabilities."""

    model_config = ConfigDict(extra="forbid")
    key: str = Field(min_length=1, max_length=40, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(min_length=1, max_length=80)
    type: str = Field(pattern=r"^(text|integer|enum|boolean|year_range)$")
    help: str = Field(default="", max_length=500)
    required: bool = False
    options: list[str] = Field(default_factory=list, max_length=20)
    default: object | None = None

    @model_validator(mode="after")
    def check_definition(self):
        if self.key in RESERVED_KEYS:
            raise ValueError("参数名称不能覆盖运行范围或权限字段")
        if self.type == "enum":
            if not self.options or len(self.options) != len(set(self.options)) or any(
                not value or len(value) > 80 for value in self.options
            ):
                raise ValueError("枚举参数需要不重复的非空选项")
        elif self.options:
            raise ValueError("只有枚举参数可以设置选项")
        if "default" in self.model_fields_set and self.default is not None:
            self.validate_value(self.default)
        return self

    def validate_value(self, value: object) -> None:
        valid = (
            self.type == "text" and isinstance(value, str) and len(value) <= 500
            or self.type == "integer" and type(value) is int and -1_000_000 <= value <= 1_000_000
            or self.type == "enum" and isinstance(value, str) and value in self.options
            or self.type == "boolean" and type(value) is bool
            or self.type == "year_range" and isinstance(value, dict)
            and set(value) == {"from", "to"} and all(type(year) is int and 1900 <= year <= 2100
                                                       for year in value.values())
            and value["from"] <= value["to"]
        )
        if not valid:
            raise ValueError(f"参数「{self.label}」的值与类型或选项不匹配")


def resolve_task_params(definition: dict, supplied: dict[str, object]) -> tuple[dict, dict]:
    """Resolve the published contract; caller combines it with non-task run context."""
    legacy = definition.get("parameter_defaults", {})
    schema = [TaskParameter.model_validate(item) for item in definition.get("parameters", [])]
    known = set(legacy) | {item.key for item in schema}
    if unknown := set(supplied) - known:
        raise ValueError(f"任务没有这些输入参数：{', '.join(sorted(unknown))}")
    values = {**legacy}
    sources = {key: "task_default" for key in legacy}
    for item in schema:
        if item.key in supplied:
            item.validate_value(supplied[item.key])
            values[item.key] = supplied[item.key]
            sources[item.key] = "user"
        elif item.default is not None:
            values[item.key] = item.default
            sources[item.key] = "task_default"
        elif item.required:
            raise ValueError(f"请填写必填参数「{item.label}」")
    for key in set(supplied) & set(legacy):
        if not isinstance(supplied[key], str) or len(supplied[key]) > 500:
            raise ValueError(f"参数「{key}」须为 500 字以内的文本")
        values[key] = supplied[key]
        sources[key] = "user"
    return values, sources


def normalize_task(task: dict) -> dict:
    value = dict(task)
    value.setdefault("background", "")
    value.setdefault("category", "")
    value.setdefault("requirements", "")
    value.setdefault("boundaries", "")
    value.setdefault("clarification_conditions", "")
    value.setdefault("output_instructions", "")
    value.setdefault("parameter_defaults", {})
    value.setdefault("parameters", [])
    value.setdefault("revision", 1)
    value.setdefault("version", 0)
    value["archived"] = bool(value.get("archived", False))
    if value.get("status") not in {"draft", "published"}:
        value["status"] = "published" if value.get("version", 0) > 0 else "draft"
    return value


class CustomTaskStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, draft TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS versions (task_id TEXT NOT NULL, version INTEGER NOT NULL, "
                       "definition TEXT NOT NULL, PRIMARY KEY (task_id, version))")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def copy_builtin(self, source_task_id: str) -> dict:
        source = next((item for item in list_tasks() if item["id"] == source_task_id), None)
        if source is not None and source_task_id in {"task1", "task2", "task4"}:
            task = {**source, "id": f"custom-{uuid4().hex}", "engine_task_id": source_task_id,
                    "kind": "custom", "status": "draft", "revision": 1, "version": 0,
                    "background": "", "goal": source["description"], "requirements": "",
                    "parameter_defaults": {}, "parameters": []}
            if source_task_id == "task4":
                task["report_template_id"] = ""
                task["report_template_version"] = 0
        else:
            source = normalize_task(self.get(source_task_id))
            task = {**source, "id": f"custom-{uuid4().hex}", "kind": "custom", "status": "draft",
                    "revision": 1, "version": 0, "archived": False}
        task = normalize_task(task)
        with self.connect() as db:
            db.execute("INSERT INTO tasks (id, draft) VALUES (?,?)", (task["id"], json.dumps(task, ensure_ascii=False)))
        return task

    def get(self, task_id: str) -> dict:
        with self.connect() as db:
            row = db.execute("SELECT draft FROM tasks WHERE id=?", (task_id,)).fetchone()
        if row is None:
            raise TaskMissing("任务不存在")
        return normalize_task(json.loads(row[0]))

    def list(self, *, include_archived: bool = False) -> list[dict]:
        with self.connect() as db:
            rows = db.execute("SELECT draft FROM tasks ORDER BY rowid DESC").fetchall()
        items = [normalize_task(json.loads(row[0])) for row in rows]
        return items if include_archived else [item for item in items if not item["archived"]]

    def referenced_by_skill(self, skill_id: str) -> list[str]:
        with self.connect() as db:
            drafts = db.execute("SELECT draft FROM tasks").fetchall()
            versions = db.execute("SELECT definition FROM versions").fetchall()
        return sorted({item["id"] for (raw,) in drafts + versions
                       if (item := json.loads(raw)).get("skill_id") == skill_id})

    def save_draft(self, task_id: str, revision: int, changes: dict) -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT draft FROM tasks WHERE id=?", (task_id,)).fetchone()
            if row is None:
                raise TaskMissing("任务不存在")
            task = normalize_task(json.loads(row[0]))
            if task["archived"]:
                raise TaskConflict("已归档任务不能编辑")
            if task["revision"] != revision:
                raise TaskConflict("草稿已由其他编辑更新，请刷新后重试")
            task.update(changes)
            keys = [item["key"] for item in task.get("parameters", [])]
            if len(keys) != len(set(keys)) or set(keys) & task.get("parameter_defaults", {}).keys():
                raise TaskInvalid("参数名称重复或与旧文本默认值冲突")
            task["revision"] += 1
            task["status"] = "draft"
            db.execute("UPDATE tasks SET draft=? WHERE id=?", (json.dumps(task, ensure_ascii=False), task_id))
        return task

    def _validate_report_binding(self, task: dict) -> None:
        if task.get("engine_task_id") != "task4":
            return
        template_id = task.get("report_template_id")
        version = task.get("report_template_version")
        if not isinstance(template_id, str) or not template_id.strip() or type(version) is not int:
            raise TaskInvalid("报告型任务必须绑定显式报告模板 id 和 version")
        if template_id in REPORT_TEMPLATES:
            if version != 0:
                raise TaskInvalid("内置报告模板的 version 必须为 0")
            return
        store = TemplateStore(self.path.parent / "custom_templates.sqlite3")
        try:
            if store.get(template_id)["archived"]:
                raise TaskInvalid("已归档模板不能绑定到新任务")
            store.version(template_id, version)
        except TemplateMissing as exc:
            raise TaskInvalid("报告模板尚未发布指定 version") from exc

    def publish(self, task_id: str, revision: int) -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT draft FROM tasks WHERE id=?", (task_id,)).fetchone()
            if row is None:
                raise TaskMissing("任务不存在")
            task = normalize_task(json.loads(row[0]))
            if task["archived"]:
                raise TaskConflict("已归档任务不能发布")
            if task["revision"] != revision:
                raise TaskConflict("草稿已由其他编辑更新，请刷新后重试")
            if not task["name"].strip() or not task["goal"].strip():
                raise TaskInvalid("任务名称和目标不能为空")
            self._validate_report_binding(task)
            skill_id = task.get("skill_id")
            if skill_id:
                if task.get("engine_task_id") == "task4":
                    raise TaskInvalid("报告型任务暂不支持 Skill；请使用对话型任务")
                store = PromptSkillStore(self.path.parent / "prompt_skills.sqlite3")
                try:
                    current = store.get(skill_id)
                    skill = store.version(skill_id, task.get("skill_version"))
                    prompt = store.version(skill["prompt_id"], skill["prompt_version"])
                except (AssetMissing, TypeError) as exc:
                    raise TaskInvalid("Skill 或 Prompt 指定版本不存在") from exc
                if current["kind"] != "skill" or current["archived"] or not current["enabled"]:
                    raise TaskInvalid("只能绑定已启用的 Skill")
                try:
                    validate_asset(skill, prompt)
                except ValueError as exc:
                    raise TaskInvalid(str(exc)) from exc
                # The current graph has a fixed retrieval path. A Skill cannot remove a tool
                # that this engine will still use; reject the binding instead of implying isolation.
                required_tools = ({"knowledge_search", "knowledge_read"}
                                  if task.get("engine_task_id") in {"task2", "task3"}
                                  else {"knowledge_search"})
                if not required_tools <= set(skill["tools"]):
                    raise TaskInvalid("Skill 允许工具未覆盖该任务固定执行路径")
                if set(skill["inputs"]) - ({item["key"] for item in task.get("parameters", [])}
                                            | set(task.get("parameter_defaults", {}))):
                    raise TaskInvalid("任务输入未覆盖 Skill 参数")
                if any(item["key"] in skill["inputs"] and item["type"] != "text"
                       for item in task.get("parameters", [])):
                    raise TaskInvalid("首版 Skill 输入仅支持文本任务参数")
                if any(item["key"] in skill["inputs"] and not item.get("required")
                       and item.get("default") is None for item in task.get("parameters", [])):
                    raise TaskInvalid("Skill 输入必须是任务必填参数或有默认值")
                # Freeze both referenced definitions. Later edits or archives must not rewrite a published task.
                task["skill_snapshot"] = {"skill": skill, "prompt": prompt}
            else:
                task.pop("skill_snapshot", None)
            task["version"] += 1
            task["status"] = "published"
            db.execute("INSERT INTO versions VALUES (?,?,?)", (task_id, task["version"], json.dumps(task, ensure_ascii=False)))
            db.execute("UPDATE tasks SET draft=? WHERE id=?", (json.dumps(task, ensure_ascii=False), task_id))
        return task

    def archive(self, task_id: str) -> dict:
        return self._set_archived(task_id, True)

    def restore(self, task_id: str) -> dict:
        return self._set_archived(task_id, False)

    def _set_archived(self, task_id: str, archived: bool) -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT draft FROM tasks WHERE id=?", (task_id,)).fetchone()
            if row is None:
                raise TaskMissing("任务不存在")
            task = normalize_task(json.loads(row[0]))
            task["archived"] = archived
            db.execute("UPDATE tasks SET draft=? WHERE id=?", (json.dumps(task, ensure_ascii=False), task_id))
        return task

    def version(self, task_id: str, version: int | None = None) -> dict:
        with self.connect() as db:
            if version is None:
                row = db.execute("SELECT definition FROM versions WHERE task_id=? ORDER BY version DESC LIMIT 1", (task_id,)).fetchone()
            else:
                row = db.execute("SELECT definition FROM versions WHERE task_id=? AND version=?", (task_id, version)).fetchone()
        if row is None:
            raise TaskMissing("任务尚未发布或版本不存在")
        return normalize_task(json.loads(row[0]))
