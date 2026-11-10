"""A2-b: configurable parse quality grades. Empty by default (B3: thresholds are not verified).

The grade is a *hint* built from the objective facts of one parse; nothing treats it as pass/fail.
These tests cover the default (no grade), a configured grade, and unusable configuration — all
local, with fixture text: no MinerU run and no model call.
"""

import json

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.main import create_app
from src.parse_cache import parse_quality, quality_grade, write_cache

GOOD = {"pages": 4, "parsed_pages": 4, "pages_with_text": 4, "coverage": 1.0, "chars": 900,
        "unreadable_chars": 0, "sparse_pages": 0, "page_count_checked": True}
POOR = {**GOOD, "pages_with_text": 2, "coverage": 0.5, "unreadable_chars": 12, "sparse_pages": 5}
GRADES = {"good": {"min_coverage": 0.9, "max_unreadable_chars": 0}, "fair": {"min_coverage": 0.4}}


def test_no_configuration_means_no_grade():
    """The default is empty: an empty or absent configuration returns None, never a made-up grade."""
    assert quality_grade(GOOD, {}) is None
    assert quality_grade(GOOD, None) is None
    assert quality_grade(POOR, {}) is None


def test_a_configured_grade_is_judged_on_the_objective_facts():
    """The first grade whose every listed key holds wins, so the strictest is configured first."""
    assert quality_grade(GOOD, GRADES) == "good"
    assert quality_grade(POOR, GRADES) == "fair"
    assert quality_grade({**GOOD, "coverage": 0.2}, GRADES) is None
    # A key the grade does not list cannot hold it back; a listed key must hold.
    assert quality_grade({**GOOD, "sparse_pages": 40}, {"good": {"min_coverage": 0.9}}) == "good"
    assert quality_grade({**GOOD, "sparse_pages": 40}, {"good": {"max_sparse_pages": 3}}) is None


def test_missing_facts_and_bad_configuration_return_none_instead_of_raising():
    """A read must not break because a fact is absent or an entry is malformed."""
    assert quality_grade({"coverage": "unknown"}, {"good": {"min_coverage": 0.9}}) is None
    assert quality_grade({}, {"good": {"min_coverage": 0.9}}) is None
    assert quality_grade(None, GRADES) is None
    assert quality_grade(GOOD, {"good": "not-a-dict"}) is None
    assert quality_grade(GOOD, {"good": {"min_coverage": True}}) is None  # a boolean is not a threshold
    assert quality_grade(GOOD, {"good": {"min_coverage": "0.9"}}) is None


def test_the_setting_reads_json_and_falls_back_to_no_grading(monkeypatch):
    """The environment value is a JSON object; anything unusable leaves grading off."""
    monkeypatch.setenv("PARSE_QUALITY_GRADES", json.dumps(GRADES))
    assert Settings(_env_file=None).parse_quality_grades == GRADES
    monkeypatch.setenv("PARSE_QUALITY_GRADES", "")
    assert Settings(_env_file=None).parse_quality_grades == {}
    monkeypatch.delenv("PARSE_QUALITY_GRADES")
    assert Settings(_env_file=None).parse_quality_grades == {}


def test_an_unparsable_environment_value_means_no_grading(monkeypatch):
    """An unusable value is not a grade: Settings starts with grading off instead of refusing."""
    monkeypatch.setenv("PARSE_QUALITY_GRADES", "{not json")
    assert Settings(_env_file=None).parse_quality_grades == {}
    monkeypatch.setenv("PARSE_QUALITY_GRADES", "[1, 2]")  # a list is not a mapping of grades
    assert Settings(_env_file=None).parse_quality_grades == {}
    assert quality_grade(GOOD, Settings(_env_file=None).parse_quality_grades) is None


def archive_client(tmp_path, grades):
    """A real corpus on disk with a real parsed directory, read through the workbench endpoint."""
    from src.agent.corpora import CorpusInfo, scan_corpora
    from src.knowledge import Knowledge

    settings = Settings(_env_file=None, corpora_root=tmp_path / ".knowledge", state_dir=tmp_path,
                        user_dir=tmp_path / "usr", parse_quality_grades=grades)
    root = tmp_path / ".knowledge" / "fixture"
    (root / "source").mkdir(parents=True, exist_ok=True)
    (root / "datadb").mkdir(parents=True, exist_ok=True)
    info = CorpusInfo(id="fixture", name="fixture", kind="fund", domain="", rel_path="fixture",
                      root=root, source_dir=root / "source", db_dir=root / "datadb",
                      vectordb_dir=root / "vectordb", sqlite=root / "datadb" / "knowledge.sqlite3",
                      docs_count=0, preparation="ready")
    store = Knowledge(info.sqlite, settings=settings, source_root=info.source_dir)
    # The registry names a corpus by directory, so the id is what the scan derives (not "fixture").
    corpus_id = next(item.id for item in scan_corpora(settings))
    rel = "2022_2025_72174134_报告.pdf"
    parsed = root / "parsed" / rel
    parsed.mkdir(parents=True, exist_ok=True)
    texts = ["封面 项目批准号 72174134", "正文 大数据驱动的网络谣言精准治理问题研究", "", ""]
    (parsed / "middle_json.json").write_text(json.dumps({"pages": [
        {"page_idx": index, "blocks": [{"type": "text", "content": [{"type": "text", "content": text}]}]}
        for index, text in enumerate(texts)]}), encoding="utf-8")
    (parsed / "markdown.md").write_text("# 报告", encoding="utf-8")
    write_cache(parsed, rel=rel, source_sha="sha", version=None, profile="legacy-unverified", pages=4,
                quality=parse_quality(texts, 4))
    app = create_app(settings, knowledge=store)
    return TestClient(app), f"/api/corpora/{corpus_id}/parse/archive", rel


def test_the_archive_reports_null_without_configuration(tmp_path):
    client, url, rel = archive_client(tmp_path, {})
    with client:
        archive = client.get(url, params={"rel": rel}).json()
    assert archive["exists"] is True
    assert archive["quality_grade"] is None
    assert archive["anchors"]["matched"] >= 1  # A2-a is still reported next to it


def test_the_archive_reports_the_configured_grade(tmp_path):
    """The fixture's own facts decide the grade; the threshold is configuration, not a standard."""
    client, url, rel = archive_client(tmp_path, {"thin": {"min_coverage": 0.2}})
    with client:
        archive = client.get(url, params={"rel": rel}).json()
    # One of four pages carries text (a page needs EMPTY_PAGE_CHARS to count), so coverage is 0.25.
    assert archive["quality"]["coverage"] == 0.25
    assert archive["quality_grade"] == "thin"
    client, url, rel = archive_client(tmp_path, {"good": {"min_coverage": 0.9}})
    with client:
        assert client.get(url, params={"rel": rel}).json()["quality_grade"] is None


def test_a_missing_parse_directory_reports_no_grade(tmp_path):
    client, url, rel = archive_client(tmp_path, {"thin": {"min_coverage": 0.2}})
    with client:
        absent = client.get(url, params={"rel": "no-such.pdf"}).json()
    assert absent == {"rel": "no-such.pdf", "exists": False,
                      "anchors": {"checked": [], "matched": 0, "missing": [], "page_count": 0},
                      "quality_grade": None,
                      "corrections": {"active": False, "invalidated": False, "pages": []}}
