"""One way to open and evolve the application's SQLite files (upgrade plan card B3).

``connect`` gives every store the same timeout and foreign-key setting, and closes the connection when
its ``with`` block ends (``sqlite3.connect`` only commits there, which left handles open until garbage
collection). ``migrate`` brings a file to the newest of its ordered schema steps, recorded in
``PRAGMA user_version``:

- a new or empty file is migrated in place;
- a file that holds data is first backed up, then the steps run on a staged copy, the copy passes
  ``PRAGMA integrity_check`` and only then replaces the original in one rename — a failure at any
  step leaves the original untouched;
- each migration of a file with data writes ``<file>.migration.json`` naming the backup and a digest
  of the migrated file, so ``restore`` puts the backup back only while nothing has been written since;
  after new writes it refuses rather than lose them.

Steps are SQL scripts or functions taking the connection; each runs in its own transaction together
with the version bump. Steps are append-only: an applied step is never edited, a change is a new step.
The journal mode stays the default (rollback journal) for now; see .logsdev/design/系统.md §3.
"""

import hashlib
import json
import os
import sqlite3
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path

Step = str | Callable[[sqlite3.Connection], None]
TIMEOUT = 30


class MigrationError(RuntimeError):
    pass


class _Closing(sqlite3.Connection):
    def __exit__(self, *exc):
        try:
            return super().__exit__(*exc)
        finally:
            self.close()


def connect(path: Path | str, *, timeout: float = TIMEOUT, readonly: bool = False, uri: bool = False) -> sqlite3.Connection:
    """A connection that commits (or rolls back) and closes at the end of its ``with`` block."""
    target = f"file:{Path(path).as_posix()}?mode=ro" if readonly else str(path)
    db = sqlite3.connect(target, timeout=timeout, uri=readonly or uri, factory=_Closing)
    db.execute("PRAGMA foreign_keys = ON")
    return db


def version(path: Path | str) -> int:
    with connect(path, readonly=True) as db:
        return db.execute("PRAGMA user_version").fetchone()[0]


def _has_tables(path: Path) -> bool:
    with connect(path, readonly=True) as db:
        return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' LIMIT 1").fetchone() is not None


def _copy(source: Path, dest: Path):
    """A consistent copy through SQLite's backup API (safe while other readers are open)."""
    with connect(source, readonly=True) as old, connect(dest) as new:
        old.backup(new)


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _apply(db: sqlite3.Connection, steps: Sequence[Step], start: int):
    db.isolation_level = None  # explicit transactions: one per step, version bump included
    for number, step in enumerate(steps[start:], start + 1):
        try:
            if isinstance(step, str):
                db.executescript(f"BEGIN;\n{step}\n;PRAGMA user_version = {number};\nCOMMIT;")
            else:
                db.execute("BEGIN")
                step(db)
                db.execute(f"PRAGMA user_version = {number}")
                db.execute("COMMIT")
        except Exception as exc:
            if db.in_transaction:
                db.execute("ROLLBACK")
            raise MigrationError(f"迁移步骤 {number} 失败：{exc}") from exc


def migrate(path: Path | str, steps: Sequence[Step], *, backups: Path | None = None) -> int:
    """Bring ``path`` to ``len(steps)``; returns the version it started from."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    target = len(steps)
    if not path.exists() or not _has_tables(path):
        start = version(path) if path.exists() else 0
        with connect(path) as db:
            _apply(db, steps, start)
        return start
    start = version(path)
    if start == target:
        return start
    if start > target:
        raise MigrationError(f"{path.name} 的结构版本 {start} 高于程序支持的 {target}：请使用更新的程序版本")
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    folder = backups or path.parent / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    backup = folder / f"{path.stem}.v{start}.{stamp}{path.suffix}"
    stage = path.with_name(path.name + ".migrating")
    stage.unlink(missing_ok=True)
    _copy(path, backup)
    _copy(path, stage)
    try:
        with connect(stage) as db:
            _apply(db, steps, start)
            check = db.execute("PRAGMA integrity_check").fetchone()[0]
        if check != "ok":
            raise MigrationError(f"迁移后完整性检查未通过：{check}")
        os.replace(stage, path)
    except Exception:
        stage.unlink(missing_ok=True)
        raise
    record = {"from": start, "to": target, "backup": str(backup), "migrated_at": stamp, "sha256": _digest(path)}
    path.with_name(path.name + ".migration.json").write_text(json.dumps(record, ensure_ascii=False, indent=1))
    return start


def restore(path: Path | str) -> Path:
    """Undo the last migration of ``path`` from its backup, only while nothing was written since."""
    path = Path(path)
    marker = path.with_name(path.name + ".migration.json")
    if not marker.exists():
        raise MigrationError(f"{path.name} 没有可回滚的迁移记录")
    record = json.loads(marker.read_text())
    if _digest(path) != record["sha256"]:
        raise MigrationError(f"{path.name} 在迁移后已有新的写入，直接回滚会丢失这些写入；请先导出新数据再处理")
    backup = Path(record["backup"])
    stage = path.with_name(path.name + ".restoring")
    _copy(backup, stage)
    os.replace(stage, path)
    marker.unlink()
    return backup
