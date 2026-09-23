"""H1: corpus registry — each corpus is a self-contained directory under CORPORA_ROOT.

Layout (方案 A, 2026-09-22): ``CORPORA_ROOT/<corpus>/`` holds ``source/`` (raw files,
possibly nested by domain), ``datadb/`` (sqlite) and ``vectordb/`` (vector store), so one
corpus can be moved, backed up or deleted as a single directory. Scanning is read-only:
counting opens sqlite with ``mode=ro`` and never creates files. §10: all persistence lives
under CORPORA_ROOT; the default corpus is ``DEFAULT_CORPUS`` (else the first ready corpus), and
``.state/`` (a dot dir, skipped by scanning) holds workspace/reports/overrides.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sqlite3
from dataclasses import dataclass, replace
from pathlib import Path

from .config import DOX_AGENT_ROOT

# Fund report files: <year_from>_<year_to>_<project_no>_<pi>_<title>.pdf (corpus_management §3.3).
FUND_NAME_PATTERN = re.compile(r"^\d{4}_\d{4}_[A-Za-z0-9]+_[^_]+_.+\.pdf$", re.IGNORECASE)
# Source files that make a corpus (raw material lives under ``<corpus>/source``).
SOURCE_SUFFIXES = {".pdf", ".md", ".markdown", ".txt", ".docx"}

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
STATE_FILES = ("workspace.sqlite3", "reports.sqlite3", "corpora.json", "official-preparation.json")
DEMO_DIRNAME = "demo_langchain"


def _rewrite_origins(db_path: Path, old_root: Path, new_root: Path, log: list[str]) -> None:
    """M1: rewrite file-type origins after a corpus move; doc ids stay stable."""
    if not db_path.is_file():
        return
    old_prefix, new_prefix = str(old_root.resolve()), str(new_root.resolve())
    with sqlite3.connect(db_path) as db:
        rows = db.execute("SELECT id, payload FROM docs").fetchall()
        changed = 0
        for doc_id, payload in rows:
            data = json.loads(payload)
            origin = data.get("origin", "")
            if origin.startswith(old_prefix):
                data["origin"] = new_prefix + origin[len(old_prefix):]
                db.execute("UPDATE docs SET payload=? WHERE id=?",
                           (json.dumps(data, ensure_ascii=False), doc_id))
                changed += 1
    if changed:
        log.append(f"rewrote {changed} origin(s) in {db_path}")


def migrate_layout(settings) -> list[str]:
    """§10 one-time, idempotent migration: move legacy state/demo under ``CORPORA_ROOT``.

    Order (M3): copy/move -> verify -> delete the old directory. Any failure keeps the old
    directory (no silent data loss). Test ``*.png`` are not part of verification.
    """
    root = corpus_root_for(settings)
    state = Path(settings.state_dir)
    if root != (DOX_AGENT_ROOT / ".knowledge").resolve():
        return []  # custom corpus root: no repo-layout migration
    root.mkdir(parents=True, exist_ok=True)
    log: list[str] = []

    old_demo = DOX_AGENT_ROOT / ".demo_langchain"
    new_demo = root / DEMO_DIRNAME
    if old_demo.is_dir() and not new_demo.exists():
        shutil.copytree(old_demo, new_demo)
        if new_demo.is_dir():
            _rewrite_origins(new_demo / DB_DIRNAME / "knowledge.sqlite3", old_demo, new_demo, log)
            shutil.rmtree(old_demo, ignore_errors=True)
            log.append(f"moved {old_demo} -> {new_demo}")

    legacy = DOX_AGENT_ROOT / "data"
    for name in STATE_FILES:
        target, source = state / name, legacy / name
        if target.exists() or not source.is_file():
            continue
        state.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        if target.is_file():
            log.append(f"copied {source} -> {target}")

    if not (state / "workspace.sqlite3").exists() and root.is_dir():
        legacy_ws = next((child / DB_DIRNAME / "workspace.sqlite3" for child in sorted(root.iterdir())
                          if (child / DB_DIRNAME / "workspace.sqlite3").is_file()), None)
        if legacy_ws is not None:
            state.mkdir(parents=True, exist_ok=True)
            shutil.copy2(legacy_ws, state / "workspace.sqlite3")
            log.append(f"copied {legacy_ws} -> {state / 'workspace.sqlite3'}")

    if legacy.is_dir():
        unknown = [p.name for p in legacy.iterdir()
                   if p.is_file() and p.name not in STATE_FILES and not p.name.endswith(".png")]
        missing = [name for name in STATE_FILES
                   if (legacy / name).is_file() and not (state / name).is_file()]
        if not unknown and not missing:
            shutil.rmtree(legacy, ignore_errors=True)
            log.append(f"removed {legacy}")
        else:
            log.append(f"kept {legacy} (unknown={unknown}, unmigrated={missing})")
    return log


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
    return Path(settings.corpora_root).resolve()


def resolve_default(infos: list[CorpusInfo], settings) -> CorpusInfo | None:
    """M4: ``DEFAULT_CORPUS`` by rel_path, else the first ready corpus, else None."""
    if not infos:
        return None
    for info in infos:
        if info.rel_path == settings.default_corpus:
            return info
    for info in sorted(infos, key=lambda item: item.rel_path):
        if info.preparation == "ready":
            return info
    return None


def default_corpus_info(settings) -> CorpusInfo | None:
    """The active default corpus, resolved without raising when nothing is ready."""
    return resolve_default(scan_corpora(settings), settings)


def default_db_path(settings) -> Path:
    """Default corpus SQLite, or the app-level fallback under ``STATE_DIR``."""
    info = default_corpus_info(settings)
    return info.db_dir / "knowledge.sqlite3" if info is not None else Path(settings.state_dir) / "knowledge.sqlite3"


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

    infos = list(found.values())
    default = resolve_default(infos, settings)
    if default is not None:
        infos = [replace(info, is_default=(info.id == default.id)) for info in infos]
    return sorted(infos, key=lambda info: (not info.is_default, info.rel_path))
