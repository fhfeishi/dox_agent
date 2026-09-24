"""Persist confirmed web content independently of short-lived previews."""

import hashlib
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4


class WebSnapshotStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with sqlite3.connect(path) as db:
            db.execute("CREATE TABLE IF NOT EXISTS web_snapshots (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")

    def save(self, doc, *, fetched_at: str | None = None) -> dict:
        parsed = urlsplit(doc.origin)
        url = urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path or "/", parsed.query, ""))
        content = doc.markdown or "\n\n".join(page.text for page in doc.pages)
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        snapshot = {"web_snapshot_id": uuid4().hex, "url": url, "title": doc.title,
                    "fetched_at": fetched_at or datetime.now(UTC).isoformat(),
                    "content_hash": digest, "version": digest, "parse_status": "ready",
                    "parser": doc.parser, "markdown": content}
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO web_snapshots (id, payload) VALUES (?, ?)",
                       (snapshot["web_snapshot_id"], json.dumps(snapshot, ensure_ascii=False)))
        return snapshot

    def get(self, snapshot_id: str) -> dict:
        with sqlite3.connect(self.path) as db:
            row = db.execute("SELECT payload FROM web_snapshots WHERE id=?", (snapshot_id,)).fetchone()
        if row is None:
            raise KeyError("网页快照不存在")
        return json.loads(row[0])
