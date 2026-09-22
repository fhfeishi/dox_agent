"""H1: corpus registry — each corpus is a self-contained directory under CORPORA_ROOT.

Layout (方案 A, 2026-09-22): ``CORPORA_ROOT/<corpus>/`` holds ``source/`` (raw files,
possibly nested by domain), ``datadb/`` (sqlite) and ``vectordb/`` (vector store), so one
corpus can be moved, backed up or deleted as a single directory. Scanning is read-only:
counting opens sqlite with ``mode=ro`` and never creates files. ``DATA_DIR``/``VECTORDB_DIR``
still describe the active default corpus, which may live outside CORPORA_ROOT (the demo).
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

# Fund report files: <year_from>_<year_to>_<project_no>_<pi>_<title>.pdf (corpus_management §3.3).
FUND_NAME_PATTERN = re.compile(r"^\d{4}_\d{4}_[A-Za-z0-9]+_[^_]+_.+\.pdf$", re.IGNORECASE)
# Source files that make a corpus (raw material lives under ``<corpus>/source``).
SOURCE_SUFFIXES = {".pdf", ".md", ".markdown", ".txt"}

# Fixed role subdirectories inside every corpus directory (方案 A).
SOURCE_DIRNAME = "source"
DB_DIRNAME = "datadb"
VECTOR_DIRNAME = "vectordb"
ROLE_DIRNAMES = frozenset({SOURCE_DIRNAME, DB_DIRNAME, VECTOR_DIRNAME})


@dataclass(frozen=True)
class CorpusInfo:
    id: str
    name: str
    kind: str  # "fund" | config-provided | "unknown"
    domain: str
    rel_path: str  # posix path relative to the corpus root
    root: Path  # corpus directory
    source_dir: Path  # root/source — raw files
    db_dir: Path  # root/datadb — sqlite
    vectordb_dir: Path  # root/vectordb — vector store
    sqlite: Path | None
    docs_count: int
    preparation: str  # ready | empty | uninitialized
    is_default: bool = False


OVERRIDES_FILENAME = "corpora.json"


def corpus_id_for(rel_path: str) -> str:
    """K6a: injective, length-bounded id derived from the corpus-root-relative path.

    ``sha1(rel_path)[:8]`` keeps ``a b`` and ``a-b`` distinct; the slug is only for
    readability and is capped so the total stays within ``ChatRequest.corpus_id`` (120).
    """
    digest = hashlib.sha1(rel_path.encode("utf-8")).hexdigest()[:8]
    slug = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff._-]+", "-", rel_path).strip("-.")
    room = 120 - len(digest) - 1
    return (slug[:room].rstrip("-") or "corpus") + "-" + digest


def load_corpus_overrides(settings) -> dict[str, dict]:
    """Runtime display-name overrides persisted outside .env (K6)."""
    try:
        data = json.loads((settings.state_dir / OVERRIDES_FILENAME).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {str(key): value for key, value in data.items() if isinstance(value, dict)} if isinstance(data, dict) else {}


def save_corpus_overrides(settings, overrides: dict[str, dict]) -> None:
    settings.state_dir.mkdir(parents=True, exist_ok=True)
    path = settings.state_dir / OVERRIDES_FILENAME
    path.write_text(json.dumps(overrides, ensure_ascii=False, indent=2), encoding="utf-8")


def valid_corpus_name(name: str) -> bool:
    name = name.strip()
    return bool(name) and len(name) <= 80 and not any(ch in name for ch in "/\\\n\r\t") and not name.startswith(".") and name not in ROLE_DIRNAMES


def corpus_root_for(settings) -> Path:
    """The corpus root scanned for corpora (``CORPORA_ROOT``, default ``.knowledge``)."""
    return (settings.corpora_root or settings.data_dir.parent).resolve()


def _default_rel(settings) -> str:
    """Relative label of the active default corpus (its umbrella dir, e.g. ``.demo_langchain``)."""
    umbrella = settings.data_dir.resolve().parent
    return umbrella.name.lstrip(".") or umbrella.name


def default_corpus_id(settings) -> str:
    """Id of the corpus holding ``DATA_DIR/knowledge.sqlite3``, without walking the disk."""
    return corpus_id_for(_default_rel(settings))


def _docs_count(sqlite_path: Path) -> int:
    """Read the docs count without ever creating the file.

    Preferred is a read-only URI connection (never creates side files); on filesystems
    where URI authority or shared access fails (e.g. 9P/UNC mounts) fall back to a plain
    connection with a timeout — the file already exists here, so nothing is created.
    """
    try:
        with sqlite3.connect(f"file:{sqlite_path.as_posix()}?mode=ro", uri=True, timeout=30) as db:
            return int(db.execute("SELECT COUNT(*) FROM docs").fetchone()[0])
    except (OSError, sqlite3.Error):
        pass
    try:
        with sqlite3.connect(sqlite_path, timeout=30) as db:
            return int(db.execute("SELECT COUNT(*) FROM docs").fetchone()[0])
    except (OSError, sqlite3.Error):
        return 0


def _has_sources(directory: Path) -> bool:
    return any(path.is_file() and path.suffix.lower() in SOURCE_SUFFIXES for path in directory.rglob("*"))


def _has_fund_pdf(directory: Path) -> bool:
    return any(FUND_NAME_PATTERN.match(path.name) for path in directory.rglob("*.pdf"))


def _preparation(count: int, sqlite_exists: bool) -> str:
    return "ready" if count > 0 else ("empty" if sqlite_exists else "uninitialized")


def scan_corpora(settings) -> list[CorpusInfo]:
    """List corpora: each direct child of CORPORA_ROOT with a non-empty ``source/`` is one corpus.

    Raw files live (recursively) under ``<corpus>/source``; sqlite and vector store live in
    ``<corpus>/datadb`` and ``<corpus>/vectordb``. Empty children are skipped; ``settings.corpora``
    overrides id/name/kind/domain per relative path.
    """
    root = corpus_root_for(settings)
    default_sqlite = (settings.data_dir / "knowledge.sqlite3").resolve()
    overrides: dict[str, dict] = {}
    for entry in settings.corpora or []:
        rel = str(entry.get("path", "")).strip("/")
        if rel:
            overrides[rel] = entry
    overrides.update(load_corpus_overrides(settings))

    found: dict[str, CorpusInfo] = {}
    if root.is_dir():
        for child in sorted(path for path in root.iterdir() if path.is_dir()):
            if child.name.startswith(".") or child.name in ROLE_DIRNAMES:
                continue
            source_dir = child / SOURCE_DIRNAME
            if not source_dir.is_dir():
                continue
            rel = child.relative_to(root).as_posix()
            override = overrides.get(rel, {})
            # Empty source is skipped unless the corpus was explicitly created (K6).
            if not _has_sources(source_dir) and not override.get("created"):
                continue
            db_dir = child / DB_DIRNAME
            sqlite_path = db_dir / "knowledge.sqlite3"
            count = _docs_count(sqlite_path) if sqlite_path.is_file() else 0
            kind = override.get("kind") or ("fund" if _has_fund_pdf(source_dir) else "unknown")
            found[rel] = CorpusInfo(
                id=str(override.get("id") or corpus_id_for(rel)),
                name=str(override.get("name") or child.name),
                kind=str(kind),
                domain=str(override.get("domain") or child.name),
                rel_path=rel,
                root=child,
                source_dir=source_dir,
                db_dir=db_dir,
                vectordb_dir=child / VECTOR_DIRNAME,
                sqlite=sqlite_path if sqlite_path.is_file() else None,
                docs_count=count,
                preparation=_preparation(count, sqlite_path.is_file()),
            )

    if default_sqlite.parent not in {info.db_dir.resolve() for info in found.values()}:
        # The active corpus lives outside the scan root: still surface it so /api/corpora
        # always includes the corpus the service is actually running on.
        rel = _default_rel(settings)
        override = overrides.get(rel, {})
        count = _docs_count(default_sqlite) if default_sqlite.is_file() else 0
        umbrella = default_sqlite.parent.parent
        found[rel] = CorpusInfo(
            id=str(override.get("id") or corpus_id_for(rel)),
            name=str(override.get("name") or rel),
            kind=str(override.get("kind") or "unknown"),
            domain=str(override.get("domain") or rel),
            rel_path=rel,
            root=umbrella,
            source_dir=umbrella / SOURCE_DIRNAME,
            db_dir=default_sqlite.parent,
            vectordb_dir=settings.vectordb_dir or (umbrella / VECTOR_DIRNAME),
            sqlite=default_sqlite if default_sqlite.is_file() else None,
            docs_count=count,
            preparation=_preparation(count, default_sqlite.is_file()),
            is_default=True,
        )

    return sorted(found.values(), key=lambda info: (not info.is_default, info.rel_path))
