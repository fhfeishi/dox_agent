"""Versioned user task definitions stored with application state."""

import json
import sqlite3
from pathlib import Path
from uuid import uuid4

from .prompts import list_tasks


class TaskConflict(ValueError):
    pass


class TaskMissing(ValueError):
    pass


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
        if source is None or source_task_id not in {"task1", "task2"}:
            raise TaskMissing("首版只能复制问答或对比任务")
        task = {**source, "id": f"custom-{uuid4().hex}", "engine_task_id": source_task_id,
                "kind": "custom", "status": "draft", "revision": 1, "version": 0,
                "background": "", "goal": source["description"], "requirements": "",
                "parameter_defaults": {}}
        with self.connect() as db:
            db.execute("INSERT INTO tasks (id, draft) VALUES (?,?)", (task["id"], json.dumps(task, ensure_ascii=False)))
        return task

    def get(self, task_id: str) -> dict:
        with self.connect() as db:
            row = db.execute("SELECT draft FROM tasks WHERE id=?", (task_id,)).fetchone()
        if row is None:
            raise TaskMissing("任务不存在")
        return json.loads(row[0])

    def list(self) -> list[dict]:
        with self.connect() as db:
            rows = db.execute("SELECT draft FROM tasks ORDER BY rowid DESC").fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_draft(self, task_id: str, revision: int, changes: dict) -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT draft FROM tasks WHERE id=?", (task_id,)).fetchone()
            if row is None:
                raise TaskMissing("任务不存在")
            task = json.loads(row[0])
            if task["revision"] != revision:
                raise TaskConflict("草稿已由其他编辑更新，请刷新后重试")
            task.update(changes)
            task["revision"] += 1
            task["status"] = "draft"
            db.execute("UPDATE tasks SET draft=? WHERE id=?", (json.dumps(task, ensure_ascii=False), task_id))
        return task

    def publish(self, task_id: str, revision: int) -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT draft FROM tasks WHERE id=?", (task_id,)).fetchone()
            if row is None:
                raise TaskMissing("任务不存在")
            task = json.loads(row[0])
            if task["revision"] != revision:
                raise TaskConflict("草稿已由其他编辑更新，请刷新后重试")
            if not task["name"].strip() or not task["goal"].strip():
                raise TaskConflict("任务名称和目标不能为空")
            task["version"] += 1
            task["status"] = "published"
            db.execute("INSERT INTO versions VALUES (?,?,?)", (task_id, task["version"], json.dumps(task, ensure_ascii=False)))
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
        return json.loads(row[0])
