from src.evaluate import DATASET, evaluate, load_cases
from src.knowledge import Document, Knowledge, Page


def test_user_fund_dataset_is_well_formed():
    # Given the committed fund retrieval dataset
    cases = load_cases(DATASET)
    # When checking its shape
    # Then it has 10-15 unique, complete cases
    assert 10 <= len(cases) <= 15
    assert all({"id", "query", "expected_source"} <= set(case) for case in cases)
    assert len({case["id"] for case in cases}) == len(cases)


def test_user_retrieval_evaluation_reports_recall_dedup_and_no_match(tmp_path):
    # Given one report that answers the query and one unrelated query
    store = Knowledge(tmp_path / "test.sqlite3")
    store.put(Document(title="癫痫报告", origin="/docs/epilepsy.pdf", kind="text", parser="test",
                       pages=[Page(number=1, text="癫痫致痫网络的特征识别方法")]))
    # When evaluating both cases
    report = evaluate(store, [
        {"id": "hit", "query": "癫痫致痫网络", "expected_source": "epilepsy.pdf"},
        {"id": "miss", "query": "量子纠缠计算", "expected_source": "physics.pdf"},
    ])
    # Then recall/no-match/dedup metrics reflect the two outcomes
    assert report["report_recall"] == 0.5
    assert report["no_match_rate"] == 0.5
    assert report["project_dedup_accuracy"] == 1.0
    assert report["results"][0]["report_rank"] == 1
