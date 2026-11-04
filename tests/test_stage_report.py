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
from src.knowledge import Document, Knowledge, Page


@pytest.mark.parametrize("schema", [
    "current", "populated", "unregistered", "legacy_registry", "legacy", "empty", "bad", "missing_pages",
])
@pytest.mark.parametrize("json_output", [True, False])
def test_stage_report_cli_does_not_initialize_or_migrate_sqlite(tmp_path, schema, json_output):
    corpora = tmp_path / ("corpora#" if os.name == "nt" else "corpora?#")
    root = corpora / "fixture"
    database = root / "datadb" / "knowledge.sqlite3"
    database.parent.mkdir(parents=True)
    (root / "source").mkdir()
    if schema in ("current", "populated", "unregistered", "legacy_registry", "missing_pages"):
        store = Knowledge(database, source_root=root / "source")
        if schema == "populated":
            source = root / "source" / "note.md"
            source.write_text("fixture text", encoding="utf-8")
            stat = source.stat()
            store.put(Document(title="note", origin=str(source.resolve()), kind="text", parser="markdown",
                               pages=[Page(number=1, text="fixture text")]),
                      source_file=("note.md", stat.st_size, stat.st_mtime_ns, "sha"))
        if schema == "missing_pages":
            with sqlite3.connect(database) as connection:
                connection.execute("DROP TABLE doc_pages")
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
    elif schema == "bad":
        database.write_bytes(b"not a SQLite database")
    else:
        database.touch()
    settings = Settings(_env_file=None, corpora_root=corpora, state_dir=tmp_path / "state", corpora=[])
    if schema == "legacy_registry":
        settings.state_dir.mkdir()
        (settings.state_dir / "corpora.json").write_text(json.dumps({"fixture": {"name": "Old alias"}}))
    elif schema != "unregistered":
        scan_corpora(settings)
    before = {path.relative_to(tmp_path): (path.read_bytes(), path.stat().st_mtime_ns)
              for path in tmp_path.rglob("*") if path.is_file()}
    script = Path(__file__).resolve().parents[1] / "datapipe" / "scripts" / "stage_report.py"
    result = subprocess.run([sys.executable, str(script), *(["--json"] if json_output else [])], cwd=tmp_path,
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
    if schema in ("current", "populated", "unregistered", "legacy_registry"):
        assert result.returncode == 0, result.stdout + result.stderr
        documents = int(schema == "populated")
        if json_output:
            rows = json.loads(result.stdout)
            assert len(rows) == 1
            assert (rows[0]["name"], rows[0]["documents"]) == ("fixture", documents)
            if documents:
                assert rows[0]["counts"] == {"source": {"present": 1}, "parse": {"none": 1},
                                             "search": {"current": 1}, "extract": {"missing": 1}}
                assert rows[0]["rows"][0]["rel_path"] == "note.md"
        else:
            assert "fixture" in result.stdout
            assert f"库 1 个，条目 {documents} 份" in result.stdout
    else:
        assert result.returncode == 1, result.stdout + result.stderr
        assert result.stdout == ""
        assert "stage_report: refused" in result.stderr
        assert "fixture" in result.stderr
        assert "Traceback" not in result.stderr
        reason = {"legacy": "files", "empty": "docs", "bad": "not a database",
                  "missing_pages": "doc_pages"}[schema]
        assert reason in result.stderr
