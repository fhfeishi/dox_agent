"""Corpus registry (方案 A): each corpus dir holds source/ + datadb/ + vectordb/."""

import sqlite3

from src.agent.config import Settings
from src.agent.corpora import scan_corpora


def make_settings(tmp_path):
    return Settings(
        _env_file=None,
        corpora_root=tmp_path / "knowledge",
        data_dir=tmp_path / "demo" / "datadb",
    )


def seed_sqlite(path, count):
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE docs (id TEXT)")
        db.executemany("INSERT INTO docs VALUES (?)", [(str(i),) for i in range(count)])


def test_scan_reads_roles_inside_corpus(tmp_path):
    settings = make_settings(tmp_path)
    corpus = tmp_path / "knowledge" / "自然科学基金"
    source = corpus / "source" / "人工智能与医疗"
    source.mkdir(parents=True)
    (source / "2021_2025_82030037_张三_基于AI的癫痫研究.pdf").write_bytes(b"%PDF-1.4")
    (corpus / "vectordb").mkdir(parents=True)
    seed_sqlite(corpus / "datadb" / "knowledge.sqlite3", 3)

    corpora = [info for info in scan_corpora(settings) if not info.is_default]
    assert len(corpora) == 1
    info = corpora[0]
    assert info.rel_path == "自然科学基金"
    assert info.kind == "fund"
    assert info.root == corpus
    assert info.source_dir == corpus / "source"
    assert info.db_dir == corpus / "datadb"
    assert info.vectordb_dir == corpus / "vectordb"
    assert info.docs_count == 3
    assert info.preparation == "ready"
    assert info.sqlite == corpus / "datadb" / "knowledge.sqlite3"


def test_uninitialized_corpus_reports_no_sqlite(tmp_path):
    settings = make_settings(tmp_path)
    source = tmp_path / "knowledge" / "自然科学基金" / "source"
    source.mkdir(parents=True)
    (source / "report.pdf").write_bytes(b"%PDF-1.4")

    info = next(item for item in scan_corpora(settings) if not item.is_default)
    assert info.sqlite is None
    assert info.preparation == "uninitialized"
    assert info.db_dir == tmp_path / "knowledge" / "自然科学基金" / "datadb"


def test_corpus_without_source_is_skipped(tmp_path):
    settings = make_settings(tmp_path)
    (tmp_path / "knowledge" / "empty" / "datadb").mkdir(parents=True)
    assert [item for item in scan_corpora(settings) if not item.is_default] == []


def test_active_corpus_outside_root_is_default(tmp_path):
    settings = make_settings(tmp_path)
    seed_sqlite(tmp_path / "demo" / "datadb" / "knowledge.sqlite3", 2)

    corpora = scan_corpora(settings)
    assert len(corpora) == 1
    info = corpora[0]
    assert info.is_default is True
    assert info.rel_path == "demo"
    assert info.root == tmp_path / "demo"
    assert info.db_dir == tmp_path / "demo" / "datadb"
    assert info.vectordb_dir == tmp_path / "demo" / "vectordb"
    assert info.docs_count == 2
