from src.evaluate import evaluate
from src.knowledge import Document, Knowledge, Page


def test_evaluation_distinguishes_source_from_missing_evidence(tmp_path):
    store = Knowledge(tmp_path / "test.sqlite3")
    store.put(Document(title="foundation", origin="/docs/plan.txt", kind="text", parser="test", pages=[Page(number=1, text="foundation start 2025")]))
    report = evaluate(store, [{"id": "missing", "query": "foundation", "expected_source": "plan.txt", "expected_terms": ["2026"]}])
    assert report["source_recall"] == 1
    assert report["evidence_recall"] == 0
    assert report["results"][0]["missing_terms"] == ["2026"]
