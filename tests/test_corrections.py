"""A2/A5-c: corrections.json is an overlay applied on read, never a parse product and never a publish.

Decision A (2026-11-04): applying a correction changes no ``docs.version`` and no ``cache.json``;
the MinerU output stays as the tool produced it. Everything here is local: fixture files, no MinerU
run, no model call.
"""

import json

from src import corrections
from src.corrections import apply, load, read, save, summary

SHA = "a" * 64
BEFORE = "网络谣言精准治理"
AFTER = "网络谣言精确治理"


def overlay(directory, pages, source_sha=SHA):
    directory.mkdir(parents=True, exist_ok=True)
    return save(directory, source_sha, pages, by="admin")


def test_a_correction_replaces_its_before_text_exactly(tmp_path):
    """``before`` → ``after``, first occurrence only; the words around it are untouched."""
    text = f"第一段 {BEFORE} 研究。第二段 {BEFORE} 再次出现。"
    overlay(tmp_path, {"1": {"before": BEFORE, "after": AFTER}})
    loaded = load(tmp_path, SHA)
    assert loaded["active"] is True and loaded["invalidated"] is False
    corrected = apply(text, {"1": loaded["pages"]["1"]})
    assert corrected == f"第一段 {AFTER} 研究。第二段 {BEFORE} 再次出现。"
    # Without a correction for this page the text is returned unchanged.
    assert apply(text, None) == text
    assert apply(text, {}) == text


def test_a_before_that_is_not_in_the_text_changes_nothing(tmp_path):
    """No fuzzy or positional matching: text that no longer holds ``before`` is left alone."""
    text = "解析得到的正文与校对时不同"
    overlay(tmp_path, {"2": {"before": "校对时的那句原文", "after": "改后"}})
    loaded = load(tmp_path, SHA)
    assert apply(text, {"2": loaded["pages"]["2"]}) == text


def test_an_overlay_of_other_source_bytes_is_void_and_reported(tmp_path):
    """The source changed, so every correction is void: reported as invalidated, never applied."""
    overlay(tmp_path, {"0": {"before": BEFORE, "after": AFTER}}, source_sha=SHA)
    changed = load(tmp_path, "b" * 64)
    assert changed == {"active": False, "invalidated": True, "pages": {}}
    assert summary(tmp_path, "b" * 64) == {"active": False, "invalidated": True, "pages": []}
    assert apply("正文", {"0": {"before": BEFORE, "after": AFTER}}) == "正文"  # nothing to apply
    # The file is left in place: void, not deleted, so a re-parse can be compared against it.
    assert (tmp_path / corrections.CORRECTIONS_FILE).is_file()


def test_no_overlay_or_an_unreadable_one_reads_as_no_corrections(tmp_path):
    """A missing file, bad JSON and a wrong structure are all "no corrections", never an error."""
    missing = load(tmp_path, SHA)
    assert missing == {"active": False, "invalidated": False, "pages": {}}
    assert summary(tmp_path, SHA) == {"active": False, "invalidated": False, "pages": []}
    (tmp_path / corrections.CORRECTIONS_FILE).write_text("{not json", encoding="utf-8")
    assert read(tmp_path) is None and load(tmp_path, SHA)["pages"] == {}
    (tmp_path / corrections.CORRECTIONS_FILE).write_text(json.dumps({"pages": []}), encoding="utf-8")
    assert load(tmp_path, SHA) == {"active": False, "invalidated": False, "pages": {}}
    # Entries that are not usable corrections are dropped; the rest still applies.
    (tmp_path / corrections.CORRECTIONS_FILE).write_text(json.dumps({
        "source_sha256": SHA,
        "pages": {"0": {"before": BEFORE, "after": AFTER}, "1": "not-a-dict", "x": {"before": 1}}}),
        encoding="utf-8")
    loaded = load(tmp_path, SHA)
    assert loaded["active"] is True and sorted(loaded["pages"]) == ["0"]


def test_save_is_atomic_and_reads_back_with_who_and_when(tmp_path):
    """A written overlay is complete (no partial file) and records the writer and the time."""
    data = overlay(tmp_path, {"3": {"before": BEFORE, "after": AFTER}}, source_sha=SHA)
    assert data["source_sha256"] == SHA
    entry = data["pages"]["3"]
    assert (entry["before"], entry["after"], entry["by"]) == (BEFORE, AFTER, "admin")
    assert entry["at"]  # stamped here, not by the caller
    stored = read(tmp_path)
    assert stored == data
    assert not list(tmp_path.glob(".corrections.json.*"))  # no temporary file left behind
    # A second save replaces the overlay as a whole rather than merging stale pages in.
    again = overlay(tmp_path, {"0": {"before": "旧", "after": "新"}}, source_sha=SHA)
    assert sorted(read(tmp_path)["pages"]) == ["0"] and again["pages"]["0"]["after"] == "新"


def test_the_workbench_reports_the_overlay_beside_the_untouched_parse(tmp_path):
    """GET archive/page show the overlay; ``text`` stays the parse's words and no version moves."""
    from fastapi.testclient import TestClient

    from src.agent.config import Settings
    from src.agent.corpora import CorpusInfo, scan_corpora
    from src.knowledge import Knowledge
    from src.main import create_app
    from src.parse_cache import parse_quality, write_cache
    from src.parsers import sha256_file

    settings = Settings(_env_file=None, corpora_root=tmp_path / ".knowledge", state_dir=tmp_path,
                        user_dir=tmp_path / "usr")
    root = tmp_path / ".knowledge" / "fixture"
    (root / "source").mkdir(parents=True)
    (root / "datadb").mkdir(parents=True)
    info = CorpusInfo(id="fixture", name="fixture", kind="fund", domain="", rel_path="fixture",
                      root=root, source_dir=root / "source", db_dir=root / "datadb",
                      vectordb_dir=root / "vectordb", sqlite=root / "datadb" / "knowledge.sqlite3",
                      docs_count=0, preparation="ready")
    store = Knowledge(info.sqlite, settings=settings, source_root=info.source_dir)
    rel = "2022_2025_72174134_报告.pdf"
    source = root / "source" / rel
    source.write_bytes(b"pdf bytes")  # B1: the source file itself is the overlay's identity
    parsed = root / "parsed" / rel
    parsed.mkdir(parents=True)
    texts = [f"封面 {BEFORE} 项目批准号 72174134", "正文 另一页"]
    (parsed / "middle_json.json").write_text(json.dumps({"pages": [
        {"page_idx": index, "blocks": [{"type": "text", "content": [{"type": "text", "content": text}]}]}
        for index, text in enumerate(texts)]}), encoding="utf-8")
    (parsed / "markdown.md").write_text("# 报告", encoding="utf-8")
    write_cache(parsed, rel=rel, source_sha=sha256_file(source), version="v1", profile="mineru",
                pages=2, quality=parse_quality(texts, 2))
    corpus_id = next(item.id for item in scan_corpora(settings))
    app = create_app(settings, knowledge=store)
    url = f"/api/corpora/{corpus_id}/parse"

    with TestClient(app) as client:
        # No overlay yet: the reader sees the parse alone.
        archive = client.get(f"{url}/archive", params={"rel": rel}).json()
        assert archive["corrections"] == {"active": False, "invalidated": False, "pages": []}
        page = client.get(f"{url}/page/0", params={"rel": rel}).json()
        assert page["text"] == texts[0] and page["corrected_text"] == texts[0]
        assert page["corrections"] is None

        overlay(parsed, {"0": {"before": BEFORE, "after": AFTER}}, source_sha=sha256_file(source))
        archive = client.get(f"{url}/archive", params={"rel": rel}).json()
        assert archive["corrections"] == {"active": True, "invalidated": False, "pages": [0]}
        page = client.get(f"{url}/page/0", params={"rel": rel}).json()
        assert page["text"] == texts[0]  # the MinerU output is not rewritten
        assert page["corrected_text"] == f"封面 {AFTER} 项目批准号 72174134"
        assert page["corrections"]["after"] == AFTER
        # The parse cache still agrees with what SQLite publishes: nothing was re-published.
        assert archive["legacy"] is False and archive["profile"] == "mineru"

        # The source's bytes change: the marker may keep naming the old sha, but the file decides,
        # so the overlay is void without the parse being touched (B1).
        source.write_bytes(b"replaced bytes")
        archive = client.get(f"{url}/archive", params={"rel": rel}).json()
        assert archive["corrections"] == {"active": False, "invalidated": True, "pages": []}
        page = client.get(f"{url}/page/0", params={"rel": rel}).json()
        assert page["corrected_text"] == texts[0] and page["corrections"] is None


def test_an_empty_before_replaces_the_whole_page(tmp_path):
    """M4: a page the parse left blank has no text to match, so ``before`` may be empty.

    The replacement is the page's content outright — and it stays that page's: applying another
    page's entries leaves this page's text alone.
    """
    overlay(tmp_path, {"4": {"before": "", "after": "人工补录的正文"}})
    loaded = load(tmp_path, SHA)
    assert loaded["pages"]["4"]["before"] == "" and loaded["pages"]["4"]["after"] == "人工补录的正文"
    # A blank parse page is filled; a page with text is replaced as a whole, not appended.
    assert apply("", {"4": loaded["pages"]["4"]}) == "人工补录的正文"
    assert apply("原有正文", {"4": loaded["pages"]["4"]}) == "人工补录的正文"
    # Page scoping belongs to the caller: it passes only that page's entries, so a blank ``before``
    # cannot rewrite another page. The API-level case (pages 0 and 1 untouched) is covered in
    # tests/test_parse_corrections_api.py::test_a_blank_parse_page_can_be_filled_in.
    assert apply("第 5 页正文", {}) == "第 5 页正文"


def test_saving_one_page_keeps_the_other_pages_writer(tmp_path):
    """M1: Alice proofreads page 0, Bob saves page 1 — page 0 must still name Alice."""
    overlay(tmp_path, {"0": {"before": BEFORE, "after": AFTER}}, source_sha=SHA)
    first = read(tmp_path)
    assert first["pages"]["0"]["by"] == "admin"
    alice_at = first["pages"]["0"]["at"]
    save(tmp_path, SHA, {**first["pages"], "1": {"before": "旧句", "after": "新句"}},
         by="bob", restamp="1")
    stored = read(tmp_path)
    assert (stored["pages"]["0"]["by"], stored["pages"]["0"]["at"]) == ("admin", alice_at)
    assert stored["pages"]["1"]["by"] == "bob" and stored["pages"]["1"]["at"]
