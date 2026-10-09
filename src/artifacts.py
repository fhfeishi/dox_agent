"""Versioned outcomes with one report source and transactional lifecycle."""

import base64
import json
import re
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException

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
                "fail_reason TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL DEFAULT '{}')"
            )
            db.execute(
                "CREATE TABLE IF NOT EXISTS artifact_versions ("
                "artifact_id TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, "
                "markdown TEXT NOT NULL DEFAULT '', citations TEXT NOT NULL DEFAULT '[]', "
                "status TEXT NOT NULL DEFAULT 'completed', "
                "source_verification TEXT NOT NULL DEFAULT 'unverified', "
                "fail_reason TEXT NOT NULL DEFAULT '', "
                "PRIMARY KEY (artifact_id, version))"
            )
            # Existing W3-B rows had no per-version state or verification. Their provenance
            # remains unverified; do not infer that a historic client payload matched a run.
            columns = {row[1] for row in db.execute("PRAGMA table_info(artifact_versions)")}
            if "status" not in columns:
                db.execute(
                    "ALTER TABLE artifact_versions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'"
                )
            if "source_verification" not in columns:
                db.execute(
                    "ALTER TABLE artifact_versions ADD COLUMN source_verification TEXT NOT NULL DEFAULT 'unverified'"
                )
            if "fail_reason" not in columns:
                db.execute("ALTER TABLE artifact_versions ADD COLUMN fail_reason TEXT NOT NULL DEFAULT ''")
            if "figures" not in columns:
                db.execute("ALTER TABLE artifact_versions ADD COLUMN figures TEXT NOT NULL DEFAULT '[]'")
            db.execute(
                "CREATE TABLE IF NOT EXISTS artifact_images (sha256 TEXT PRIMARY KEY, data BLOB NOT NULL)"
            )
            db.execute("CREATE INDEX IF NOT EXISTS artifact_versions_doc ON artifact_versions(artifact_id)")
            columns = {row[1] for row in db.execute("PRAGMA table_info(artifacts)")}
            for name, definition in {
                "revision": "INTEGER NOT NULL DEFAULT 1",
                "trashed_at": "TEXT",
                "purge_after": "TEXT",
                "report_id": "TEXT",
                "report_params": "TEXT NOT NULL DEFAULT '{}'",
                "generated_version": "INTEGER",
            }.items():
                if name not in columns:
                    db.execute(f"ALTER TABLE artifacts ADD COLUMN {name} {definition}")
            db.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS artifact_report_identity ON artifacts(report_id) WHERE report_id IS NOT NULL"
            )
            db.execute("CREATE INDEX IF NOT EXISTS artifact_expiry ON artifacts(purge_after)")
            db.execute("CREATE TABLE IF NOT EXISTS artifact_inputs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, filename TEXT, version TEXT, data BLOB, text TEXT, removed_at TEXT)")

            db.execute(
                "CREATE TABLE IF NOT EXISTS purged_artifacts (artifact_id TEXT PRIMARY KEY, report_id TEXT, report_run_id TEXT, purged_at TEXT)"
            )

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def _guard(self, db, artifact_id, *, include_trashed=False, revision=None, writing=False):
        row = db.execute(
            "SELECT revision,trashed_at,purge_after,status FROM artifacts WHERE id=?", (artifact_id,)
        ).fetchone()
        if row is None:
            if db.execute("SELECT 1 FROM purged_artifacts WHERE artifact_id=?", (artifact_id,)).fetchone():
                raise HTTPException(410, {"lifecycle": "purged", "message": "成果已永久删除"})
            raise KeyError("成果不存在")
        if row[2] and _now() >= row[2]:
            raise HTTPException(410, {"lifecycle": "expired", "message": "成果已到期，不可恢复"})
        if revision is not None and row[0] != revision:
            raise HTTPException(412, "成果已更新，请刷新后重试")
        if row[1] and (not include_trashed or writing):
            raise HTTPException(
                409 if writing else 410,
                {"lifecycle": "trashed", "purge_after": row[2], "message": "成果已移入回收站，请先还原"},
            )
        if writing and row[3] == "generating":
            raise HTTPException(409, "成果生成中，请等待完成")
        return row

    def report_identity(self, report_id):
        with self.connect() as db:
            row = db.execute("SELECT id FROM artifacts WHERE report_id=?", (report_id,)).fetchone()
            if row:
                return row[0]
            if db.execute("SELECT 1 FROM purged_artifacts WHERE report_id=?", (report_id,)).fetchone():
                raise HTTPException(410, {"lifecycle": "purged", "message": "成果已永久删除"})
        raise KeyError("报告不存在")

    def report_artifact(self, run_id):
        if not run_id:
            return None
        with self.connect() as db:
            row = db.execute(
                "SELECT id FROM artifacts WHERE type='report' AND run_id=?", (run_id,)
            ).fetchone()
            if (
                not row
                and db.execute("SELECT 1 FROM purged_artifacts WHERE report_run_id=?", (run_id,)).fetchone()
            ):
                raise HTTPException(410, {"lifecycle": "purged", "message": "成果已永久删除，请明确重新生成"})
        return self.get(row[0]) if row else None

    def get_report(self, report_id):
        aid = self.report_identity(report_id)
        item = self.get(aid)
        if item.get("generated_version"):
            item = self.get(aid, item["generated_version"])
        return {
            **item,
            "report_id": report_id,
            "params": item["report_params"],
            "corpus_id": next(iter(item["corpus_ids"]), ""),
        }

    def find_report(self, session_key, run_id):
        item = self.report_artifact(run_id)
        return (
            self.get_report(item["report_id"])
            if item and item.get("generated_version") and item["session_key"] == session_key
            else None
        )

    def list_reports(self, *, session_key=None, run_id=None, limit=20, offset=0):
        with self.connect() as db:
            clauses = ["type='report'", "trashed_at IS NULL", "generated_version IS NOT NULL"]
            args = []
            for field, value in (("session_key", session_key), ("run_id", run_id)):
                if value is not None:
                    clauses.append(field + "=?")
                    args.append(value)
            rows = db.execute(
                "SELECT report_id FROM artifacts WHERE "
                + " AND ".join(clauses)
                + " ORDER BY id DESC LIMIT ? OFFSET ?",
                (*args, min(100, limit), offset),
            ).fetchall()
        items = []
        for row in rows:
            report = self.get_report(row[0])
            items.append(
                {
                    **{
                        key: report.get(key)
                        for key in ("report_id", "created_at", "session_key", "run_id", "corpus_id")
                    },
                    **{
                        key: report["params"].get(key)
                        for key in (
                            "domain",
                            "year_from",
                            "year_to",
                            "template_id",
                            "template_version",
                            "task_id",
                            "task_version",
                        )
                    },
                }
            )
        return items

    def begin_report(self, run_id, params):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self._cleanup_inputs(db)
            for input_id in list(params.get("input_ids", [])) + ([params["input_template_id"]] if params.get("input_template_id") else []):
                row = db.execute("SELECT text,removed_at FROM artifact_inputs WHERE id=?", (input_id,)).fetchone()
                if not row or row[0] is None or row[1]:
                    raise HTTPException(409, "外部输入已移除或清理，请重新选择")

            if db.execute("SELECT 1 FROM purged_artifacts WHERE report_run_id=?", (run_id,)).fetchone():
                raise HTTPException(410, "成果已永久删除")
            row = db.execute(
                "SELECT id,status FROM artifacts WHERE type='report' AND run_id=?", (run_id,)
            ).fetchone()
            if row:
                self._guard(db, row[0])
                if row[1] == "generating":
                    raise HTTPException(409, "报告正在生成中")
                aid = row[0]
                db.execute("UPDATE artifacts SET status='generating',revision=revision+1 WHERE id=?", (aid,))
            else:
                aid = uuid4().hex
                timestamp = _now()
                db.execute(
                    "INSERT INTO artifacts (id,created_at,updated_at,type,status,title,session_key,run_id,corpus_ids,task_id,template_id,payload,report_id,report_params) VALUES (?,?,?,'report','generating',?,?,?,?,?,?,?,?,?)",
                    (
                        aid,
                        timestamp,
                        timestamp,
                        params.get("domain", ""),
                        (params.get("session_key") or ""),
                        run_id,
                        json.dumps([params["corpus_id"]] if params.get("corpus_id") else []),
                        params.get("task_id", "task4"),
                        (params.get("template_id") or ""),
                        json.dumps(
                            {
                                "task_version": params.get("task_version"),
                                "template_version": params.get("template_version"),
                            }
                        ),
                        uuid4().hex,
                        json.dumps(params),
                    ),
                )
        return self.get(aid)

    def finish_report(self, run_id, params, markdown, figures):
        item = self.report_artifact(run_id)
        if not item:
            raise KeyError("报告生成实体不存在")
        params = {**params, "corpus_id": next(iter(item["corpus_ids"]), "")}
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self._guard(db, item["artifact_id"])
            if (
                db.execute("SELECT status FROM artifacts WHERE id=?", (item["artifact_id"],)).fetchone()[0]
                != "generating"
            ):
                raise HTTPException(409, "报告已停止")
            for f in figures:
                db.execute("INSERT OR IGNORE INTO artifact_images VALUES (?,?)", (f["sha256"], f["bytes"]))
            version = db.execute(
                "SELECT COALESCE(MAX(version),0)+1 FROM artifact_versions WHERE artifact_id=?",
                (item["artifact_id"],),
            ).fetchone()[0]
            citations = [
                {**c, "corpus_id": c.get("corpus_id") or params.get("corpus_id", "")}
                for c in params.get("visible_sources", [])
            ]
            meta = [{k: v for k, v in f.items() if k != "bytes"} for f in figures]
            db.execute(
                "INSERT INTO artifact_versions VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    item["artifact_id"],
                    version,
                    _now(),
                    markdown,
                    json.dumps(citations),
                    "completed",
                    "verified",
                    "",
                    json.dumps(meta),
                ),
            )
            db.execute(
                "UPDATE artifacts SET current_version=?,generated_version=?,report_params=?,status='completed',updated_at=?,revision=revision+1,fail_reason='' WHERE id=?",
                (version, version, json.dumps(params), _now(), item["artifact_id"]),
            )
        return self.get_report(item["report_id"])

    def record_failed_report(self, *, run_id, reason, **_):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT id FROM artifacts WHERE type='report' AND run_id=? AND status='generating' AND trashed_at IS NULL",
                (run_id,),
            ).fetchone()
            if not row:
                return
            version = db.execute(
                "SELECT COALESCE(MAX(version),0)+1 FROM artifact_versions WHERE artifact_id=?", (row[0],)
            ).fetchone()[0]
            db.execute(
                "INSERT INTO artifact_versions VALUES (?,?,?,?,?,?,?,?,?)",
                (row[0], version, _now(), "", "[]", "failed", "unverified", reason, "[]"),
            )
            db.execute(
                "UPDATE artifacts SET current_version=?,status='failed',fail_reason=?,revision=revision+1,updated_at=? WHERE id=?",
                (version, reason, _now(), row[0]),
            )

    def recover_interrupted(self):
        with self.connect() as db:
            rows = db.execute("SELECT run_id FROM artifacts WHERE status='generating'").fetchall()
            db.execute(
                "UPDATE artifacts SET status='failed',fail_reason='服务重启，生成已中断',revision=revision+1 WHERE status='generating'"
            )
        return [row[0] for row in rows]

    def transition(self, artifact_id, action, revision):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if (
                action == "purge"
                and db.execute(
                    "SELECT 1 FROM purged_artifacts WHERE artifact_id=?", (artifact_id,)
                ).fetchone()
            ):
                return {"artifact_id": artifact_id, "lifecycle": "purged"}
            row = self._guard(db, artifact_id, include_trashed=True, revision=revision)
            if row[3] == "generating":
                raise HTTPException(409, "成果生成中，请等待完成")
            if action == "trash" and not row[1]:
                now = _now()
                until = (datetime.fromisoformat(now) + timedelta(days=7)).isoformat()
                db.execute(
                    "UPDATE artifacts SET trashed_at=?,purge_after=?,revision=revision+1 WHERE id=?",
                    (now, until, artifact_id),
                )
            elif action == "restore" and row[1]:
                db.execute(
                    "UPDATE artifacts SET trashed_at=NULL,purge_after=NULL,revision=revision+1 WHERE id=?",
                    (artifact_id,),
                )
            elif action == "purge":
                if not row[1]:
                    raise HTTPException(409, "请先移入回收站")
                self._purge(db, artifact_id)
                return {"artifact_id": artifact_id, "lifecycle": "purged"}
        return self.get(artifact_id, include_trashed=True)

    def _cleanup_inputs(self, db):
        used = set()
        for (params,) in db.execute("SELECT report_params FROM artifacts WHERE purge_after IS NULL OR purge_after>?", (_now(),)):
            used.update(json.loads(params).get("input_ids", []))
            template = json.loads(params).get("input_template_id")
            if template:
                used.add(template)
        for (citations,) in db.execute("SELECT citations FROM artifact_versions JOIN artifacts ON artifacts.id=artifact_versions.artifact_id WHERE artifacts.purge_after IS NULL OR artifacts.purge_after>?", (_now(),)):
            used.update(source["input_id"] for source in json.loads(citations) if source.get("input_id"))
        deadline = (datetime.fromisoformat(_now()) - timedelta(days=7)).isoformat()
        for input_id, created, removed in db.execute("SELECT id,created_at,removed_at FROM artifact_inputs WHERE text IS NOT NULL").fetchall():
            if input_id not in used and (removed or created <= deadline):
                db.execute("UPDATE artifact_inputs SET filename=NULL,version=NULL,data=NULL,text=NULL,removed_at=? WHERE id=?", (_now(), input_id))

    def put_input(self, filename, data, text):
        input_id = uuid4().hex
        import hashlib
        version = hashlib.sha256(data).hexdigest()
        with self.connect() as db:
            db.execute("INSERT INTO artifact_inputs VALUES (?,?,?,?,?,?,NULL)", (input_id, _now(), filename, version, data, text))
        return self.get_input(input_id)

    def get_input(self, input_id):
        with self.connect() as db:
            self._cleanup_inputs(db)
            row = db.execute("SELECT created_at,filename,version,text,removed_at FROM artifact_inputs WHERE id=?", (input_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "外部材料不存在")
        if row[3] is None:
            raise HTTPException(410, "外部材料已清理")
        return {"input_id": input_id, "created_at": row[0], "filename": row[1], "version": row[2],
                "text": row[3], "removed": row[4] is not None}

    def remove_input(self, input_id):
        self.get_input(input_id)
        with self.connect() as db:
            db.execute("UPDATE artifact_inputs SET removed_at=? WHERE id=?", (_now(), input_id))
            self._cleanup_inputs(db)
        return {"input_id": input_id, "removed": True}

    def _purge(self, db, artifact_id):
        db.execute(
            "INSERT OR IGNORE INTO purged_artifacts SELECT id,report_id,CASE WHEN type='report' THEN run_id ELSE '' END,? FROM artifacts WHERE id=?",
            (_now(), artifact_id),
        )
        db.execute("DELETE FROM artifact_versions WHERE artifact_id=?", (artifact_id,))
        db.execute("DELETE FROM artifacts WHERE id=?", (artifact_id,))
        referenced = {
            f["sha256"]
            for row in db.execute("SELECT figures FROM artifact_versions")
            for f in json.loads(row[0])
        }
        for (digest,) in db.execute("SELECT sha256 FROM artifact_images").fetchall():
            if digest not in referenced:
                db.execute("DELETE FROM artifact_images WHERE sha256=?", (digest,))
        self._cleanup_inputs(db)

    def purge_expired(self):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            rows = db.execute("SELECT id FROM artifacts WHERE purge_after<=?", (_now(),)).fetchall()
            for row in rows:
                self._purge(db, row[0])
            self._cleanup_inputs(db)
        return len(rows)

    def create(
        self,
        artifact_id: str,
        *,
        type: str,
        title: str,
        markdown: str,
        session_key: str = "",
        run_id: str = "",
        corpus_ids: list[str] | None = None,
        task_id: str = "",
        template_id: str = "",
        task_version: int | None = None,
        citations: list[dict] | None = None,
        status: str = "completed",
        export_format: str = "md",
        source_verification: str = "unverified",
    ) -> dict:
        """Create an artifact with version 1. Caller owns id generation and run validation."""
        timestamp = _now()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                "INSERT INTO artifacts (id, created_at, updated_at, type, status, title, current_version, "
                "session_key, run_id, corpus_ids, task_id, template_id, export_format, export_status, "
                "fail_reason, payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    artifact_id,
                    timestamp,
                    timestamp,
                    type,
                    status,
                    title,
                    1,
                    session_key,
                    run_id,
                    json.dumps(list(corpus_ids or []), ensure_ascii=False),
                    task_id,
                    template_id,
                    export_format,
                    "",
                    "",
                    json.dumps(
                        {
                            "source_verification": source_verification,
                            "task_version": task_version,
                            "template_version": None,
                        }
                    ),
                ),
            )
            db.execute(
                "INSERT INTO artifact_versions (artifact_id, version, created_at, markdown, citations, "
                "status, source_verification, fail_reason) VALUES (?,?,?,?,?,?,?,?)",
                (
                    artifact_id,
                    1,
                    timestamp,
                    markdown,
                    json.dumps(citations or [], ensure_ascii=False),
                    status,
                    source_verification,
                    "",
                ),
            )
        return self.get(artifact_id)

    def add_version(
        self,
        artifact_id: str,
        *,
        markdown: str,
        citations: list[dict] | None = None,
        status: str = "completed",
        figures: list[dict] | None = None,
        revision: int | None = None,
    ) -> dict:
        """Append a new immutable version; the previous version is never overwritten."""
        timestamp = _now()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self._guard(db, artifact_id, revision=revision, writing=True)
            row = db.execute(
                "SELECT current_version, payload FROM artifacts WHERE id=?", (artifact_id,)
            ).fetchone()
            if row is None:
                raise KeyError("成果不存在")
            version = db.execute(
                "SELECT COALESCE(MAX(version),0)+1 FROM artifact_versions WHERE artifact_id=?", (artifact_id,)
            ).fetchone()[0]
            old_figures = json.loads(
                db.execute(
                    "SELECT figures FROM artifact_versions WHERE artifact_id=? AND version=?",
                    (artifact_id, row[0]),
                ).fetchone()[0]
            )
            if figures is None:
                figures = [figure for figure in old_figures if f"figures/{figure['figure_id']}." in markdown]
            referenced = set(re.findall(r"\(figures/([a-f0-9]{20})\.(?:jpg|png)\)", markdown))
            if referenced != {figure["figure_id"] for figure in figures}:
                raise ValueError("成果正文中的图片与附件不一致")
            for figure in figures:
                if "bytes" in figure:
                    db.execute(
                        "INSERT OR IGNORE INTO artifact_images VALUES (?,?)",
                        (figure["sha256"], figure["bytes"]),
                    )
            figure_meta = [
                {key: value for key, value in figure.items() if key != "bytes"} for figure in figures
            ]
            db.execute(
                "INSERT INTO artifact_versions (artifact_id, version, created_at, markdown, citations, "
                "status, source_verification, fail_reason, figures) VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    artifact_id,
                    version,
                    timestamp,
                    markdown,
                    json.dumps(citations or [], ensure_ascii=False),
                    status,
                    "user_modified",
                    "",
                    json.dumps(figure_meta, ensure_ascii=False),
                ),
            )
            meta = {**json.loads(row[1]), "source_verification": "user_modified"}
            db.execute(
                "UPDATE artifacts SET current_version=?, updated_at=?, status=?, payload=?,revision=revision+1 WHERE id=?",
                (version, timestamp, status, json.dumps(meta), artifact_id),
            )
        return self.get(artifact_id)

    def set_status(self, artifact_id: str, status: str, *, fail_reason: str = "") -> dict:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self._guard(db, artifact_id, writing=True)
            db.execute(
                "UPDATE artifacts SET revision=revision+1,status=?, fail_reason=?, updated_at=? WHERE id=?",
                (status, fail_reason, _now(), artifact_id),
            )
            db.execute(
                "UPDATE artifact_versions SET status=?, fail_reason=? WHERE artifact_id=? "
                "AND version=(SELECT current_version FROM artifacts WHERE id=?)",
                (status, fail_reason, artifact_id, artifact_id),
            )
        return self.get(artifact_id)

    def _row_payload(self, row) -> dict:
        item = {
            "artifact_id": row[0],
            "created_at": row[1],
            "updated_at": row[2],
            "type": row[3],
            "status": row[4],
            "title": row[5],
            "current_version": row[6],
            "session_key": row[7],
            "run_id": row[8],
            "corpus_ids": json.loads(row[9]),
            "task_id": row[10],
            "template_id": row[11],
            "export_format": row[12],
            "export_status": row[13],
            "fail_reason": row[14],
            # Rows from the first W3-B slice had an empty payload. They cannot claim an
            # exact source match retroactively, even when their linked run is available.
            "source_verification": json.loads(row[15]).get("source_verification", "unverified"),
            "template_version": json.loads(row[15]).get("template_version"),
            "task_version": json.loads(row[15]).get("task_version"),
        }
        item.update(
            revision=row[16],
            trashed_at=row[17],
            purge_after=row[18],
            report_id=row[19],
            report_params=json.loads(row[20]),
            generated_version=row[21],
            lifecycle="trashed" if row[17] else "active",
        )
        return item

    _COLUMNS = (
        "id, created_at, updated_at, type, status, title, current_version, session_key, "
        "run_id, corpus_ids, task_id, template_id, export_format, export_status, fail_reason, payload, revision, trashed_at, purge_after, report_id, report_params, generated_version"
    )

    def get(self, artifact_id: str, version: int | None = None, *, include_trashed=False) -> dict:
        with self.connect() as db:
            self._guard(db, artifact_id, include_trashed=include_trashed)
            row = db.execute(f"SELECT {self._COLUMNS} FROM artifacts WHERE id=?", (artifact_id,)).fetchone()
            if row is None:
                raise KeyError("成果不存在")
            item = self._row_payload(row)
            version_row = db.execute(
                "SELECT version, created_at, markdown, citations, status, source_verification, fail_reason, figures "
                "FROM artifact_versions WHERE artifact_id=? AND version=?",
                (artifact_id, version if version is not None else item["current_version"]),
            ).fetchone()
        if version is not None and not version_row:
            raise KeyError("成果版本不存在")
        item["version"] = version_row[0] if version_row else 0
        item["version_created_at"] = version_row[1] if version_row else ""
        item["markdown"] = version_row[2] if version_row else ""
        item["citations"] = json.loads(version_row[3]) if version_row else []
        item["figures"] = json.loads(version_row[7]) if version_row else []
        if version_row:
            if item["status"] not in ("generating", "failed"):
                item["status"] = version_row[4]
            item["source_verification"] = version_row[5]
            item["fail_reason"] = version_row[6]
        return item

    def image(
        self, artifact_id: str, version: int, figure_id: str, *, include_trashed=False
    ) -> tuple[bytes, str]:
        with self.connect() as db:
            self._guard(db, artifact_id, include_trashed=include_trashed)
            row = db.execute(
                "SELECT figures FROM artifact_versions WHERE artifact_id=? AND version=?",
                (artifact_id, version),
            ).fetchone()
            if not row:
                raise KeyError("成果版本不存在")
            figure = next((item for item in json.loads(row[0]) if item["figure_id"] == figure_id), None)
            if not figure:
                raise KeyError("图片不属于该成果版本")
            data = db.execute(
                "SELECT data FROM artifact_images WHERE sha256=?", (figure["sha256"],)
            ).fetchone()
        if not data:
            raise KeyError("图片附件不存在")
        return data[0], figure["media_type"]

    def get_version(self, artifact_id: str, version: int) -> dict:
        self.get(artifact_id, version)
        with self.connect() as db:
            row = db.execute(
                "SELECT version, created_at, markdown, citations, status, source_verification, fail_reason FROM artifact_versions "
                "WHERE artifact_id=? AND version=?",
                (artifact_id, version),
            ).fetchone()
        if row is None:
            raise KeyError("成果版本不存在")
        return {
            "artifact_id": artifact_id,
            "version": row[0],
            "created_at": row[1],
            "markdown": row[2],
            "citations": json.loads(row[3]),
            "status": row[4],
            "source_verification": row[5],
            "fail_reason": row[6],
        }

    def list_versions(self, artifact_id: str, *, include_trashed=False) -> list[dict]:
        with self.connect() as db:
            self._guard(db, artifact_id, include_trashed=include_trashed)
            if not db.execute("SELECT 1 FROM artifacts WHERE id=?", (artifact_id,)).fetchone():
                raise KeyError("成果不存在")
            rows = db.execute(
                "SELECT version, created_at, status, source_verification, fail_reason "
                "FROM artifact_versions WHERE artifact_id=? ORDER BY version",
                (artifact_id,),
            ).fetchall()
        return [
            {
                "version": row[0],
                "created_at": row[1],
                "status": row[2],
                "source_verification": row[3],
                "fail_reason": row[4],
            }
            for row in rows
        ]

    def list(
        self,
        *,
        session_key: str | None = None,
        type: str | None = None,
        status: str | None = None,
        limit: int = 50,
        view: str = "active",
        cursor: str | None = None,
    ) -> list[dict]:
        """Metadata-only list. ``session_key=None`` means global; ``""`` filters empty session.

        The distinction matters for the §16.15 cross-session semantics (omitted vs explicit empty).
        """
        limit = max(1, min(limit, 200))
        clauses, args = (
            (["trashed_at IS NOT NULL", "purge_after>?"], [_now()])
            if view == "trash"
            else (["trashed_at IS NULL"], [])
        )
        order = "trashed_at" if view == "trash" else "created_at"
        if cursor:
            try:
                timestamp, identity = json.loads(base64.urlsafe_b64decode(cursor))
            except Exception as exc:
                raise HTTPException(422, "无效分页位置") from exc
            clauses.append(f"({order},id)<(?,?)")
            args.extend([timestamp, identity])
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
                f"SELECT {self._COLUMNS} FROM artifacts {where} ORDER BY {order} DESC,id DESC LIMIT ?",
                (*args, limit),
            ).fetchall()
        items = [self._row_payload(row) for row in rows]
        for item in items:
            item["cursor"] = base64.urlsafe_b64encode(
                json.dumps([item[order], item["artifact_id"]]).encode()
            ).decode()
        return items
