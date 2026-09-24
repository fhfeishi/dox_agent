"""W3-B: first-class Artifact store (frozen spec ITERATION §16.15).

An Artifact is the user-visible outcome ("成果"): a saved answer snapshot or a report. It links
to a persisted ``RunSnapshot`` by ``run_id`` and keeps immutable versions so a regenerated result
never overwrites an earlier one. Existing ``reports`` rows stay the compatible source for legacy
reports; this store never rewrites them.

Scope of this module: id, type, run link, version, status, timestamps, export format/status and
optional failure reason. Per-citation persistence is deliberately out of scope (citations are
read back from the linked run snapshot).
"""

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

CONTRACT_VERSION = 1
ARTIFACT_TYPES = ("answer_snapshot", "report")
ARTIFACT_STATUSES = ("draft", "generating", "completed", "failed")


def _now() -> str:
    return datetime.now(UTC).isoformat()


class ArtifactStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS artifacts ("
                "id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, "
                "type TEXT NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', "
                "current_version INTEGER NOT NULL DEFAULT 0, session_key TEXT NOT NULL DEFAULT '', "
                "run_id TEXT NOT NULL DEFAULT '', corpus_ids TEXT NOT NULL DEFAULT '[]', "
                "task_id TEXT NOT NULL DEFAULT '', template_id TEXT NOT NULL DEFAULT '', "
                "export_format TEXT NOT NULL DEFAULT 'md', export_status TEXT NOT NULL DEFAULT '', "
                "fail_reason TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL DEFAULT '{}')")
            db.execute(
                "CREATE TABLE IF NOT EXISTS artifact_versions ("
                "artifact_id TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, "
                "markdown TEXT NOT NULL DEFAULT '', citations TEXT NOT NULL DEFAULT '[]', "
                "PRIMARY KEY (artifact_id, version))")
            db.execute("CREATE INDEX IF NOT EXISTS artifact_versions_doc ON artifact_versions(artifact_id)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def create(self, artifact_id: str, *, type: str, title: str, markdown: str,
               session_key: str = "", run_id: str = "", corpus_ids: list[str] | None = None,
               task_id: str = "", template_id: str = "", citations: list[dict] | None = None,
               status: str = "completed", export_format: str = "md") -> dict:
        """Create an artifact with version 1. Caller owns id generation and run validation."""
        timestamp = _now()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                "INSERT INTO artifacts (id, created_at, updated_at, type, status, title, current_version, "
                "session_key, run_id, corpus_ids, task_id, template_id, export_format, export_status, "
                "fail_reason, payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (artifact_id, timestamp, timestamp, type, status, title, 1, session_key, run_id,
                 json.dumps(list(corpus_ids or []), ensure_ascii=False), task_id, template_id,
                 export_format, "", "", "{}"))
            db.execute("INSERT INTO artifact_versions (artifact_id, version, created_at, markdown, citations) "
                       "VALUES (?,?,?,?,?)",
                       (artifact_id, 1, timestamp, markdown,
                        json.dumps(citations or [], ensure_ascii=False)))
        return self.get(artifact_id)

    def add_version(self, artifact_id: str, *, markdown: str, citations: list[dict] | None = None,
                    status: str = "completed") -> dict:
        """Append a new immutable version; the previous version is never overwritten."""
        timestamp = _now()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT current_version FROM artifacts WHERE id=?", (artifact_id,)).fetchone()
            if row is None:
                raise KeyError("成果不存在")
            version = int(row[0]) + 1
            db.execute("INSERT INTO artifact_versions (artifact_id, version, created_at, markdown, citations) "
                       "VALUES (?,?,?,?,?)",
                       (artifact_id, version, timestamp, markdown,
                        json.dumps(citations or [], ensure_ascii=False)))
            db.execute("UPDATE artifacts SET current_version=?, updated_at=?, status=? WHERE id=?",
                       (version, timestamp, status, artifact_id))
        return self.get(artifact_id)

    def set_status(self, artifact_id: str, status: str, *, fail_reason: str = "") -> dict:
        with self.connect() as db:
            db.execute("UPDATE artifacts SET status=?, fail_reason=?, updated_at=? WHERE id=?",
                       (status, fail_reason, _now(), artifact_id))
        return self.get(artifact_id)

    def _row_payload(self, row) -> dict:
        item = {
            "artifact_id": row[0], "created_at": row[1], "updated_at": row[2], "type": row[3],
            "status": row[4], "title": row[5], "current_version": row[6], "session_key": row[7],
            "run_id": row[8], "corpus_ids": json.loads(row[9]), "task_id": row[10],
            "template_id": row[11], "export_format": row[12], "export_status": row[13],
            "fail_reason": row[14],
        }
        return item

    _COLUMNS = ("id, created_at, updated_at, type, status, title, current_version, session_key, "
                "run_id, corpus_ids, task_id, template_id, export_format, export_status, fail_reason, payload")

    def get(self, artifact_id: str) -> dict:
        with self.connect() as db:
            row = db.execute(f"SELECT {self._COLUMNS} FROM artifacts WHERE id=?", (artifact_id,)).fetchone()
            if row is None:
                raise KeyError("成果不存在")
            item = self._row_payload(row)
            version = db.execute(
                "SELECT version, created_at, markdown, citations FROM artifact_versions "
                "WHERE artifact_id=? AND version=?", (artifact_id, item["current_version"])).fetchone()
        item["version"] = version[0] if version else 0
        item["version_created_at"] = version[1] if version else ""
        item["markdown"] = version[2] if version else ""
        item["citations"] = json.loads(version[3]) if version else []
        return item

    def get_version(self, artifact_id: str, version: int) -> dict:
        with self.connect() as db:
            row = db.execute(
                "SELECT version, created_at, markdown, citations FROM artifact_versions "
                "WHERE artifact_id=? AND version=?", (artifact_id, version)).fetchone()
        if row is None:
            raise KeyError("成果版本不存在")
        return {"artifact_id": artifact_id, "version": row[0], "created_at": row[1],
                "markdown": row[2], "citations": json.loads(row[3])}

    def list(self, *, session_key: str | None = None, type: str | None = None,
             status: str | None = None, limit: int = 50) -> list[dict]:
        """Metadata-only list. ``session_key=None`` means global; ``""`` filters empty session.

        The distinction matters for the §16.15 cross-session semantics (omitted vs explicit empty).
        """
        limit = max(1, min(limit, 200))
        clauses, args = [], []
        if session_key is not None:
            clauses.append("session_key=?")
            args.append(session_key)
        if type is not None:
            clauses.append("type=?")
            args.append(type)
        if status is not None:
            clauses.append("status=?")
            args.append(status)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self.connect() as db:
            rows = db.execute(
                f"SELECT {self._COLUMNS} FROM artifacts {where} ORDER BY created_at DESC LIMIT ?",
                (*args, limit)).fetchall()
        return [self._row_payload(row) for row in rows]
