"""形式审查独立存储：$STATE_DIR/review/，objects 单表，进程重启时中断任务恢复。

审查材料（指南/申请书）是工作材料，与资料库语料完全隔离：不入库、不建索引、
不参与问答；本模块只服务 /api/review/* 的数据目录。
"""
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from ..core.db import connect as open_db
from ..core.db import migrate

# Set by the app at startup (routes.init_storage) from its own state directory. There is no default:
# a default from the project settings once pointed code run outside the app at the real review data.
DATA: Path | None = None

# Schema steps for review/workspace.sqlite3, append-only (src/core/db.py).
SCHEMA = [
    "CREATE TABLE IF NOT EXISTS objects (kind TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(kind,id))",
    "DELETE FROM objects WHERE kind='model_connection'",
]


def now():
    return datetime.now(UTC).isoformat()


def connect():
    if DATA is None:
        raise RuntimeError("审查存储尚未初始化：由应用启动时的 init_storage 设定数据目录")
    DATA.mkdir(parents=True, exist_ok=True)
    con = open_db(DATA / "workspace.sqlite3", timeout=20)
    con.row_factory = sqlite3.Row
    return con


def init():
    DATA.mkdir(parents=True, exist_ok=True)
    migrate(DATA / "workspace.sqlite3", SCHEMA)
    with connect() as con:
        # A process restart cannot silently leave jobs running forever.
        for row in con.execute("SELECT id,payload FROM objects WHERE kind='run'").fetchall():
            value = json.loads(row["payload"])
            if value.get("status") in ("queued", "running"):
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
