"""形式审查独立存储：$STATE_DIR/review/，objects 单表，进程重启时中断任务恢复。

审查材料（指南/申请书）是工作材料，与知识库语料完全隔离：不入库、不建索引、
不参与问答；本模块只服务 /api/review/* 的数据目录。
"""
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from ..agent.config import get_settings

DATA = (Path(get_settings().state_dir) / "review").resolve()


def now():
    return datetime.now(UTC).isoformat()


def connect():
    DATA.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DATA / "workspace.sqlite3", timeout=20)
    con.row_factory = sqlite3.Row
    return con


def init():
    with connect() as con:
        con.execute(
            "CREATE TABLE IF NOT EXISTS objects (kind TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(kind,id))"
        )
        # A process restart cannot silently leave jobs running forever.
        for row in con.execute("SELECT id,payload FROM objects WHERE kind='run'").fetchall():
            value = json.loads(row["payload"])
            if value.get("status") == "running":
                value.update(status="failed", error="服务重启中断了本次审核，请重新运行。")
                con.execute(
                    "UPDATE objects SET payload=? WHERE kind='run' AND id=?",
                    (json.dumps(value, ensure_ascii=False), row["id"]),
                )
        for row in con.execute("SELECT id,payload FROM objects WHERE kind='document'").fetchall():
            value = json.loads(row["payload"])
            if value.get("metadata_extraction", {}).get("status") == "running":
                value["metadata_extraction"].update(
                    status="failed", error="服务重启中断了基本信息提取；请点击重新提取。"
                )
                con.execute(
                    "UPDATE objects SET payload=? WHERE kind='document' AND id=?",
                    (json.dumps(value, ensure_ascii=False), row["id"]),
                )
    for folder in ("uploads", "guidelines", "reports"):
        (DATA / folder).mkdir(parents=True, exist_ok=True)


def save(kind, value):
    with connect() as con:
        con.execute(
            "INSERT INTO objects VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,updated=excluded.updated",
            (kind, value["id"], json.dumps(value, ensure_ascii=False), now()),
        )
    return value


def get(kind, id):
    with connect() as con:
        row = con.execute("SELECT payload FROM objects WHERE kind=? AND id=?", (kind, id)).fetchone()
    return json.loads(row["payload"]) if row else None


def all_items(kind):
    with connect() as con:
        rows = con.execute(
            "SELECT payload FROM objects WHERE kind=? ORDER BY updated DESC", (kind,)
        ).fetchall()
    return [json.loads(row["payload"]) for row in rows]
