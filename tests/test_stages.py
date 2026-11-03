"""P0-4: the stage view reports each stage separately, and reading it never writes."""
import json

import pytest

from src.agent.corpora import CorpusInfo
from src.knowledge import Document, Knowledge, Page, content_version_of
from src.parse_cache import load_output, staging_dir, write_cache
from src.stages import stage_view
from src.targets import PROMPT_VERSION, SCHEMA_VERSION


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


@pytest.mark.parametrize("marker", [
    None,
    *[pytest.param(marker, marks=pytest.mark.xfail(strict=False, raises=AssertionError, reason=(
        "An existing damaged or mismatched cache.json is stale, never legacy-unmarked")))
      for marker in ("corrupt", "source_mismatch", "version_mismatch")],
])
def test_stage_view_marks_an_unmarked_legacy_cache_and_leaves_text_unparsed(tmp_path, marker):
    """A cache from before P0-1 has no ``cache.json``; the real libraries are all like this, so
    reading them as ``stale`` would report a fault where there is none. A Markdown source is never
    parsed at all and must not be counted as a missing cache either."""
    info, store = view(tmp_path)
    doc = publish(store, info, rel="legacy.pdf")
    parsed = info.root / "parsed" / "legacy.pdf"
    parsed.mkdir(parents=True)
    (parsed / "middle_json.json").write_text(json.dumps({"pages": [{"page_idx": 0, "blocks": [
        {"type": "text", "content": [{"type": "text", "content": "正文"}]}
    ]}]}), encoding="utf-8")
    (parsed / "markdown.md").write_text("正文", encoding="utf-8")
    if marker == "corrupt":
        (parsed / "cache.json").write_text("{broken", encoding="utf-8")
    elif marker is not None:
        write_cache(parsed, rel="legacy.pdf", source_sha="other-source" if marker == "source_mismatch" else "sha",
                    version="other-version" if marker == "version_mismatch" else doc["version"],
                    profile="mineru", pages=1)
    publish(store, info, rel="notes.md")
    before = {path: (path.read_bytes(), path.stat().st_mtime_ns)
              for path in info.root.rglob("*") if path.is_file()}
    rows = {row["rel_path"]: row for row in stage_view(store, info)["rows"]}
    assert before == {path: (path.read_bytes(), path.stat().st_mtime_ns)
                      for path in info.root.rglob("*") if path.is_file()}
    assert rows["notes.md"]["parse"] == "none"
    expected = ("cached", "legacy-unmarked") if marker is None else ("stale", "cache_mismatch")
    assert (rows["legacy.pdf"]["parse"], rows["legacy.pdf"]["parse_reason"]) == expected


@pytest.mark.parametrize("source_state", ["changed", "missing"])
@pytest.mark.xfail(strict=False, raises=AssertionError, reason=(
    "A published target still exists after source changed/missing: extract must not say missing. "
    "Owner/Opus must choose stale or another state retaining the artifact's existence; "
    "this test does not authorize making the document searchable again."
))
def test_stage_view_retains_extract_presence_for_superseded_source(tmp_path, source_state):
    info, store = view(tmp_path)
    doc = publish(store, info)
    target = info.root / "target" / f"{doc['doc_id']}.json"
    target.write_text(json.dumps({"doc_id": doc["doc_id"], "version": doc["version"],
                                  "source_hash": "sha", "schema_version": SCHEMA_VERSION,
                                  "prompt_version": PROMPT_VERSION, "facets": [], "process": {}}), encoding="utf-8")
    assert stage_view(store, info)["rows"][0]["extract"] == "current"
    source = info.source_dir / "a.md"
    if source_state == "changed":
        source.write_text("已改变且长度不同的原文", encoding="utf-8")
    else:
        source.unlink()
    before = {path: (path.read_bytes(), path.stat().st_mtime_ns)
              for path in info.root.rglob("*") if path.is_file()}
    row = stage_view(store, info)["rows"][0]
    assert before == {path: (path.read_bytes(), path.stat().st_mtime_ns)
                      for path in info.root.rglob("*") if path.is_file()}
    assert (row["source"], row["search"]) == (source_state, "superseded")
    assert store.get(doc["doc_id"])["version"] == doc["version"]
    assert target.is_file()
    assert row["extract"] != "missing"


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


@pytest.mark.parametrize("published", [False, True], ids=["publish-pending", "promotion-pending"])
def test_stage_view_keeps_complete_staging_unpublished_or_unpromoted(tmp_path, published):
    """A read must expose interrupted publication, not publish or promote the staged products."""
    info, store = view(tmp_path)
    doc = publish(store, info, rel="pending.pdf")
    staged = staging_dir(info.root / "parsed", "pending.pdf", "sha")
    staged.mkdir(parents=True)
    (staged / "middle_json.json").write_text(json.dumps({"pages": [{"page_idx": 0, "blocks": [
        {"type": "text", "content": [{"type": "text", "content": "新解析正文"}]}
    ]}]}), encoding="utf-8")
    (staged / "full.md").write_text("新解析正文", encoding="utf-8")
    markdown, pages, _ = load_output(staged)
    write_cache(staged, rel="pending.pdf", source_sha="sha",
                version=content_version_of(pages, markdown), profile="mineru", pages=1)
    if published:
        stat = (info.source_dir / "pending.pdf").stat()
        doc = store.put(Document(title="pending.pdf", origin=str((info.source_dir / "pending.pdf").resolve()),
                                 kind="text", parser="mineru",
                                 pages=pages, markdown=markdown),
                        source_file=("pending.pdf", stat.st_size, stat.st_mtime_ns, "sha"))
    before = {path: (path.read_bytes(), path.stat().st_mtime_ns)
              for path in info.root.rglob("*") if path.is_file()}
    result = stage_view(store, info)
    row = result["rows"][0]
    assert (row["source"], row["parse"], row["search"]) == ("present", "parsed", "current")
    assert row["parse_reason"] == ("promotion_pending" if published else "publish_pending")
    assert result["counts"]["parse"] == {"parsed": 1}
    assert store.get(doc["doc_id"])["version"] == doc["version"]
    assert before == {path: (path.read_bytes(), path.stat().st_mtime_ns)
                      for path in info.root.rglob("*") if path.is_file()}
