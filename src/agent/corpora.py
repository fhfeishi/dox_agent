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
import os
import re
import shutil
import sqlite3
import tempfile
from dataclasses import dataclass, replace
from pathlib import Path

from .config import DOX_AGENT_ROOT

# Fund report files: <year_from>_<year_to>_<project_no>_<pi>_<title>.pdf (corpus_management §3.3).
# Project-metadata archives reuse the same naming convention as Markdown, so both kinds
# mark a corpus as ``fund`` and feed the filename-derived metadata.
FUND_NAME_PATTERN = re.compile(r"^\d{4}_\d{4}_[A-Za-z0-9]+_[^_]+_.+\.(?:pdf|md|markdown)$", re.IGNORECASE)
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
    alias: str = ""  # optional friendly name persisted by id (KB-5); canonical name = dir_name
    dir_name: str = ""
    description: str = ""  # W2: user-editable short note, kept separate from the directory name
    missing: bool = False  # KB-5d: stable id present in corpora.json but its directory is gone


OVERRIDES_FILENAME = "corpora.json"
STATE_FILES = ("workspace.sqlite3", "reports.sqlite3", "runs.sqlite3", "artifacts.sqlite3",
               "custom_tasks.sqlite3", "custom_templates.sqlite3", "corpora.json",
               "official-preparation.json")
DEMO_DIRNAME = "demo_langchain"


def rewrite_origins(db_path: Path, old_root: Path, new_root: Path, log: list[str]) -> None:
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
            rewrite_origins(new_demo / DB_DIRNAME / "knowledge.sqlite3", old_demo, new_demo, log)
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


def _read_corpus_override_data(settings) -> dict:
    path = settings.state_dir / OVERRIDES_FILENAME
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as exc:
        raise ValueError(f"知识库记录文件无法读取或已损坏：{path}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"知识库记录文件格式无效：{path}")
    if any(not isinstance(entry, dict) for entry in value.values()):
        raise ValueError(f"知识库记录文件包含无效条目：{path}")
    return value


def load_corpus_overrides(settings) -> dict[str, dict]:
    """§11/KB-5a: id-keyed overrides ``{id: {id, rel, alias?, created?, kind?, domain?}}``.

    Legacy rel-keyed entries (K6) are converted on read; the scan writes the stable id back.
    """
    data = _read_corpus_override_data(settings)
    overrides: dict[str, dict] = {}
    for key, value in data.items():
        # Prefer alias; fall back to the legacy K6 display `name`. Drop `name` so clearing
        # `alias` on rename actually takes effect (no shadowing).
        alias = str(value.get("alias") or value.get("name") or "")
        entry = {field: item for field, item in value.items() if field != "name"}
        if value.get("rel") or value.get("id"):
            overrides[str(key)] = {**entry, "id": str(value.get("id") or key), "alias": alias}
        else:
            corpus_id = corpus_id_for(str(key))
            overrides[corpus_id] = {**entry, "rel": str(key), "id": corpus_id, "alias": alias}
    return overrides


def save_corpus_overrides(settings, overrides: dict[str, dict]) -> None:
    settings.state_dir.mkdir(parents=True, exist_ok=True)
    path = settings.state_dir / OVERRIDES_FILENAME
    content = json.dumps(overrides, ensure_ascii=False, indent=2)
    fd, temp_name = tempfile.mkstemp(prefix=".corpora-", dir=settings.state_dir)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        Path(temp_name).unlink(missing_ok=True)


_RESERVED_NAMES = {"CON", "PRN", "AUX", "NUL",
                   *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


def valid_corpus_name(name: str) -> bool:
    """Filesystem-safe corpus directory name (T5: separators, reserved names, trailing dot/space)."""
    name = name.strip() if isinstance(name, str) else ""
    if not name or len(name) > 80 or name.startswith(".") or name in ROLE_DIRNAMES:
        return False
    if any(ch in name for ch in '/\\\n\r\t') or name != name.rstrip(". "):
        return False
    return name.split(".")[0].upper() not in _RESERVED_NAMES


def corpus_root_for(settings) -> Path:
    """The corpus root scanned for corpora (``CORPORA_ROOT``, default ``.knowledge``)."""
    return Path(settings.corpora_root).resolve()


def resolve_default(infos: list[CorpusInfo], settings=None) -> CorpusInfo | None:
    """Return the first present corpus in the server's directory-name order.

    ``settings`` remains optional for callers from older code; DEFAULT_CORPUS no longer
    affects conversation scope or API ordering.
    """
    return next((info for info in sorted(infos, key=lambda item: item.rel_path) if not info.missing), None)


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


def _has_fund_file(directory: Path) -> bool:
    return any(path.is_file() and FUND_NAME_PATTERN.match(path.name) for path in directory.rglob("*"))


def _preparation(count: int, sqlite_exists: bool) -> str:
    return "ready" if count > 0 else ("empty" if sqlite_exists else "uninitialized")


def scan_corpora(settings) -> list[CorpusInfo]:
    """List legal direct child directories in stable name order, including empty corpora.

    Raw files live (recursively) under ``<corpus>/source``; sqlite and vector store live in
    ``<corpus>/datadb`` and ``<corpus>/vectordb``. Legacy aliases are retained as metadata but
    the directory name is the displayed name.
    """
    root = corpus_root_for(settings)
    raw_persisted = _read_corpus_override_data(settings)
    persisted = load_corpus_overrides(settings)  # id-keyed (KB-5a)
    config: dict[str, dict] = {}
    for entry in settings.corpora or []:
        rel = str(entry.get("path", "")).strip("/")
        if rel:
            config[rel] = entry
    by_rel: dict[str, dict] = {}
    for corpus_id, entry in persisted.items():
        rel = str(entry.get("rel", "")).strip("/")
        if rel:
            by_rel[rel] = {"id": corpus_id, **entry}

    found: dict[str, CorpusInfo] = {}
    # A normalized read must still rewrite legacy rel-keyed/name records.
    dirty = raw_persisted != persisted
    if root.is_dir():
        for child in sorted(path for path in root.iterdir() if path.is_dir() and not path.is_symlink()):
            if child.name.startswith(".") or child.name in ROLE_DIRNAMES:
                continue
            rel = child.relative_to(root).as_posix()
            persisted_entry = by_rel.get(rel, {})
            config_entry = config.get(rel, {})
            created = bool(persisted_entry.get("created") or config_entry.get("created"))
            source_dir = child / SOURCE_DIRNAME
            corpus_id = str(persisted_entry.get("id") or config_entry.get("id") or corpus_id_for(rel))
            alias = str(persisted_entry.get("alias") or persisted_entry.get("name") or config_entry.get("name") or "")
            db_dir = child / DB_DIRNAME
            sqlite_path = db_dir / "knowledge.sqlite3"
            count = _docs_count(sqlite_path) if sqlite_path.is_file() else 0
            kind = persisted_entry.get("kind") or config_entry.get("kind") or ("fund" if _has_fund_file(source_dir) else "unknown")
            domain = str(persisted_entry.get("domain") or config_entry.get("domain") or child.name)
            description = str(persisted_entry.get("description") or config_entry.get("description") or "")
            found[rel] = CorpusInfo(
                id=corpus_id, name=child.name, alias=alias, dir_name=child.name,
                kind=str(kind), domain=domain, rel_path=rel, root=child, source_dir=source_dir,
                db_dir=db_dir, vectordb_dir=child / VECTOR_DIRNAME,
                sqlite=sqlite_path if sqlite_path.is_file() else None,
                docs_count=count, preparation=_preparation(count, sqlite_path.is_file()),
                description=description,
            )
            # Keep path-derived ids identifiable after an external move, while marking them
            # as generated so explicit reassociation can distinguish them from owned ids.
            current = persisted.get(corpus_id)
            generated = bool(current.get("generated")) if current is not None else not bool(config_entry or created)
            if (current is None or current.get("rel") != rel or current.get("alias", "") != alias
                    or bool(current.get("created")) != created or bool(current.get("generated")) != generated):
                persisted[corpus_id] = {**(current or {}), "id": corpus_id, "rel": rel, "alias": alias,
                                        "created": created, "generated": generated}
                dirty = True
    if dirty:
        save_corpus_overrides(settings, persisted)

    # KB-5d: stable ids whose directory disappeared are surfaced as ``missing`` (not silently 404).
    for corpus_id, entry in persisted.items():
        rel = str(entry.get("rel", "")).strip("/")
        if not rel or rel in found or (root / rel).exists():
            continue
        alias = str(entry.get("alias") or entry.get("name") or "")
        root_dir = root / rel
        found[rel] = CorpusInfo(
            id=corpus_id, name=Path(rel).name, alias=alias, dir_name=Path(rel).name, kind="unknown", domain=rel,
            rel_path=rel, root=root_dir, source_dir=root_dir / SOURCE_DIRNAME, db_dir=root_dir / DB_DIRNAME,
            vectordb_dir=root_dir / VECTOR_DIRNAME, sqlite=None, docs_count=0,
            description=str(entry.get("description") or ""),
            preparation="missing", missing=True,
        )

    infos = list(found.values())
    default = resolve_default(infos, settings)
    if default is not None:
        infos = [replace(info, is_default=(info.id == default.id)) for info in infos]
    return sorted(infos, key=lambda info: (not info.is_default, info.rel_path))
