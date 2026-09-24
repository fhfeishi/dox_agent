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
from uuid import uuid4

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
                "status TEXT NOT NULL DEFAULT 'completed', "
                "source_verification TEXT NOT NULL DEFAULT 'unverified', "
                "fail_reason TEXT NOT NULL DEFAULT '', "
                "PRIMARY KEY (artifact_id, version))")
            # Existing W3-B rows had no per-version state or verification. Their provenance
            # remains unverified; do not infer that a historic client payload matched a run.
            columns = {row[1] for row in db.execute("PRAGMA table_info(artifact_versions)")}
            if "status" not in columns:
                db.execute("ALTER TABLE artifact_versions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'")
            if "source_verification" not in columns:
                db.execute("ALTER TABLE artifact_versions ADD COLUMN source_verification TEXT NOT NULL DEFAULT 'unverified'")
            if "fail_reason" not in columns:
                db.execute("ALTER TABLE artifact_versions ADD COLUMN fail_reason TEXT NOT NULL DEFAULT ''")
            db.execute("CREATE INDEX IF NOT EXISTS artifact_versions_doc ON artifact_versions(artifact_id)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def report_run_ids(self) -> set[str]:
        """All linked report runs, independent of the visible list limit or session filter."""
        with self.connect() as db:
            rows = db.execute("SELECT DISTINCT run_id FROM artifacts "
                              "WHERE type='report' AND run_id!=''").fetchall()
        return {row[0] for row in rows}

    def ensure_report(self, report: dict) -> dict:
        """Atomically repair or create one artifact for a persisted report run."""
        run_id = report.get("run_id", "")
        if not run_id:
            raise ValueError("历史报告没有运行记录，保持只读兼容")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT id, status, current_version, payload FROM artifacts "
                             "WHERE type='report' AND run_id=? "
                             "ORDER BY created_at LIMIT 1", (run_id,)).fetchone()
            if row:
                artifact_id = row[0]
                if row[1] != "completed":
                    # A failed run can be retried with the same run_id. Keep its failed
                    # version, then append the actual generated report as a verified one.
                    version = row[2] + 1
                    timestamp = _now()
                    db.execute("INSERT INTO artifact_versions (artifact_id, version, created_at, "
                               "markdown, citations, status, source_verification, fail_reason) VALUES (?,?,?,?,?,?,?,?)",
                               (artifact_id, version, timestamp, report["markdown"], "[]", "completed", "verified", ""))
                    meta = {**json.loads(row[3]), "source_verification": "verified",
                            "source_report_id": report["report_id"],
                            "template_version": report.get("params", {}).get("template_version", 0)}
                    db.execute("UPDATE artifacts SET current_version=?, status='completed', updated_at=?, "
                               "fail_reason='', payload=? WHERE id=?",
                               (version, timestamp, json.dumps(meta), artifact_id))
            else:
                artifact_id = uuid4().hex
                timestamp = _now()
                params = report.get("params", {})
                db.execute(
                    "INSERT INTO artifacts (id, created_at, updated_at, type, status, title, "
                    "current_version, session_key, run_id, corpus_ids, task_id, template_id, "
                    "export_format, export_status, fail_reason, payload) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (artifact_id, timestamp, timestamp, "report", "completed", params.get("domain", ""),
                     1, report.get("session_key", ""), run_id,
                     json.dumps([report["corpus_id"]] if report.get("corpus_id") else []),
                     "task4", params.get("template_id", ""), "md", "", "",
                     json.dumps({"source_verification": "verified", "source_report_id": report["report_id"],
                                 "template_version": params.get("template_version", 0)})))
                db.execute("INSERT INTO artifact_versions (artifact_id, version, created_at, "
                           "markdown, citations, status, source_verification, fail_reason) VALUES (?,?,?,?,?,?,?,?)",
                           (artifact_id, 1, timestamp, report["markdown"], "[]", "completed", "verified", ""))
        return self.get(artifact_id)

    def record_failed_report(self, *, run_id: str, title: str, session_key: str,
                             corpus_id: str, template_id: str, reason: str) -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT id FROM artifacts WHERE type='report' AND run_id=? "
                             "ORDER BY created_at LIMIT 1", (run_id,)).fetchone()
            if row:
                artifact_id = row[0]
            else:
                artifact_id = uuid4().hex
                timestamp = _now()
                db.execute("INSERT INTO artifacts (id, created_at, updated_at, type, status, title, "
                           "current_version, session_key, run_id, corpus_ids, task_id, template_id, "
                           "export_format, export_status, fail_reason, payload) "
                           "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                           (artifact_id, timestamp, timestamp, "report", "failed", title, 1, session_key,
                            run_id, json.dumps([corpus_id] if corpus_id else []), "task4", template_id,
                            "md", "", reason, json.dumps({"source_verification": "unverified"})))
                db.execute("INSERT INTO artifact_versions (artifact_id, version, created_at, "
                           "markdown, citations, status, source_verification, fail_reason) VALUES (?,?,?,?,?,?,?,?)",
                           (artifact_id, 1, timestamp, "", "[]", "failed", "unverified", reason))
        return self.get(artifact_id)

    def create(self, artifact_id: str, *, type: str, title: str, markdown: str,
               session_key: str = "", run_id: str = "", corpus_ids: list[str] | None = None,
               task_id: str = "", template_id: str = "", citations: list[dict] | None = None,
               status: str = "completed", export_format: str = "md",
               source_verification: str = "unverified") -> dict:
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
                 export_format, "", "", json.dumps({"source_verification": source_verification})))
            db.execute("INSERT INTO artifact_versions (artifact_id, version, created_at, markdown, citations, "
                       "status, source_verification, fail_reason) VALUES (?,?,?,?,?,?,?,?)",
                       (artifact_id, 1, timestamp, markdown,
                        json.dumps(citations or [], ensure_ascii=False), status, source_verification, ""))
        return self.get(artifact_id)

    def add_version(self, artifact_id: str, *, markdown: str, citations: list[dict] | None = None,
                    status: str = "completed") -> dict:
        """Append a new immutable version; the previous version is never overwritten."""
        timestamp = _now()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT current_version, payload FROM artifacts WHERE id=?", (artifact_id,)).fetchone()
            if row is None:
                raise KeyError("成果不存在")
            version = int(row[0]) + 1
            db.execute("INSERT INTO artifact_versions (artifact_id, version, created_at, markdown, citations, "
                       "status, source_verification, fail_reason) VALUES (?,?,?,?,?,?,?,?)",
                       (artifact_id, version, timestamp, markdown,
                        json.dumps(citations or [], ensure_ascii=False), status, "user_modified", ""))
            meta = {**json.loads(row[1]), "source_verification": "user_modified"}
            db.execute("UPDATE artifacts SET current_version=?, updated_at=?, status=?, payload=? WHERE id=?",
                       (version, timestamp, status, json.dumps(meta), artifact_id))
        return self.get(artifact_id)

    def set_status(self, artifact_id: str, status: str, *, fail_reason: str = "") -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("UPDATE artifacts SET status=?, fail_reason=?, updated_at=? WHERE id=?",
                       (status, fail_reason, _now(), artifact_id))
            db.execute("UPDATE artifact_versions SET status=?, fail_reason=? WHERE artifact_id=? "
                       "AND version=(SELECT current_version FROM artifacts WHERE id=?)",
                       (status, fail_reason, artifact_id, artifact_id))
        return self.get(artifact_id)

    def _row_payload(self, row) -> dict:
        item = {
            "artifact_id": row[0], "created_at": row[1], "updated_at": row[2], "type": row[3],
            "status": row[4], "title": row[5], "current_version": row[6], "session_key": row[7],
            "run_id": row[8], "corpus_ids": json.loads(row[9]), "task_id": row[10],
            "template_id": row[11], "export_format": row[12], "export_status": row[13],
            "fail_reason": row[14],
            # Rows from the first W3-B slice had an empty payload. They cannot claim an
            # exact source match retroactively, even when their linked run is available.
            "source_verification": json.loads(row[15]).get("source_verification", "unverified"),
            "template_version": json.loads(row[15]).get("template_version", 0),
        }
        return item

    _COLUMNS = ("id, created_at, updated_at, type, status, title, current_version, session_key, "
                "run_id, corpus_ids, task_id, template_id, export_format, export_status, fail_reason, payload")

    def get(self, artifact_id: str, version: int | None = None) -> dict:
        with self.connect() as db:
            row = db.execute(f"SELECT {self._COLUMNS} FROM artifacts WHERE id=?", (artifact_id,)).fetchone()
            if row is None:
                raise KeyError("成果不存在")
            item = self._row_payload(row)
            version_row = db.execute(
                "SELECT version, created_at, markdown, citations, status, source_verification, fail_reason "
                "FROM artifact_versions WHERE artifact_id=? AND version=?",
                (artifact_id, version if version is not None else item["current_version"])).fetchone()
        if version is not None and not version_row:
            raise KeyError("成果版本不存在")
        item["version"] = version_row[0] if version_row else 0
        item["version_created_at"] = version_row[1] if version_row else ""
        item["markdown"] = version_row[2] if version_row else ""
        item["citations"] = json.loads(version_row[3]) if version_row else []
        if version_row:
            item["status"] = version_row[4]
            item["source_verification"] = version_row[5]
            item["fail_reason"] = version_row[6]
        return item

    def get_version(self, artifact_id: str, version: int) -> dict:
        with self.connect() as db:
            row = db.execute(
                "SELECT version, created_at, markdown, citations, status, source_verification, fail_reason FROM artifact_versions "
                "WHERE artifact_id=? AND version=?", (artifact_id, version)).fetchone()
        if row is None:
            raise KeyError("成果版本不存在")
        return {"artifact_id": artifact_id, "version": row[0], "created_at": row[1],
                "markdown": row[2], "citations": json.loads(row[3]), "status": row[4],
                "source_verification": row[5], "fail_reason": row[6]}

    def list_versions(self, artifact_id: str) -> list[dict]:
        with self.connect() as db:
            if not db.execute("SELECT 1 FROM artifacts WHERE id=?", (artifact_id,)).fetchone():
                raise KeyError("成果不存在")
            rows = db.execute("SELECT version, created_at, status, source_verification, fail_reason "
                              "FROM artifact_versions WHERE artifact_id=? ORDER BY version",
                              (artifact_id,)).fetchall()
        return [{"version": row[0], "created_at": row[1], "status": row[2],
                 "source_verification": row[3], "fail_reason": row[4]} for row in rows]

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
