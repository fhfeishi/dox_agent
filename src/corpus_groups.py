"""Single-level presentation groups. One revision protects atomic membership moves."""

import json
import sqlite3
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .agent.corpora import scan_corpora

router = APIRouter(prefix="/api/corpus-groups")


class Change(BaseModel):
    revision: int = Field(ge=0)
    action: str
    group_id: str = ""
    name: str = Field(default="", max_length=80)
    corpus_id: str = ""


class GroupStore:
    def __init__(self, path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS corpus_groups (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER, payload TEXT)"
            )
            db.execute("INSERT OR IGNORE INTO corpus_groups VALUES (1,0,'[]')")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def get(self):
        with self.connect() as db:
            revision, payload = db.execute("SELECT revision,payload FROM corpus_groups WHERE id=1").fetchone()
        return {"revision": revision, "groups": json.loads(payload)}

    def change(self, change, known):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            revision, payload = db.execute("SELECT revision,payload FROM corpus_groups WHERE id=1").fetchone()
            if revision != change.revision:
                raise HTTPException(409, "分组已在其他页面更新，请刷新后重试")
            groups = json.loads(payload)
            group = next((g for g in groups if g["id"] == change.group_id), None)
            if change.action == "create":
                if not change.name.strip():
                    raise HTTPException(422, "请输入分组名称")
                groups.append({"id": uuid4().hex, "name": change.name.strip(), "members": []})
            elif change.action == "rename":
                if not group:
                    raise HTTPException(404, "分组不存在")
                if not change.name.strip():
                    raise HTTPException(422, "请输入分组名称")
                group["name"] = change.name.strip()
            elif change.action == "dissolve":
                if not group:
                    raise HTTPException(404, "分组不存在")
                groups.remove(group)
            elif change.action == "move":
                if change.group_id and not group:
                    raise HTTPException(404, "分组不存在")
                if change.group_id and change.corpus_id not in known:
                    raise HTTPException(422, "知识库不存在")
                for item in groups:
                    item["members"] = [cid for cid in item["members"] if cid != change.corpus_id]
                if group:
                    group["members"].append(change.corpus_id)
            else:
                raise HTTPException(422, "未知分组操作")
            db.execute(
                "UPDATE corpus_groups SET revision=?,payload=? WHERE id=1",
                (revision + 1, json.dumps(groups, ensure_ascii=False)),
            )
        return {"revision": revision + 1, "groups": groups}


@router.get("")
def list_groups(request: Request):
    return request.app.state.corpus_groups.get()


@router.post("")
def change_groups(change: Change, request: Request):
    return request.app.state.corpus_groups.change(
        change, {c.id for c in scan_corpora(request.app.state.settings)}
    )
