"""Versioned declarative Prompt and Skill assets. No user code is executed."""

import json
import re
import sqlite3
from pathlib import Path
from uuid import uuid4

from .prompts import TASKS, task_prompt

VARIABLE = re.compile(r"{{\s*([a-z][a-z0-9_]*)\s*}}")
ALLOWED_TOOLS = {"knowledge_search", "knowledge_read"}


class AssetMissing(ValueError):
    pass


class AssetConflict(ValueError):
    pass


class AssetInvalid(ValueError):
    pass


def builtin_prompts() -> list[dict]:
    return [{"id": f"builtin-{task['id']}", "kind": "prompt", "name": task["name"],
             "purpose": task["description"], "body": task_prompt(task["id"]), "variables": [],
             "example": task["example"], "version": 0, "revision": 0, "enabled": True,
             "archived": False, "builtin": True} for task in TASKS]


def validate_asset(asset: dict, prompt: dict | None = None) -> None:
    if not asset.get("name", "").strip() or not asset.get("purpose", "").strip():
        raise AssetInvalid("名称和用途不能为空")
    if asset["kind"] == "prompt":
        body = asset.get("body", "")
        variables = asset.get("variables", [])
        if not body.strip() or len(body) > 12000 or len(variables) != len(set(variables)):
            raise AssetInvalid("Prompt 正文或变量不合法")
        if any(not re.fullmatch(r"[a-z][a-z0-9_]*", key) for key in variables):
            raise AssetInvalid("变量只能使用小写英文、数字和下划线")
        if set(VARIABLE.findall(body)) != set(variables) or "{{" in VARIABLE.sub("", body):
            raise AssetInvalid("Prompt 正文变量与声明不一致")
    else:
        inputs = asset.get("inputs", [])
        if not asset.get("rules", "").strip() or not asset.get("output_contract", "").strip():
            raise AssetInvalid("Skill 需要执行规则和输出契约")
        if len(inputs) != len(set(inputs)) or any(not re.fullmatch(r"[a-z][a-z0-9_]*", key) for key in inputs):
            raise AssetInvalid("Skill 输入参数不合法")
        if not set(asset.get("tools", [])) <= ALLOWED_TOOLS:
            raise AssetInvalid("Skill 声明了未注册工具")
        if not asset.get("prompt_id") or type(asset.get("prompt_version")) is not int:
            raise AssetInvalid("Skill 必须绑定固定 Prompt 版本")
        if asset.get("resource_policy") not in {"local_only", "allow_selected_web"}:
            raise AssetInvalid("Skill 资料策略不合法")
        if prompt is None or prompt["kind"] != "prompt" or set(prompt.get("variables", [])) - set(inputs):
            raise AssetInvalid("Skill 输入没有覆盖 Prompt 变量，或 Prompt 版本不存在")


def render_skill(skill: dict, prompt: dict, inputs: dict) -> str:
    if set(inputs) != set(skill["inputs"]):
        raise AssetInvalid("测试输入与 Skill 参数不一致")
    if any(not isinstance(value, str) or len(value) > 500 for value in inputs.values()):
        raise AssetInvalid("测试输入必须是 500 字以内的文本")
    body = VARIABLE.sub(lambda match: inputs[match.group(1)], prompt["body"])
    return f"{body}\n\n执行规则：{skill['rules']}\n输出契约：{skill['output_contract']}"


class PromptSkillStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, draft TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS versions (id TEXT NOT NULL, version INTEGER NOT NULL, definition TEXT NOT NULL, PRIMARY KEY(id,version))")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def list(self, include_archived: bool = False) -> list[dict]:
        with self.connect() as db:
            rows = db.execute("SELECT draft FROM assets ORDER BY rowid DESC").fetchall()
        items = builtin_prompts() + [json.loads(row[0]) for row in rows]
        return items if include_archived else [item for item in items if not item.get("archived")]

    def get(self, asset_id: str) -> dict:
        builtin = next((item for item in builtin_prompts() if item["id"] == asset_id), None)
        if builtin:
            return builtin
        with self.connect() as db:
            row = db.execute("SELECT draft FROM assets WHERE id=?", (asset_id,)).fetchone()
        if not row:
            raise AssetMissing("Prompt / Skill 不存在")
        return json.loads(row[0])

    def version(self, asset_id: str, version: int) -> dict:
        if version == 0:
            item = self.get(asset_id)
            if item.get("builtin"):
                return item
        with self.connect() as db:
            row = db.execute("SELECT definition FROM versions WHERE id=? AND version=?", (asset_id, version)).fetchone()
        if not row:
            raise AssetMissing("指定版本尚未启用")
        return json.loads(row[0])

    def create(self, kind: str, source_id: str | None = None) -> dict:
        if kind not in {"prompt", "skill"}:
            raise AssetInvalid("未知资产类型")
        source = self.get(source_id) if source_id else None
        if source and source["kind"] != kind:
            raise AssetInvalid("只能复制同类资产")
        asset = {**(source or {}), "id": f"{kind}-{uuid4().hex}", "kind": kind,
                 "builtin": False, "enabled": False, "archived": False, "revision": 1, "version": 0}
        if not source:
            asset.update({"name": "新 Prompt" if kind == "prompt" else "新 Skill", "purpose": "待填写"})
            if kind == "prompt":
                asset.update(body="", variables=[], example="")
            else:
                asset.update(rules="", inputs=[], prompt_id="", prompt_version=0,
                             tools=[], resource_policy="local_only", output_contract="", test_inputs={})
        with self.connect() as db:
            db.execute("INSERT INTO assets VALUES (?,?)", (asset["id"], json.dumps(asset, ensure_ascii=False)))
        return asset

    def save(self, asset_id: str, revision: int, changes: dict) -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT draft FROM assets WHERE id=?", (asset_id,)).fetchone()
            if not row:
                raise AssetMissing("自定义资产不存在")
            item = json.loads(row[0])
            if item["archived"] or item["revision"] != revision:
                raise AssetConflict("草稿已变化或归档，请刷新")
            item.update(changes)
            item["revision"] += 1
            item["enabled"] = False
            db.execute("UPDATE assets SET draft=? WHERE id=?", (json.dumps(item, ensure_ascii=False), asset_id))
        return item

    def publish(self, asset_id: str, revision: int) -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT draft FROM assets WHERE id=?", (asset_id,)).fetchone()
            if not row:
                raise AssetMissing("自定义资产不存在")
            item = json.loads(row[0])
            if item["archived"] or item["revision"] != revision:
                raise AssetConflict("草稿已变化或归档，请刷新")
            prompt = None
            if item["kind"] == "skill":
                try:
                    prompt = self.version(item["prompt_id"], item["prompt_version"])
                    current_prompt = self.get(item["prompt_id"])
                except (AssetMissing, KeyError) as exc:
                    raise AssetInvalid("Prompt 指定版本不存在") from exc
                if not current_prompt["enabled"] or current_prompt["archived"]:
                    raise AssetInvalid("只能使用已启用的 Prompt")
            validate_asset(item, prompt)
            item["version"] += 1
            item["enabled"] = True
            item["published_revision"] = item["revision"]
            db.execute("INSERT INTO versions VALUES (?,?,?)", (asset_id, item["version"], json.dumps(item, ensure_ascii=False)))
            db.execute("UPDATE assets SET draft=? WHERE id=?", (json.dumps(item, ensure_ascii=False), asset_id))
        return item

    def set_enabled(self, asset_id: str, enabled: bool) -> dict:
        item = self.get(asset_id)
        if item.get("builtin") or (enabled and (not item["version"] or
                                                      item["revision"] != item.get("published_revision") or
                                                      item["archived"])):
            raise AssetInvalid("内置项只读；草稿不能启用")
        item["enabled"] = enabled
        with self.connect() as db:
            db.execute("UPDATE assets SET draft=? WHERE id=?", (json.dumps(item, ensure_ascii=False), asset_id))
        return item

    def archive(self, asset_id: str) -> dict:
        item = self.get(asset_id)
        if item.get("builtin"):
            raise AssetInvalid("内置项只读")
        item["archived"] = True
        item["enabled"] = False
        with self.connect() as db:
            db.execute("UPDATE assets SET draft=? WHERE id=?", (json.dumps(item, ensure_ascii=False), asset_id))
        return item
