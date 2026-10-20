from src.review.presentation import present_report, suggestion_level


def test_one_suggestion_scale_replaces_issue_and_warning():
    # A definite breach is always 高, whatever the model said; otherwise the model's level, 中 by default.
    assert suggestion_level({"status": "issue", "level": "low"}) == "high"
    assert suggestion_level({"status": "warning", "level": "low"}) == "low"
    assert suggestion_level({"status": "warning"}) == "medium"
    assert suggestion_level({"status": "advisory", "level": "high"}) == "high"
    assert suggestion_level({"status": "advisory", "level": "urgent"}) == "medium"
    # Items that ask for no change carry no level.
    for status in ("pending", "pass", "na"):
        assert suggestion_level({"status": status, "level": "high"}) is None


def test_report_orders_and_counts_by_level():
    run = {"status": "completed", "request": {"kind": "formal"}, "rule": {"checks": []}, "findings": [
        {"id": "a", "title": "措辞", "status": "warning", "level": "low", "suggestion": "s"},
        {"id": "b", "title": "字数超限", "status": "issue", "suggestion": "s"},
        {"id": "c", "title": "附件", "status": "pending", "suggestion": "s"},
        {"id": "d", "title": "论证", "status": "warning", "suggestion": "s"},
    ], "technical": {"cards": []}}
    report = present_report(run)["reader_report"]
    assert [p["title"] for p in report["issues"]] == ["字数超限", "论证", "措辞"]
    assert report["levels"] == {"high": 1, "medium": 1, "low": 1}
    assert [p["title"] for p in report["pending"]] == ["附件"]
    assert "高 1 项、中 1 项、低 1 项" in report["summary"]
