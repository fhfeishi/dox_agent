"""Small local workspace; notes are versioned source navigation, never evidence."""

import json
import sqlite3
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .knowledge import Document, Page, tokens

router = APIRouter(prefix="/api")


class Record(BaseModel):
    revision: int = Field(default=0, ge=0)
    title: str = Field(min_length=1, max_length=200)
    data: dict


class Workspace:
    def __init__(self, path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT, revision INTEGER, payload TEXT)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def list(self, kind):
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute("SELECT payload FROM records WHERE kind=? ORDER BY rowid DESC", (kind,))]

    def put(self, kind, key, record):
        payload = {"id": key, **record.model_dump(), "revision": record.revision + 1,
                   "updated_at": datetime.now(UTC).isoformat()}
        serialized = json.dumps(payload, ensure_ascii=False)
        if len(serialized.encode()) > 4_000_000:
            raise HTTPException(413, "单个会话或笔记超过保存大小限制，请新建会话")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT revision, kind FROM records WHERE id=?", (key,)).fetchone()
            if (old and old != (record.revision, kind)) or (not old and record.revision != 0):
                raise HTTPException(409, "内容已在其他页面更新，请刷新后继续，当前内容未覆盖")
            db.execute("INSERT OR REPLACE INTO records VALUES (?, ?, ?, ?)", (key, kind, payload["revision"], serialized))
        return payload


def note_status(note, knowledge):
    refs = note["data"].get("sources", [])
    status = "current" if refs else "unverified"
    for ref in refs:
        try:
            if knowledge.get(ref["doc_id"])["version"] != ref["version"]:
                status = "stale"
        except KeyError:
            return "missing"
    return status


def note_locators(workspace, knowledge, query, allowed):
    matches = []
    for note in workspace.list("notes"):
        if not note["data"].get("reviewed") or note_status(note, knowledge) != "current":
            continue
        if not set(tokens(query)).intersection(tokens(note["title"] + " " + note["data"].get("body", ""))):
            continue
        for ref in note["data"]["sources"]:
            if allowed is None or ref["doc_id"] in allowed:
                matches.append(ref)
    return matches[:2]


@router.get("/workspace/{kind}")
def list_records(kind: str, request: Request):
    if kind not in ("sessions", "notes"):
        raise HTTPException(404)
    records = request.app.state.workspace.list(kind)
    if kind == "notes":
        for record in records:
            record["source_status"] = note_status(record, request.app.state.knowledge)
    return records


@router.put("/workspace/{kind}/{key}")
def save_record(kind: str, key: str, record: Record, request: Request):
    if kind not in ("sessions", "notes") or len(key) > 80:
        raise HTTPException(404)
    if kind == "notes":
        data = record.data
        if not isinstance(data.get("body"), str) or len(data["body"]) > 20000 or not isinstance(data.get("reviewed"), bool):
            raise HTTPException(422, "笔记内容或确认状态无效")
        sources = data.get("sources", [])
        if not isinstance(sources, list) or not 1 <= len(sources) <= 6:
            raise HTTPException(422, "笔记需要1至6个原文来源")
        for ref in sources:
            try:
                request.app.state.knowledge.read(ref["doc_id"], ref.get("page", 1), ref.get("start_line", 1), 1, ref["version"])
            except (KeyError, ValueError, TypeError) as exc:
                raise HTTPException(422, "原文已更新或引用无效，请重新查证后保存") from exc
    return request.app.state.workspace.put(kind, key, record)


class TextImport(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    origin: str = Field(default="", max_length=4000)
    text: str = Field(min_length=1, max_length=500000)


@router.post("/ingest/text")
async def import_text(payload: TextImport, request: Request):
    import asyncio

    if request.app.state.preparation == "running":
        raise HTTPException(409, "知识库正在初始化，请稍后补充")
    async with request.app.state.import_lock:
        doc = Document(title=payload.title, origin=payload.origin.strip() or "manual:" + uuid4().hex,
                       kind="text", parser="manual", pages=[Page(number=1, text=payload.text)])
        try:
            result = await asyncio.to_thread(request.app.state.knowledge.put, doc)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        if request.app.state.preparation == "error":
            request.app.state.preparation = "ready"
        return result
