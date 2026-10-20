"""Card B3: the shared connection and the user_version migrator, on synthetic files only."""
import json
import os
import sqlite3

import pytest

from src.core import db
from src.core.db import MigrationError, connect, migrate, restore, version


def rows(path, table):
    with connect(path, readonly=True) as con:
        return con.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()


def legacy(path, sql, inserts=()):
    """A file as earlier code left it: tables and rows, user_version 0."""
    con = sqlite3.connect(path)
    con.executescript(sql)
    for statement, values in inserts:
        con.execute(statement, values)
    con.commit()
    con.close()


STEPS = [
    "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, body TEXT)",
    "ALTER TABLE notes ADD COLUMN author TEXT NOT NULL DEFAULT ''",
]


def test_connect_closes_at_the_end_of_its_block(tmp_path):
    with connect(tmp_path / "a.sqlite3") as con:
        assert con.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    with pytest.raises(sqlite3.ProgrammingError):
        con.execute("SELECT 1")


def test_an_empty_file_is_migrated_in_place_without_a_backup(tmp_path):
    path = tmp_path / "new.sqlite3"
    assert migrate(path, STEPS) == 0
    assert version(path) == 2
    assert [c[1] for c in sqlite3.connect(path).execute("PRAGMA table_info(notes)")] == ["id", "body", "author"]
    assert not (tmp_path / "backups").exists()
    assert migrate(path, STEPS) == 2  # already current: nothing happens


def test_a_file_with_data_is_backed_up_staged_checked_and_replaced(tmp_path):
    path = tmp_path / "old.sqlite3"
    legacy(path, STEPS[0], [("INSERT INTO notes VALUES (?,?)", ("n1", "正文"))])
    assert migrate(path, STEPS) == 0
    assert version(path) == 2 and rows(path, "notes") == [("n1", "正文", "")]
    record = json.loads((tmp_path / "old.sqlite3.migration.json").read_text())
    backup = record["backup"]
    assert record["from"] == 0 and record["to"] == 2 and version(backup) == 0
    assert rows(backup, "notes") == [("n1", "正文")]
    assert not (tmp_path / "old.sqlite3.migrating").exists()


def test_a_failing_step_leaves_the_original_untouched(tmp_path):
    path = tmp_path / "old.sqlite3"
    legacy(path, STEPS[0], [("INSERT INTO notes VALUES (?,?)", ("n1", "正文"))])
    before = path.read_bytes()
    with pytest.raises(MigrationError, match="步骤 2"):
        migrate(path, [STEPS[0], "ALTER TABLE missing ADD COLUMN x TEXT"])
    assert path.read_bytes() == before and version(path) == 0
    assert not (tmp_path / "old.sqlite3.migrating").exists()


def test_a_migration_interrupted_before_the_switch_is_redone_cleanly(tmp_path, monkeypatch):
    path = tmp_path / "old.sqlite3"
    legacy(path, STEPS[0], [("INSERT INTO notes VALUES (?,?)", ("n1", "正文"))])
    before = path.read_bytes()

    class PowerCut(BaseException):
        """Not an Exception: nothing cleans up, as when the process dies mid-migration."""

    def power_cut(*args):
        raise PowerCut

    real_replace = os.replace
    monkeypatch.setattr(db.os, "replace", power_cut)
    with pytest.raises(PowerCut):
        migrate(path, STEPS)
    assert path.read_bytes() == before and (tmp_path / "old.sqlite3.migrating").exists()
    monkeypatch.setattr(db.os, "replace", real_replace)
    migrate(path, STEPS)
    assert version(path) == 2 and rows(path, "notes") == [("n1", "正文", "")]


def test_restore_rolls_back_only_while_nothing_was_written_since(tmp_path):
    path = tmp_path / "old.sqlite3"
    legacy(path, STEPS[0], [("INSERT INTO notes VALUES (?,?)", ("n1", "正文"))])
    migrate(path, STEPS)
    restore(path)
    assert version(path) == 0 and rows(path, "notes") == [("n1", "正文")]

    migrate(path, STEPS)
    with connect(path) as con:
        con.execute("INSERT INTO notes VALUES ('n2', '迁移后写入', '')")
    with pytest.raises(MigrationError, match="新的写入"):
        restore(path)
    assert version(path) == 2 and len(rows(path, "notes")) == 2


def test_a_file_newer_than_the_code_is_refused(tmp_path):
    path = tmp_path / "new.sqlite3"
    migrate(path, STEPS)
    with pytest.raises(MigrationError, match="高于"):
        migrate(path, STEPS[:1])


# --- every application store: empty file → latest, and a pre-B3 file with data → latest, unchanged ---

def stores(tmp_path):
    from src.artifacts import ArtifactStore
    from src.auth import Accounts
    from src.corpus_groups import GroupStore
    from src.custom_tasks import CustomTaskStore
    from src.custom_templates import TemplateStore
    from src.project_index import ProjectIndex
    from src.prompt_skills import PromptSkillStore
    from src.runs import RunStore
    from src.web_snapshots import WebSnapshotStore
    from src.workspace import Workspace

    state = tmp_path / "state"
    accounts = Accounts(tmp_path / "usr")  # conftest may redirect the folder: use the store's own path
    return {
        "runs": (lambda: RunStore(state / "runs.sqlite3"), state / "runs.sqlite3"),
        "workspace": (lambda: Workspace(state / "workspace.sqlite3"), state / "workspace.sqlite3"),
        "groups": (lambda: GroupStore(state / "workspace.sqlite3"), state / "workspace.sqlite3"),
        "tasks": (lambda: CustomTaskStore(state / "custom_tasks.sqlite3"), state / "custom_tasks.sqlite3"),
        "skills": (lambda: PromptSkillStore(state / "prompt_skills.sqlite3"), state / "prompt_skills.sqlite3"),
        "templates": (lambda: TemplateStore(state / "artifacts" / "templates.sqlite3"), state / "artifacts" / "templates.sqlite3"),
        "artifacts": (lambda: ArtifactStore(state / "artifacts" / "artifacts.sqlite3"), state / "artifacts" / "artifacts.sqlite3"),
        "snapshots": (lambda: WebSnapshotStore(state / "web_snapshots.sqlite3"), state / "web_snapshots.sqlite3"),
        "projects": (lambda: ProjectIndex(state / "project_index.sqlite3"), state / "project_index.sqlite3"),
        "accounts": (lambda: accounts.connect().close(), accounts.path),
    }


def test_every_store_creates_an_empty_file_at_the_latest_version(tmp_path):
    for name, (open_store, path) in stores(tmp_path).items():
        open_store()
        assert version(path) >= 1, name
        assert not (path.parent / "backups").exists(), name


# Pre-B3 files: the tables the stores created on open before migrations, with one row each.
LEGACY = {
    "runs.sqlite3": ("CREATE TABLE runs (run_id TEXT PRIMARY KEY, contract_version INTEGER NOT NULL, created_at TEXT NOT NULL, "
                     "updated_at TEXT NOT NULL, session_key TEXT NOT NULL DEFAULT '', parent_run_id TEXT NOT NULL DEFAULT '', "
                     "run_type TEXT NOT NULL, status TEXT NOT NULL, task_id TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', "
                     "resource_policy TEXT NOT NULL DEFAULT '', fingerprint TEXT NOT NULL, payload TEXT NOT NULL)",
                     "INSERT INTO runs VALUES ('r1',1,'t','t','s','','report','completed','task4','m','','f','{}')", "runs"),
    "workspace.sqlite3": ("CREATE TABLE records (id TEXT PRIMARY KEY, kind TEXT, revision INTEGER, payload TEXT);"
                          "CREATE TABLE corpus_groups (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER, payload TEXT)",
                          "INSERT INTO records VALUES ('s1','session',3,'{\"title\":\"会话\"}')", "records"),
    "custom_tasks.sqlite3": ("CREATE TABLE tasks (id TEXT PRIMARY KEY, draft TEXT NOT NULL);"
                             "CREATE TABLE versions (task_id TEXT NOT NULL, version INTEGER NOT NULL, definition TEXT NOT NULL, PRIMARY KEY (task_id, version))",
                             "INSERT INTO versions VALUES ('custom-1',1,'{}')", "versions"),
    "web_snapshots.sqlite3": ("CREATE TABLE web_snapshots (id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
                              "INSERT INTO web_snapshots VALUES ('w1','{}')", "web_snapshots"),
    "project_index.sqlite3": ("CREATE TABLE project_documents (corpus TEXT, doc TEXT, signature TEXT, payload TEXT, PRIMARY KEY(corpus,doc));"
                              "CREATE TABLE topic_merges (id TEXT PRIMARY KEY, corpus TEXT, dimension TEXT, name TEXT, members TEXT, replaces TEXT, created TEXT, undone TEXT)",
                              "INSERT INTO topic_merges VALUES ('m1','c','技术','合并','[]','[]','t',NULL)", "topic_merges"),
}


def test_every_pre_migration_file_reaches_the_latest_version_with_its_rows(tmp_path):
    all_stores = stores(tmp_path)
    state = tmp_path / "state"
    state.mkdir()
    for filename, (schema, insert, _) in LEGACY.items():
        legacy(state / filename, schema, [(insert, ())])
    for key in ("runs", "workspace", "groups", "tasks", "snapshots", "projects"):
        all_stores[key][0]()
    for filename, (_, _, table) in LEGACY.items():
        path = state / filename
        assert version(path) >= 1, filename
        assert len(rows(path, table)) == 1, filename
        record = json.loads(path.with_name(filename + ".migration.json").read_text())
        assert rows(record["backup"], table) == rows(path, table), filename
