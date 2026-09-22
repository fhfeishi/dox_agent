"""H1: corpus registry — disk scan under the corpus root plus CORPORA config overrides.

Read-only by contract: scanning never creates files (sqlite is opened with ``mode=ro``)
and never changes the existing single-corpus behaviour; ``DATA_DIR`` simply degrades to
"the default corpus". Per-corpus ``Knowledge`` instances are created lazily by main.py.
"""

from __future__ import annotations

import os
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

# Fund report files: <year_from>_<year_to>_<project_no>_<pi>_<title>.pdf (corpus_management §3.3).
FUND_NAME_PATTERN = re.compile(r"^\d{4}_\d{4}_[A-Za-z0-9]+_[^_]+_.+\.pdf$", re.IGNORECASE)


@dataclass(frozen=True)
class CorpusInfo:
    id: str
    name: str
    kind: str  # "fund" | config-provided | "unknown"
    domain: str
    rel_path: str  # posix path relative to the corpus root
    root: Path
    sqlite: Path | None
    docs_count: int
    preparation: str  # ready | empty | uninitialized
    is_default: bool = False


def corpus_id_for(rel_path: str) -> str:
    """Stable id derived from the corpus-root-relative path, so index rebuilds keep it."""
    return rel_path.replace("/", "-").replace(" ", "-")


def corpus_root_for(settings) -> Path:
    """The directory scanned for corpora: explicit CORPORA_ROOT, else DATA_DIR's parent."""
    return (settings.corpora_root or settings.data_dir.parent).resolve()


def default_corpus_id(settings) -> str:
    """Id of the corpus holding DATA_DIR/knowledge.sqlite3, without walking the disk."""
    root = corpus_root_for(settings)
    target = (settings.data_dir / "knowledge.sqlite3").resolve().parent
    try:
        rel = target.relative_to(root).as_posix()
    except ValueError:
        rel = target.name
    return corpus_id_for(rel)


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


def scan_corpora(settings) -> list[CorpusInfo]:
    """List corpora: directories under the corpus root holding knowledge.sqlite3 or *.pdf.

    Empty directories (database/, vectordb/) are skipped; config entries from
    ``settings.corpora`` override id/name/kind/domain for a matched relative path.
    """
    root = corpus_root_for(settings)
    default_sqlite = (settings.data_dir / "knowledge.sqlite3").resolve()
    overrides: dict[str, dict] = {}
    for entry in settings.corpora or []:
        rel = str(entry.get("path", "")).strip("/")
        if rel:
            overrides[rel] = entry

    found: dict[str, CorpusInfo] = {}
    if root.is_dir():
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".") and d != "chroma"]
            current = Path(dirpath)
            sqlite_path = current / "knowledge.sqlite3"
            pdfs = [name for name in filenames if name.lower().endswith(".pdf")]
            if not sqlite_path.is_file() and not pdfs:
                continue
            rel = current.relative_to(root).as_posix()
            count = _docs_count(sqlite_path) if sqlite_path.is_file() else 0
            override = overrides.get(rel, {})
            kind = override.get("kind") or ("fund" if any(FUND_NAME_PATTERN.match(name) for name in pdfs) else "unknown")
            found[rel] = CorpusInfo(
                id=str(override.get("id") or corpus_id_for(rel)),
                name=str(override.get("name") or current.name),
                kind=str(kind),
                domain=str(override.get("domain") or current.name),
                rel_path=rel,
                root=current,
                sqlite=sqlite_path if sqlite_path.is_file() else None,
                docs_count=count,
                preparation="ready" if count > 0 else ("empty" if sqlite_path.is_file() else "uninitialized"),
                is_default=current.resolve() == default_sqlite.parent,
            )

    if default_sqlite.parent not in {info.root.resolve() for info in found.values()}:
        # The active corpus lives outside the scan root: still surface it so /api/corpora
        # always includes the corpus the service is actually running on.
        rel = default_sqlite.parent.name
        override = overrides.get(rel, {})
        count = _docs_count(default_sqlite) if default_sqlite.is_file() else 0
        found[rel] = CorpusInfo(
            id=str(override.get("id") or corpus_id_for(rel)),
            name=str(override.get("name") or default_sqlite.parent.name),
            kind=str(override.get("kind") or "unknown"),
            domain=str(override.get("domain") or default_sqlite.parent.name),
            rel_path=rel,
            root=default_sqlite.parent,
            sqlite=default_sqlite if default_sqlite.is_file() else None,
            docs_count=count,
            preparation="ready" if count > 0 else ("empty" if default_sqlite.is_file() else "uninitialized"),
            is_default=True,
        )

    return sorted(found.values(), key=lambda info: (not info.is_default, info.rel_path))
