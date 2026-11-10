"""Publication transitions using committed P0 primitives, real SQLite and local parse products.

These tests exercise cache/search/extraction agreement across transitions. They do not implement
the workbench's proposed human-approval gate or import its in-progress modules.
"""
import json

import pytest
from test_stages import view

from src.knowledge import Document, content_version_of
from src.parse_cache import load_output, promote, staging_dir, write_cache
from src.parsers import sha256_file
from src.stages import stage_view
from src.targets import PROMPT_VERSION, SCHEMA_VERSION


def staged_output(info, rel, digest, text):
    directory = staging_dir(info.root / "parsed", rel, digest)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "middle_json.json").write_text(json.dumps({"pages": [
        {"page_idx": 0, "blocks": [{"type": "text", "content": [
            {"type": "text", "content": text}
        ]}]}
    ]}), encoding="utf-8")
    (directory / "full.md").write_text(text, encoding="utf-8")
    markdown, pages, blocks = load_output(directory)
    write_cache(directory, rel=rel, source_sha=digest, version=content_version_of(pages, markdown),
                profile="mineru", pages=1)
    return directory, Document(title=rel, origin=str((info.source_dir / rel).resolve()),
                               kind="pdf", parser="mineru", pages=pages, markdown=markdown), blocks


def publish(store, source, document, blocks):
    stat = source.stat()
    return store.put(document, source_file=(source.name, stat.st_size, stat.st_mtime_ns,
                                           sha256_file(source)), blocks=blocks)


@pytest.mark.parametrize(("changed_text", "changed_source"), [(False, False), (True, False), (False, True)],
                         ids=["same-body", "new-body", "new-source-same-body"])
def test_stage_view_follows_publication_and_promotion_with_existing_extraction(
    tmp_path, changed_text, changed_source,
):
    """Extraction follows published text and source identity, not merely a pending parse."""
    info, store = view(tmp_path)
    source = info.source_dir / "a.pdf"
    source.write_bytes(b"source identity fixture; no PDF parser is invoked")
    digest = sha256_file(source)
    directory, document, blocks = staged_output(info, source.name, digest, "original body")
    original = publish(store, source, document, blocks)
    promote(info.root / "parsed", source.name, directory)
    target = info.root / "target" / f"{original['doc_id']}.json"
    target.write_text(json.dumps({"doc_id": original["doc_id"], "version": original["version"],
                                  "source_hash": digest, "schema_version": SCHEMA_VERSION,
                                  "prompt_version": PROMPT_VERSION, "facets": [], "process": {}}),
                      encoding="utf-8")
    target_before = target.read_bytes()
    assert stage_view(store, info)["rows"][0]["extract"] == "current"

    if changed_source:
        source.write_bytes(b"replacement source with identical parsed words")
        digest = sha256_file(source)
    text = "replacement body" if changed_text else "original body"
    directory, document, blocks = staged_output(info, source.name, digest, text)
    row = stage_view(store, info)["rows"][0]
    if changed_source:
        # The view still describes the old manifest/cache while the new source awaits publication.
        assert (row["source"], row["parse"], row["search"], row["extract"]) == (
            "changed", "cached", "superseded", "stale")
    else:
        assert (row["parse"], row["search"], row["extract"]) == ("parsed", "current", "current")
        assert row["parse_reason"] == ("publish_pending" if changed_text else "promotion_pending")
    assert store.read_markdown(original["doc_id"]) == "original body"

    published = publish(store, source, document, blocks)
    row = stage_view(store, info)["rows"][0]
    expected_extract = "stale" if changed_text or changed_source else "current"
    assert published["doc_id"] == original["doc_id"]
    assert (published["version"] != original["version"]) is changed_text
    assert (row["parse_reason"], row["search"], row["extract"]) == (
        "promotion_pending", "current", expected_extract)
    assert store.read_markdown(published["doc_id"]) == text

    promote(info.root / "parsed", source.name, directory)
    result = stage_view(store, info)
    row = result["rows"][0]
    assert (row["source"], row["parse"], row["search"], row["extract"]) == (
        "present", "cached", "current", expected_extract)
    assert result["counts"]["extract"] == {expected_extract: 1}
    assert target.read_bytes() == target_before


@pytest.mark.parametrize("damage", ["missing-marker", "wrong-rel", "wrong-sha", "changed-output"])
def test_invalid_staging_does_not_mask_the_published_stage(tmp_path, damage):
    """A partial or misidentified retry must not replace a valid canonical cache in the view."""
    info, store = view(tmp_path)
    source = info.source_dir / "a.pdf"
    source.write_bytes(b"source identity fixture")
    digest = sha256_file(source)
    directory, document, blocks = staged_output(info, source.name, digest, "published body")
    published = publish(store, source, document, blocks)
    promote(info.root / "parsed", source.name, directory)
    directory, _, _ = staged_output(info, source.name, digest, "unpublished replacement")
    marker = directory / "cache.json"
    if damage == "missing-marker":
        marker.unlink()
    elif damage == "changed-output":
        (directory / "full.md").write_text("incomplete rewrite", encoding="utf-8")
    else:
        data = json.loads(marker.read_text(encoding="utf-8"))
        data["rel" if damage == "wrong-rel" else "source_sha256"] = "another-source"
        marker.write_text(json.dumps(data), encoding="utf-8")
    before = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in info.root.rglob("*") if p.is_file()}
    row = stage_view(store, info)["rows"][0]
    assert (row["parse"], row["parse_reason"], row["search"]) == ("cached", "", "current")
    assert store.read_markdown(published["doc_id"]) == "published body"
    assert before == {p: (p.read_bytes(), p.stat().st_mtime_ns)
                      for p in info.root.rglob("*") if p.is_file()}
