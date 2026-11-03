"""Exercise the diagnostic CLI before Knowledge construction, against isolated SQLite files."""
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from src.agent.config import Settings
from src.agent.corpora import scan_corpora
from src.knowledge import Knowledge


@pytest.mark.parametrize("schema", [
    "current",
    pytest.param("unregistered", marks=pytest.mark.xfail(strict=False, raises=AssertionError, reason=(
        "Read-only stage_report must not create corpus registry metadata during scan_corpora"
    ))),
    *[pytest.param(schema, marks=pytest.mark.xfail(strict=False, raises=AssertionError, reason=(
        "stage_report advertises read-only inspection: old/empty SQLite must not be migrated "
        "or initialized by constructing Knowledge; explicit refusal is acceptable"
    ))) for schema in ("legacy", "empty")],
])
def test_stage_report_cli_does_not_initialize_or_migrate_sqlite(tmp_path, schema):
    corpora = tmp_path / "corpora"
    root = corpora / "fixture"
    database = root / "datadb" / "knowledge.sqlite3"
    database.parent.mkdir(parents=True)
    (root / "source").mkdir()
    if schema in ("current", "unregistered"):
        Knowledge(database, source_root=root / "source")
    elif schema == "legacy":
        connection = sqlite3.connect(database)
        try:
            connection.executescript("""
                CREATE TABLE docs (id TEXT PRIMARY KEY, version TEXT NOT NULL, payload TEXT NOT NULL);
                CREATE TABLE files (
                    rel_path TEXT PRIMARY KEY, size INTEGER NOT NULL, mtime_ns INTEGER NOT NULL,
                    sha256 TEXT NOT NULL, doc_id TEXT, status TEXT NOT NULL, updated_at TEXT NOT NULL);
            """)
        finally:
            connection.close()
    else:
        database.touch()
    settings = Settings(_env_file=None, corpora_root=corpora, state_dir=tmp_path / "state", corpora=[])
    if schema != "unregistered":
        scan_corpora(settings)
    before = {path.relative_to(tmp_path): (path.read_bytes(), path.stat().st_mtime_ns)
              for path in tmp_path.rglob("*") if path.is_file()}
    script = Path(__file__).resolve().parents[1] / "datapipe" / "scripts" / "stage_report.py"
    result = subprocess.run([sys.executable, str(script), "--json"], cwd=tmp_path,
                            env={**os.environ, "CORPORA_ROOT": str(corpora), "STATE_DIR": str(settings.state_dir),
                                 "CORPORA": "[]", "EMBEDDING_PATH": "", "DOX_ENV_FILE": ""},
                            capture_output=True, text=True, timeout=30)
    after = {path.relative_to(tmp_path): (path.read_bytes(), path.stat().st_mtime_ns)
             for path in tmp_path.rglob("*") if path.is_file()}
    changed = sorted(str(path) for path in before.keys() | after.keys() if before.get(path) != after.get(path))
    byte_changes = sorted(str(path) for path in before.keys() | after.keys()
                          if before.get(path, (None,))[0] != after.get(path, (None,))[0])
    assert not changed, (f"CLI modified {changed}; byte changes={byte_changes}; "
                         f"exit={result.returncode}; stderr={result.stderr}")
    if schema in ("current", "unregistered"):
        assert result.returncode == 0, result.stdout + result.stderr
        rows = json.loads(result.stdout)
        assert len(rows) == 1
        assert (rows[0]["name"], rows[0]["documents"]) == ("fixture", 0)
