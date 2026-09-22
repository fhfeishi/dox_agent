"""Small persistent corpus. Parsers feed pages; tools search and read evidence."""

import hashlib
import json
import re
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, Field
from rank_bm25 import BM25Plus


class Page(BaseModel):
    number: int = Field(ge=1)
    text: str


class Document(BaseModel):
    title: str
    origin: str
    kind: str
    parser: str
    pages: list[Page]
    markdown: str = ""
    captured_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


def tokens(text: str) -> list[str]:
    parts = re.findall(r"[a-zA-Z0-9_]+|[\u4e00-\u9fff]+", text.lower())
    return [
        token
        for part in parts
        for token in (
            [part]
            if not re.fullmatch(r"[\u4e00-\u9fff]+", part)
            else [part[i : i + 2] for i in range(max(1, len(part) - 1))]
        )
    ]


def lines_for(text: str) -> list[str]:
    """Bound long paragraphs without changing the stored parser output."""
    return [
        part
        for line in text.splitlines()
        for part in ([line[i : i + 300] for i in range(0, len(line), 300)] or [""])
    ]


class Knowledge:
    def __init__(self, path: Path, *, settings=None):
        self.path = path
        self.dense = None
        if settings is not None and settings.embedding_path.strip():
            from .dense import DenseIndex
            self.dense = DenseIndex(settings.vectordb_dir or path.parent / "chroma", settings.embedding_path, settings.embedding_device, settings.embedding_query_prompt)
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS docs (
                id TEXT PRIMARY KEY, version TEXT NOT NULL, payload TEXT NOT NULL)""")
            # K1: source-file manifest for incremental import and deletion sync.
            db.execute("""CREATE TABLE IF NOT EXISTS files (
                rel_path TEXT PRIMARY KEY, size INTEGER NOT NULL, mtime_ns INTEGER NOT NULL,
                sha256 TEXT NOT NULL, doc_id TEXT, status TEXT NOT NULL, updated_at TEXT NOT NULL)""")
            # K12: per-corpus settings (OCR mode/language and the last applied values).
            db.execute("""CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY, value TEXT NOT NULL)""")
            # L1: separate page text and markdown from the metadata payload so listing and
            # retrieval never load full report text (R9).
            db.execute("""CREATE TABLE IF NOT EXISTS doc_pages (
                doc_id TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL,
                PRIMARY KEY (doc_id, page))""")
            db.execute("""CREATE TABLE IF NOT EXISTS doc_markdown (
                doc_id TEXT PRIMARY KEY, markdown TEXT NOT NULL)""")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def put(self, doc: Document) -> dict:
        if not any(p.text.strip() for p in doc.pages):
            raise ValueError("解析结果为空，未入库")
        doc_id = hashlib.sha256(doc.origin.encode()).hexdigest()[:20]
        # L1: version covers both the page text and the markdown body.
        version = hashlib.sha256(
            json.dumps(
                {"pages": [p.model_dump() for p in doc.pages], "markdown": doc.markdown},
                ensure_ascii=False,
            ).encode()
        ).hexdigest()[:20]
        metadata = doc.model_dump(exclude={"pages", "markdown"})
        with self.connect() as db:
            old = db.execute("SELECT version FROM docs WHERE id=?", (doc_id,)).fetchone()
            db.execute("INSERT OR REPLACE INTO docs VALUES (?, ?, ?)",
                       (doc_id, version, json.dumps(metadata, ensure_ascii=False)))
            db.execute("DELETE FROM doc_pages WHERE doc_id=?", (doc_id,))
            db.executemany("INSERT INTO doc_pages VALUES (?, ?, ?)",
                           [(doc_id, p.number, p.text) for p in doc.pages])
            db.execute("INSERT OR REPLACE INTO doc_markdown VALUES (?, ?)", (doc_id, doc.markdown))
        return {
            "doc_id": doc_id,
            "version": version,
            "title": doc.title,
            "changed": not old or old[0] != version,
        }

    def count(self) -> int:
        with self.connect() as db:
            return db.execute("SELECT COUNT(*) FROM docs").fetchone()[0]

    def all(self) -> list[dict]:
        """Metadata rows only: page text and markdown are loaded on demand (L1/R9)."""
        with self.connect() as db:
            rows = db.execute("SELECT id, version, payload FROM docs ORDER BY id").fetchall()
            counts = dict(db.execute("SELECT doc_id, COUNT(*) FROM doc_pages GROUP BY doc_id"))
        docs = []
        for doc_id, version, payload in rows:
            data = json.loads(payload)
            count = counts.get(doc_id) or len(data.get("pages") or [])
            metadata = {key: value for key, value in data.items() if key not in ("pages", "markdown")}
            docs.append({"doc_id": doc_id, "version": version, "page_count": count, **metadata})
        return docs

    def get(self, doc_id: str) -> dict:
        with self.connect() as db:
            row = db.execute("SELECT version, payload FROM docs WHERE id=?", (doc_id,)).fetchone()
            if not row:
                raise KeyError("文档不存在")
            count = db.execute("SELECT COUNT(*) FROM doc_pages WHERE doc_id=?", (doc_id,)).fetchone()[0]
        data = json.loads(row[1])
        count = count or len(data.get("pages") or [])
        metadata = {key: value for key, value in data.items() if key not in ("pages", "markdown")}
        return {"doc_id": doc_id, "version": row[0], "page_count": count, **metadata}

    def _pages(self, doc_id: str) -> list[dict]:
        """Page text for reading/search; falls back to pre-L1 payloads until re-indexed."""
        with self.connect() as db:
            rows = [{"number": number, "text": text}
                    for number, text in db.execute(
                        "SELECT page, text FROM doc_pages WHERE doc_id=? ORDER BY page", (doc_id,))]
            if rows:
                return rows
            row = db.execute("SELECT payload FROM docs WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise KeyError("文档不存在")
        return json.loads(row[0]).get("pages", [])

    def read_markdown(self, doc_id: str, version: str | None = None) -> str:
        """L1: version-checked markdown body (context rendering), never loaded by ``all()``."""
        doc = self.get(doc_id)
        if version and version != doc["version"]:
            raise ValueError("文档已更新，请重新搜索")
        with self.connect() as db:
            row = db.execute("SELECT markdown FROM doc_markdown WHERE doc_id=?", (doc_id,)).fetchone()
        if row is not None and row[0]:
            return row[0]
        return "\n".join(page["text"] for page in self._pages(doc_id))

    def files(self) -> dict[str, dict]:
        """K1: source-file manifest keyed by corpus-relative path."""
        with self.connect() as db:
            return {
                row[0]: {"rel_path": row[0], "size": row[1], "mtime_ns": row[2], "sha256": row[3],
                         "doc_id": row[4], "status": row[5], "updated_at": row[6]}
                for row in db.execute("SELECT * FROM files")
            }

    def record_file(self, rel_path: str, size: int, mtime_ns: int, sha256: str, doc_id: str | None, status: str) -> None:
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?,?)",
                       (rel_path, size, mtime_ns, sha256, doc_id, status, datetime.now(UTC).isoformat()))

    def drop_file(self, rel_path: str) -> str | None:
        """K1: a missing source file leaves the manifest and the docs table (BM25 excluded)."""
        with self.connect() as db:
            row = db.execute("SELECT doc_id FROM files WHERE rel_path=?", (rel_path,)).fetchone()
            db.execute("DELETE FROM files WHERE rel_path=?", (rel_path,))
            doc_id = row[0] if row else None
            if doc_id:
                db.execute("DELETE FROM docs WHERE id=?", (doc_id,))
        return doc_id

    def meta_all(self) -> dict[str, str]:
        """K12: per-corpus key/value settings."""
        with self.connect() as db:
            return {row[0]: row[1] for row in db.execute("SELECT key, value FROM meta")}

    def meta_get(self, key: str) -> str | None:
        with self.connect() as db:
            row = db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row[0] if row else None

    def meta_set(self, key: str, value: str) -> None:
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO meta VALUES (?, ?)", (key, value))

    def search(self, query: str, limit: int = 6, *, allowed_doc_ids: list[str] | None = None) -> list[dict]:
        query_tokens = tokens(query)
        if not query_tokens:
            return []
        candidates, corpus, texts = [], [], []
        for doc in self.all():
            if allowed_doc_ids is not None and doc["doc_id"] not in allowed_doc_ids:
                continue
            for page in self._pages(doc["doc_id"]):
                lines = lines_for(page["text"])
                for start in range(0, len(lines), 16):
                    snippet = "\n".join(lines[start : start + 24])
                    if not re.search(r"[A-Za-z\u4e00-\u9fff]", snippet):
                        continue
                    corpus.append(tokens(doc["title"] + " " + snippet) or ["_empty_"])
                    texts.append(doc["title"] + "\n" + snippet)
                    candidates.append(
                        {
                            "doc_id": doc["doc_id"],
                            "version": doc["version"],
                            "title": doc["title"],
                            "page": page["number"],
                            "start_line": start + 1,
                            "snippet": snippet[:500],
                        }
                    )
        if not candidates:
            return []
        scores = BM25Plus(corpus).get_scores(query_tokens)
        ranked = sorted(range(len(corpus)), key=lambda i: float(scores[i]), reverse=True)
        limit = max(1, min(limit, 10))
        sparse = [position for position in ranked if set(query_tokens).intersection(corpus[position])]
        # Scoped BM25 never synchronizes a subset into the shared dense index.
        if self.dense is not None and allowed_doc_ids is None:
            from .dense import fuse_rankings
            dense = self.dense.search(query, texts, candidates, max(20, limit * 3))
            sparse = fuse_rankings(sparse[:max(20, limit * 3)], dense, limit)
        # Keep one source from monopolising the first page while retaining score order.
        diverse, deferred, per_doc = [], [], {}
        for position in sparse:
            candidate = candidates[position]
            count = per_doc.get(candidate["doc_id"], 0)
            (diverse if count < 2 else deferred).append(candidate)
            per_doc[candidate["doc_id"]] = count + 1
        results = (diverse + deferred)[:limit]
        if hasattr(self, "workspace"):
            from .workspace import note_locators
            for ref in reversed(note_locators(self.workspace, self, query, allowed_doc_ids)):
                doc = self.get(ref["doc_id"])
                results.insert(0, {"doc_id": doc["doc_id"], "version": doc["version"], "title": doc["title"],
                                   "page": ref.get("page", 1), "start_line": ref.get("start_line", 1),
                                   "snippet": "已确认笔记指向的原文位置；必须重新阅读原文"})
        return results[:limit]

    def read_section(self, doc_id: str, page: int = 1, start_line: int = 1, line_count: int = 60, version: str | None = None) -> dict:
        from .reading import section_window
        result = self.read(doc_id, page, start_line, line_count, version)
        doc = self.get(doc_id)
        if doc["version"] != result["version"]:
            raise ValueError("文档已更新，请重新搜索")
        text = next(p["text"] for p in self._pages(doc_id) if p["number"] == page)
        result.update(section_window(text, start_line))
        result.update(captured_at=doc["captured_at"], snippet=result["text"][:300])
        result["url"] = f"/api/documents/{doc_id}?page={page}&start_line={result['start_line']}&version={result['version']}&section=true"
        return result

    def read(
        self,
        doc_id: str,
        page: int = 1,
        start_line: int = 1,
        line_count: int = 60,
        version: str | None = None,
    ) -> dict:
        doc = self.get(doc_id)
        if version and version != doc["version"]:
            raise ValueError("文档已更新，请重新搜索")
        item = next((p for p in self._pages(doc_id) if p["number"] == page), None)
        if item is None:
            raise ValueError("页码不存在")
        lines = lines_for(item["text"])
        if start_line < 1 or start_line > len(lines):
            raise ValueError("行号超出范围")
        selected = lines[start_line - 1 : start_line - 1 + max(1, min(line_count, 100))]
        bounded = []
        length = 0
        for line in selected:
            if length + len(line) + 1 > 10000:
                break
            bounded.append(line)
            length += len(line) + 1
        text = "\n".join(bounded)
        return {
            "doc_id": doc_id,
            "version": doc["version"],
            "title": doc["title"],
            "page": page,
            "start_line": start_line,
            "next_start_line": start_line + len(bounded) if start_line + len(bounded) <= len(lines) else None,
            "text": text,
            "origin": doc["origin"],
            "kind": doc["kind"],
            "parser": doc["parser"],
            "url": f"/api/documents/{doc_id}?page={page}&start_line={start_line}&version={doc['version']}",
            "snippet": text[:300],
        }
