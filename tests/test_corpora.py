"""Corpus registry (方案 A / §10): each corpus dir holds source/ + datadb/ + vectordb/."""

import json
import sqlite3

from src.agent.config import Settings
from src.agent.corpora import resolve_default, scan_corpora


def make_settings(tmp_path):
    return Settings(_env_file=None, corpora_root=tmp_path / "knowledge")


def seed_sqlite(path, count):
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE docs (id TEXT)")
        db.executemany("INSERT INTO docs VALUES (?)", [(str(i),) for i in range(count)])


def seed_ready(tmp_path, name, count=1):
    corpus = tmp_path / "knowledge" / name
    source = corpus / "source"
    source.mkdir(parents=True, exist_ok=True)
    (source / "report.md").write_text("x", encoding="utf-8")
    seed_sqlite(corpus / "datadb" / "knowledge.sqlite3", count)
    return corpus


def test_scan_reads_roles_inside_corpus(tmp_path):
    settings = make_settings(tmp_path)
    seed_ready(tmp_path, "demo_langchain")
    corpus = tmp_path / "knowledge" / "自然科学基金"
    source = corpus / "source" / "人工智能与医疗"
    source.mkdir(parents=True)
    (source / "2021_2025_82030037_张三_基于AI的癫痫研究.pdf").write_bytes(b"%PDF-1.4")
    (corpus / "vectordb").mkdir(parents=True)
    seed_sqlite(corpus / "datadb" / "knowledge.sqlite3", 3)

    info = next(item for item in scan_corpora(settings) if item.rel_path == "自然科学基金")
    assert info.is_default is False
    assert info.kind == "fund"
    assert info.root == corpus
    assert info.source_dir == corpus / "source"
    assert info.db_dir == corpus / "datadb"
    assert info.vectordb_dir == corpus / "vectordb"
    assert info.docs_count == 3
    assert info.preparation == "ready"
    assert info.sqlite == corpus / "datadb" / "knowledge.sqlite3"


def test_fund_kind_accepts_markdown_metadata_naming(tmp_path):
    settings = make_settings(tmp_path)
    seed_ready(tmp_path, "demo_langchain")
    source = tmp_path / "knowledge" / "自然科学基金-AI与信息智能" / "source"
    source.mkdir(parents=True)
    (source / "2022_2025_72172132_陈亚盛_人工智能会计决策系统.md").write_text("x", encoding="utf-8")

    info = next(item for item in scan_corpora(settings) if item.rel_path == "自然科学基金-AI与信息智能")
    assert info.kind == "fund"


def test_uninitialized_corpus_reports_no_sqlite(tmp_path):
    settings = make_settings(tmp_path)
    seed_ready(tmp_path, "demo_langchain")
    source = tmp_path / "knowledge" / "自然科学基金" / "source"
    source.mkdir(parents=True)
    (source / "report.pdf").write_bytes(b"%PDF-1.4")

    info = next(item for item in scan_corpora(settings) if item.rel_path == "自然科学基金")
    assert info.sqlite is None
    assert info.preparation == "uninitialized"
    assert info.db_dir == tmp_path / "knowledge" / "自然科学基金" / "datadb"


def test_empty_directory_is_a_visible_corpus_without_creating_source(tmp_path):
    settings = make_settings(tmp_path)
    seed_ready(tmp_path, "demo_langchain")
    empty = tmp_path / "knowledge" / "empty"
    empty.mkdir()
    item = next(item for item in scan_corpora(settings) if item.rel_path == "empty")
    assert item.name == "empty" and item.preparation == "uninitialized"
    assert not item.source_dir.exists()


def test_first_corpus_is_directory_sorted_and_ignores_readiness(tmp_path):
    settings = make_settings(tmp_path)
    (tmp_path / "knowledge" / "a-empty").mkdir(parents=True)
    seed_ready(tmp_path, "demo_langchain", 2)
    seed_ready(tmp_path, "自然科学基金", 3)
    infos = scan_corpora(settings)
    assert [item.rel_path for item in infos] == ["a-empty", "demo_langchain", "自然科学基金"]
    assert next(item for item in infos if item.is_default).rel_path == "a-empty"
    assert resolve_default(infos).rel_path == "a-empty"


def test_unready_corpus_is_still_the_default_candidate(tmp_path):
    settings = make_settings(tmp_path)
    source = tmp_path / "knowledge" / "only" / "source"
    source.mkdir(parents=True)
    (source / "a.md").write_text("x", encoding="utf-8")
    infos = scan_corpora(settings)
    assert infos and next(item for item in infos if item.is_default).rel_path == "only"
    assert resolve_default(infos).rel_path == "only"


def test_legacy_display_names_migrate_to_alias(tmp_path):
    # Given a legacy K6 rel-keyed display name in corpora.json
    settings = make_settings(tmp_path)
    seed_ready(tmp_path, "自然科学基金")
    state = tmp_path / "knowledge" / ".state"
    state.mkdir(parents=True, exist_ok=True)
    (state / "corpora.json").write_text(json.dumps({"自然科学基金": {"name": "友好名"}}), encoding="utf-8")
    # Aliases remain stored for migration history but never replace directory names.
    info = next(item for item in scan_corpora(settings) if item.rel_path == "自然科学基金")
    assert info.alias == "友好名" and info.name == "自然科学基金"
    first_disk_state = (state / "corpora.json").read_text(encoding="utf-8")
    migrated = json.loads(first_disk_state)
    assert list(migrated) == [info.id]
    assert migrated[info.id]["alias"] == "友好名" and "name" not in migrated[info.id]
    scan_corpora(settings)
    assert (state / "corpora.json").read_text(encoding="utf-8") == first_disk_state


def test_user_scan_with_corrupt_corpus_registry_preserves_file_and_fails_clearly(tmp_path):
    settings = make_settings(tmp_path)
    seed_ready(tmp_path, "自然科学基金")
    state = tmp_path / "knowledge" / ".state"
    state.mkdir(parents=True)
    registry = state / "corpora.json"
    registry.write_text("{invalid", encoding="utf-8")

    import pytest
    with pytest.raises(ValueError, match="无法读取或已损坏"):
        scan_corpora(settings)
    assert registry.read_text(encoding="utf-8") == "{invalid"
