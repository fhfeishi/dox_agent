"""Persist confirmed web content independently of short-lived previews."""

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

from .auth import CURRENT_USER
from .core.db import connect, migrate

# Schema steps for web_snapshots.sqlite3, append-only (src/core/db.py).
SCHEMA = ["CREATE TABLE IF NOT EXISTS web_snapshots (id TEXT PRIMARY KEY, payload TEXT NOT NULL)"]


class WebSnapshotStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        migrate(path, SCHEMA)

    def save(self, doc, *, fetched_at: str | None = None, search: dict | None = None,
             created_by: str | None = None) -> dict:
        """Persist one confirmed page. ``created_by`` is the signed-in account, never the client's."""
        parsed = urlsplit(doc.origin)
        url = urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path or "/", parsed.query, ""))
        content = doc.markdown or "\n\n".join(page.text for page in doc.pages)
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        snapshot = {"web_snapshot_id": uuid4().hex, "url": url, "title": doc.title,
                    "fetched_at": fetched_at or datetime.now(UTC).isoformat(),
                    "content_hash": digest, "version": digest, "parse_status": "ready",
                    "parser": doc.parser, "markdown": content,
                    # High#2 (2026-11-05): the account that confirmed the page owns the snapshot.
                    "created_by": CURRENT_USER.get() if created_by is None else created_by,
                    **(search or {})}
        with connect(self.path) as db:
            db.execute("INSERT INTO web_snapshots (id, payload) VALUES (?, ?)",
                       (snapshot["web_snapshot_id"], json.dumps(snapshot, ensure_ascii=False)))
        return snapshot

    def get(self, snapshot_id: str) -> dict:
        with connect(self.path) as db:
            row = db.execute("SELECT payload FROM web_snapshots WHERE id=?", (snapshot_id,)).fetchone()
        if row is None:
            raise KeyError("网页快照不存在")
        return json.loads(row[0])

    def owner_of(self, snapshot_id: str) -> str:
        """The account that confirmed this page (``""`` when it predates authorship)."""
        return self.get(snapshot_id).get("created_by", "")

    def owned_by(self, snapshot_id: str, username: str, *, admin: bool = False) -> bool:
        """Whether ``username`` may use this snapshot: its author, or an administrator for an
        ownerless page (the same rule every ownerless record follows)."""
        author = self.owner_of(snapshot_id)
        if not author:
            return admin
        return author == username
