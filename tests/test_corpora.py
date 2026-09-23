"""Corpus registry (方案 A / §10): each corpus dir holds source/ + datadb/ + vectordb/."""

import json
import sqlite3

from src.agent.config import Settings
from src.agent.corpora import resolve_default, scan_corpora
from src.knowledge import Document, Knowledge, Page


def make_settings(tmp_path, default_corpus="demo_langchain"):
    return Settings(_env_file=None, corpora_root=tmp_path / "knowledge", default_corpus=default_corpus)


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


def test_corpus_without_source_is_skipped(tmp_path):
    settings = make_settings(tmp_path)
    seed_ready(tmp_path, "demo_langchain")
    (tmp_path / "knowledge" / "empty" / "datadb").mkdir(parents=True)
    assert "empty" not in {item.rel_path for item in scan_corpora(settings)}


def test_default_corpus_resolves_by_name_then_first_ready(tmp_path):
    settings = make_settings(tmp_path)
    seed_ready(tmp_path, "demo_langchain", 2)
    seed_ready(tmp_path, "自然科学基金", 3)
    infos = scan_corpora(settings)
    default = next(item for item in infos if item.is_default)
    assert default.rel_path == "demo_langchain" and default.docs_count == 2
    assert resolve_default(infos, settings).id == default.id

    # DEFAULT_CORPUS missing -> first ready corpus by rel_path (never raises).
    fallback = next(item for item in scan_corpora(make_settings(tmp_path, "missing")) if item.is_default)
    assert fallback.preparation == "ready"


def test_no_ready_corpus_has_no_default(tmp_path):
    settings = make_settings(tmp_path)
    source = tmp_path / "knowledge" / "only" / "source"
    source.mkdir(parents=True)
    (source / "a.md").write_text("x", encoding="utf-8")
    infos = scan_corpora(settings)
    assert infos and not any(item.is_default for item in infos)
    assert resolve_default(infos, settings) is None


def test_legacy_display_names_migrate_to_alias(tmp_path):
    # Given a legacy K6 rel-keyed display name in corpora.json
    settings = make_settings(tmp_path, default_corpus="自然科学基金")
    seed_ready(tmp_path, "自然科学基金")
    state = tmp_path / "knowledge" / ".state"
    state.mkdir(parents=True, exist_ok=True)
    (state / "corpora.json").write_text(json.dumps({"自然科学基金": {"name": "友好名"}}), encoding="utf-8")
    # When scanning, the friendly name survives as an alias (A regression fix)
    info = next(item for item in scan_corpora(settings) if item.rel_path == "自然科学基金")
    assert info.alias == "友好名" and info.name == "友好名"


def test_migrate_layout_moves_demo_state_and_rewrites_origins(tmp_path, monkeypatch):
    from src.agent import corpora
    monkeypatch.setattr(corpora, "DOX_AGENT_ROOT", tmp_path)
    root = tmp_path / ".knowledge"
    # legacy app state under data/
    (tmp_path / "data").mkdir()
    for name in ("workspace.sqlite3", "reports.sqlite3", "corpora.json", "official-preparation.json"):
        (tmp_path / "data" / name).write_text(name, encoding="utf-8")
    # legacy demo corpus with a file-type origin (M1)
    demo = tmp_path / ".demo_langchain"
    raw = demo / "source" / "README.md"
    raw.parent.mkdir(parents=True)
    raw.write_text("正文", encoding="utf-8")
    store = Knowledge(demo / "datadb" / "knowledge.sqlite3")
    store.put(Document(title="README", origin=str(raw), kind="text", parser="markdown",
                       pages=[Page(number=1, text="正文")], markdown="正文"))
    settings = Settings(_env_file=None, corpora_root=root, state_dir=root / ".state",
                        default_corpus="demo_langchain")

    log = corpora.migrate_layout(settings)

    assert log and not demo.exists()
    new_raw = root / "demo_langchain" / "source" / "README.md"
    assert new_raw.is_file()
    moved = Knowledge(root / "demo_langchain" / "datadb" / "knowledge.sqlite3")
    assert moved.all()[0]["origin"] == str(new_raw)  # origin rewritten, id stable
    assert (root / ".state" / "workspace.sqlite3").read_text(encoding="utf-8") == "workspace.sqlite3"
    assert not (tmp_path / "data").exists()
