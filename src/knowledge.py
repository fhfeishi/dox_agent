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
            self.dense = DenseIndex(path.parent / "chroma", settings.embedding_path, settings.embedding_device, settings.embedding_query_prompt)
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS docs (
                id TEXT PRIMARY KEY, version TEXT NOT NULL, payload TEXT NOT NULL)""")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def put(self, doc: Document) -> dict:
        if not any(p.text.strip() for p in doc.pages):
            raise ValueError("解析结果为空，未入库")
        doc_id = hashlib.sha256(doc.origin.encode()).hexdigest()[:20]
        version = hashlib.sha256(
            json.dumps([p.model_dump() for p in doc.pages], ensure_ascii=False).encode()
        ).hexdigest()[:20]
        with self.connect() as db:
            old = db.execute("SELECT version FROM docs WHERE id=?", (doc_id,)).fetchone()
            db.execute(
                "INSERT OR REPLACE INTO docs VALUES (?, ?, ?)", (doc_id, version, doc.model_dump_json())
            )
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
        with self.connect() as db:
            return [
                {"doc_id": key, "version": version, **json.loads(payload)}
                for key, version, payload in db.execute("SELECT * FROM docs ORDER BY id")
            ]

    def get(self, doc_id: str) -> dict:
        with self.connect() as db:
            row = db.execute("SELECT version, payload FROM docs WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise KeyError("文档不存在")
        return {"doc_id": doc_id, "version": row[0], **json.loads(row[1])}

    def search(self, query: str, limit: int = 6, *, allowed_doc_ids: list[str] | None = None) -> list[dict]:
        query_tokens = tokens(query)
        if not query_tokens:
            return []
        candidates, corpus, texts = [], [], []
        for doc in self.all():
            if allowed_doc_ids is not None and doc["doc_id"] not in allowed_doc_ids:
                continue
            for page in doc["pages"]:
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
        text = next(p["text"] for p in doc["pages"] if p["number"] == page)
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
        item = next((p for p in doc["pages"] if p["number"] == page), None)
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
