"""W3-A: minimal RunSnapshot — the server-side record required before artifacts.

One snapshot is keyed by ``run_id`` and stores the server-effective task, corpus scope,
document whitelist, resource policy, model, status and the observable usage/telemetry that
finished runs report. It deliberately stays small: W4 adds immutable task versions and full
parameter schemas, W6 adds network snapshots. The store is application-level
(``STATE_DIR/runs.sqlite3``) and never mutates corpus data.
"""

import hashlib
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

CONTRACT_VERSION = 1
RESOURCE_POLICIES = ("local_only", "local_plus_urls")


class RunConflict(RuntimeError):
    """Raised when a ``run_id`` is reused for a different request fingerprint."""


def request_fingerprint(payload: dict) -> str:
    """Stable hash of the request fields that change what a run executes."""
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(UTC).isoformat()


class RunStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS runs ("
                "run_id TEXT PRIMARY KEY, contract_version INTEGER NOT NULL, "
                "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, "
                "session_key TEXT NOT NULL DEFAULT '', parent_run_id TEXT NOT NULL DEFAULT '', "
                "run_type TEXT NOT NULL, status TEXT NOT NULL, task_id TEXT NOT NULL DEFAULT '', "
                "model TEXT NOT NULL DEFAULT '', resource_policy TEXT NOT NULL DEFAULT '', "
                "fingerprint TEXT NOT NULL, payload TEXT NOT NULL)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def create(self, run_id: str, fingerprint: str, **fields) -> tuple[dict, bool]:
        """Create a snapshot, or return the existing one for the same fingerprint.

        A different fingerprint for the same ``run_id`` conflicts (409 at the API boundary), so
        one snapshot can never stand for two different executions.
        """
        timestamp = _now()
        snapshot = {
            "contract_version": CONTRACT_VERSION,
            "run_id": run_id,
            "created_at": timestamp,
            "updated_at": timestamp,
            "session_key": fields.get("session_key", ""),
            "parent_run_id": fields.get("parent_run_id", ""),
            "run_type": fields.get("run_type", ""),
            "status": fields.get("status", "running"),
            "task_id": fields.get("task_id", ""),
            "task_version": fields.get("task_version"),
            "engine_task_id": fields.get("engine_task_id", fields.get("task_id", "")),
            "model": fields.get("model", ""),
            "resource_policy": fields.get("resource_policy", "local_only"),
            "requested_corpus_ids": list(fields.get("requested_corpus_ids", [])),
            "effective_corpus_ids": list(fields.get("effective_corpus_ids", [])),
            "allowed_doc_ids": fields.get("allowed_doc_ids", None),
            "params": fields.get("params", {}),
            "param_sources": fields.get("param_sources", {}),
            "output_intent": fields.get("output_intent", ""),
            "preparation": fields.get("preparation", ""),
            "ended_at": "",
            "metrics": {},
            "citations": [],
        }
        serialized = json.dumps(snapshot, ensure_ascii=False)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT fingerprint, payload FROM runs WHERE run_id=?", (run_id,)).fetchone()
            if row is not None:
                if row[0] != fingerprint:
                    raise RunConflict(f"run_id「{run_id}」已被另一次不同请求使用")
                return json.loads(row[1]), False
            db.execute(
                "INSERT INTO runs (run_id, contract_version, created_at, updated_at, session_key, "
                "parent_run_id, run_type, status, task_id, model, resource_policy, fingerprint, payload) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (run_id, CONTRACT_VERSION, timestamp, timestamp, snapshot["session_key"],
                 snapshot["parent_run_id"], snapshot["run_type"], snapshot["status"],
                 snapshot["task_id"], snapshot["model"], snapshot["resource_policy"],
                 fingerprint, serialized))
        return snapshot, True

    def update(self, run_id: str, **fields) -> dict:
        """Merge observable completion fields (status/ended_at/metrics/citations) into a run."""
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT payload FROM runs WHERE run_id=?", (run_id,)).fetchone()
            if row is None:
                raise KeyError("运行记录不存在")
            snapshot = json.loads(row[0])
            snapshot.update(fields)
            snapshot["updated_at"] = _now()
            db.execute("UPDATE runs SET payload=?, updated_at=?, status=? WHERE run_id=?",
                       (json.dumps(snapshot, ensure_ascii=False), snapshot["updated_at"],
                        snapshot.get("status", "running"), run_id))
        return snapshot

    def get(self, run_id: str) -> dict:
        with self.connect() as db:
            row = db.execute("SELECT payload FROM runs WHERE run_id=?", (run_id,)).fetchone()
        if row is None:
            raise KeyError("运行记录不存在")
        return json.loads(row[0])

    def existing_ids(self, run_ids: list[str]) -> set[str]:
        ids = list(dict.fromkeys(run_id for run_id in run_ids if run_id))
        if not ids:
            return set()
        with self.connect() as db:
            rows = db.execute(f"SELECT run_id FROM runs WHERE run_id IN ({','.join('?' for _ in ids)})",
                              ids).fetchall()
        return {row[0] for row in rows}
