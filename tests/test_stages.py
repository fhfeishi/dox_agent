"""P0-4: the stage view reports each stage separately, and reading it never writes."""
import json

from src.agent.corpora import CorpusInfo
from src.knowledge import Document, Knowledge, Page
from src.parse_cache import write_cache
from src.stages import stage_view


def corpus(tmp_path):
    root = tmp_path / ".knowledge" / "fixture"
    (root / "source").mkdir(parents=True)
    (root / "datadb").mkdir(parents=True)
    (root / "target").mkdir(parents=True)
    return CorpusInfo(id="fixture", name="fixture", kind="fund", domain="", rel_path="fixture",
                      root=root, source_dir=root / "source", db_dir=root / "datadb",
                      vectordb_dir=root / "vectordb", sqlite=root / "datadb" / "knowledge.sqlite3",
                      docs_count=0, preparation="ready")


def publish(store, info, rel="a.md", text="正文"):
    path = info.source_dir / rel
    path.write_text(text, encoding="utf-8")
    stat = path.stat()
    return store.put(Document(title=rel, origin=str(path.resolve()), kind="text", parser="markdown",
                              pages=[Page(number=1, text=text)]),
                     source_file=(rel, stat.st_size, stat.st_mtime_ns, "sha"))


def view(tmp_path):
    info = corpus(tmp_path)
    store = Knowledge(info.sqlite, source_root=info.source_dir)
    return info, store


def test_stage_view_reports_every_stage_separately(tmp_path):
    """A failed re-parse of an unchanged source keeps its published text searchable: ``search``
    stays ``current`` while ``parse`` says ``failed`` — one merged word would hide that."""
    info, store = view(tmp_path)
    doc = publish(store, info)
    # A parse error is recorded on the manifest row, exactly as a failed re-parse leaves it.
    store.record_file("a.md", 6, (info.source_dir / "a.md").stat().st_mtime_ns, "sha",
                      doc["doc_id"], "indexed", last_error="超时")
    result = stage_view(store, info)
    row = result["rows"][0]
    assert (row["source"], row["parse"], row["search"]) == ("present", "failed", "current")
    assert result["counts"]["search"] == {"current": 1}
    assert result["counts"]["parse"] == {"failed": 1}
    # No four-facet record was written, so extraction has not run for this document.
    assert row["extract"] == "missing"


def test_stage_view_counts_a_changed_and_a_missing_source(tmp_path):
    info, store = view(tmp_path)
    first = publish(store, info)
    (info.source_dir / "a.md").write_text("改过的正文", encoding="utf-8")
    result = stage_view(store, info)
    assert result["rows"][0]["source"] == "changed"
    # The text stays readable, but ``current()`` no longer offers it: new work must not cite a
    # document whose source moved on. This is ``superseded``, not ``current``.
    assert result["rows"][0]["search"] == "superseded"
    assert first["doc_id"] == result["rows"][0]["doc_id"]
    (info.source_dir / "a.md").unlink()
    assert stage_view(store, info)["rows"][0]["source"] == "missing"


def test_stage_view_reports_a_cached_parse(tmp_path):
    """A canonical cache that agrees with the published version reads ``cached``, not ``stale``."""
    info, store = view(tmp_path)
    doc = publish(store, info, rel="b.md")
    parsed = info.root / "parsed" / "b.md"
    parsed.mkdir(parents=True)
    (parsed / "middle_json.json").write_text(json.dumps({"pages": []}), encoding="utf-8")
    (parsed / "markdown.md").write_text("正文", encoding="utf-8")
    write_cache(parsed, rel="b.md", source_sha="sha", version=doc["version"], profile="mineru", pages=1)
    assert stage_view(store, info)["rows"][0]["parse"] == "cached"


def test_stage_view_marks_an_unmarked_legacy_cache_and_leaves_text_unparsed(tmp_path):
    """A cache from before P0-1 has no ``cache.json``; the real libraries are all like this, so
    reading them as ``stale`` would report a fault where there is none. A Markdown source is never
    parsed at all and must not be counted as a missing cache either."""
    info, store = view(tmp_path)
    publish(store, info, rel="legacy.pdf")
    parsed = info.root / "parsed" / "legacy.pdf"
    parsed.mkdir(parents=True)
    (parsed / "middle_json.json").write_text(json.dumps({"pages": []}), encoding="utf-8")
    (parsed / "markdown.md").write_text("正文", encoding="utf-8")
    publish(store, info, rel="notes.md")
    rows = {row["rel_path"]: row for row in stage_view(store, info)["rows"]}
    assert (rows["legacy.pdf"]["parse"], rows["legacy.pdf"]["parse_reason"]) == ("cached", "legacy-unmarked")
    assert rows["notes.md"]["parse"] == "none"


def test_stage_view_names_a_missing_pdf_cache(tmp_path):
    """A PDF with no parse directory is the one case that really is missing."""
    info, store = view(tmp_path)
    publish(store, info, rel="gone.pdf")
    row = stage_view(store, info)["rows"][0]
    assert (row["parse"], row["parse_reason"]) == ("stale", "cache_missing")


def test_stage_view_is_read_only(tmp_path):
    """Reading the view must not create a database, a cache or a target record."""
    info, store = view(tmp_path)
    publish(store, info)
    before = {path: path.stat().st_mtime_ns for path in info.root.rglob("*") if path.is_file()}
    stage_view(store, info)
    after = {path: path.stat().st_mtime_ns for path in info.root.rglob("*") if path.is_file()}
    assert before == after
