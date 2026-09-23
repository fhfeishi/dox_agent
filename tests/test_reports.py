"""E MVP: report storage, generation and export (R1, markdown only)."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.knowledge import Document, Knowledge, Page
from src.reports import ReportStore, generate_markdown, report_metadata, summarize_report_metadata
from tests.test_app import setup


class FakeModel:
    def __init__(self):
        self.seen = ""

    async def ainvoke(self, messages):
        self.seen = "\n".join(message.content for message in messages)
        return SimpleNamespace(content="# 报告\n\n## 一、总体成果概述\n成果 [1]")


def add_report_doc(store):
    store.put(Document(title="报告", origin="/docs/2021_2025_82030037_赵国光_癫痫.pdf",
                       kind="pdf", parser="mineru", pages=[Page(number=1, text="癫痫致痫网络")],
                       markdown="资助类别:面上项目\n填表日期:2025年01月05日\n# 癫痫致痫网络\n正文"))


def test_report_generation_uses_template_and_selected_reports(tmp_path):
    model = FakeModel()
    markdown = asyncio.run(generate_markdown(
        _store(tmp_path), Settings(_env_file=None),
        {"domain": "癫痫", "year_from": 2021, "year_to": 2025, "template_id": "achievements"},
        llm=model))
    assert markdown.startswith("# 报告")
    assert "模板章节" in model.seen and "总体成果概述" in model.seen  # section structure injected
    assert "癫痫致痫网络" in model.seen  # selected report markdown injected


def test_user_report_generation_filters_by_form_date_and_fund_type(tmp_path):
    # Given reports inside/outside the explicit form-date and fund-type criteria
    store = Knowledge(tmp_path / "db")
    add_report_doc(store)
    store.put(Document(title="旧项目", origin="old.pdf", kind="pdf", parser="mineru",
                       pages=[Page(number=1, text="旧项目证据")],
                       markdown="资助类别:面上项目\n填表日期:2020年12月31日\n旧项目证据"))
    store.put(Document(title="其他类别", origin="other.pdf", kind="pdf", parser="mineru",
                       pages=[Page(number=1, text="其他类别证据")],
                       markdown="资助类别:重点项目\n填表日期:2025年03月02日\n其他类别证据"))
    store.put(Document(title="类别缺失", origin="unknown-category.pdf", kind="pdf", parser="mineru",
                       pages=[Page(number=1, text="类别未知证据")],
                       markdown="填表日期:2025年06月02日\n类别未知证据"))
    model = FakeModel()

    # When a report is requested for one year and category
    asyncio.run(generate_markdown(store, Settings(_env_file=None),
        {"domain": "癫痫", "year_from": 2025, "year_to": 2025, "fund_type": "面上项目",
         "template_id": "achievements"}, llm=model))

    # Then only the matching source enters model context
    assert "癫痫致痫网络" in model.seen
    assert "旧项目证据" not in model.seen
    assert "其他类别证据" not in model.seen
    assert "类别未知证据" not in model.seen
    assert "填表日期年份（报告提交时间）：2025–2025" in model.seen
    assert "资助类别缺失资料（所选范围内）：1" in model.seen
    assert "未逐份对照原 PDF" in model.seen


def test_user_report_generation_ignores_generic_category_labels_in_body(tmp_path):
    # Given a report whose body reuses the generic category label for a different field
    store = Knowledge(tmp_path / "db")
    store.put(Document(title="基金报告", origin="fund.pdf", kind="pdf", parser="mineru",
                       pages=[Page(number=1, text="证据")],
                       markdown="资助类别：联合基金项目\n填表日期：2025年12月\n"
                                "## 项目摘要\n类别：报告/墙报/科普\n项目证据"))
    model = FakeModel()

    # When report generation selects the explicit fund category
    asyncio.run(generate_markdown(store, Settings(_env_file=None),
        {"domain": "证据", "year_from": 2025, "year_to": 2025,
         "fund_type": "联合基金项目", "template_id": "comprehensive"}, llm=model))

    # Then the unrelated body field does not make the source appear ambiguous or exclude it
    assert "基金报告" in model.seen
    assert "项目证据" in model.seen


def test_user_report_generation_stops_when_selected_reports_have_no_form_date(tmp_path):
    # Given a selected corpus whose only report has no parseable form date
    store = Knowledge(tmp_path / "db")
    store.put(Document(title="日期未知", origin="unknown.pdf", kind="pdf", parser="mineru",
                       pages=[Page(number=1, text="证据")], markdown="资助类别:面上项目\n证据"))
    model = FakeModel()

    # When strict form-date filtering is requested
    with pytest.raises(ValueError, match="没有符合填表日期年份"):
        asyncio.run(generate_markdown(store, Settings(_env_file=None),
            {"domain": "医疗", "year_from": 2025, "year_to": 2025, "template_id": "comprehensive"},
            llm=model))

    # Then unknown-year material never reaches generation
    assert model.seen == ""


def test_user_report_metadata_reads_markdown_tables_bold_labels_and_aliases():
    # Given labels written as a Markdown table, bold inline fields and controlled aliases
    # When report metadata is parsed
    values = [
        "| **填表日期** | 2025年3月 |\n| **资助类别** | 面上项目 |",
        "- **填报日期**：2024年12月\n> **项目类别**：重点项目",
        "类别：青年项目\n填表日期：2023年",
    ]

    # Then the explicit label values are normalized consistently
    assert [report_metadata(value)[:2] for value in values] == [
        (2025, "面上项目"), (2024, "重点项目"), (2023, "青年项目")]


def test_user_report_metadata_marks_conflicts_and_ignores_unlabelled_years():
    # Given conflicting repeated labels and unrelated years elsewhere in the text
    markdown = ("| 填表日期 | 2024年 |\n| 填报日期 | 2025年 |\n"
                "资助类别：面上项目\n项目类别：重点项目\n国家自然科学基金委员会制（2026年）")

    # When metadata is parsed
    year, category, year_status, category_status = report_metadata(markdown)

    # Then conflicting fields stay missing and unrelated years are not inferred
    assert (year, category) == (None, None)
    assert (year_status, category_status) == ("ambiguous", "ambiguous")
    assert report_metadata("2025年项目\n国家自然科学基金委员会制（2026年）")[2:] == ("missing", "missing")
    assert report_metadata("填表日期：1800年表格，2025年填报")[0] == 2025
    assert report_metadata("| 填表日期 |\n| 2025年 |")[2] == "missing"
    assert report_metadata("资助类别：联合基金项目\n## 项目摘要\n类别：报告/墙报/科普")[1] == "联合基金项目"
    assert report_metadata("# 报告标题\n填表日期：2025年\n资助类别：面上项目\n# 正文\n类别：报告/墙报/科普")[1] == "面上项目"
    actual_header = ("![](images/page_0_image_0.jpg)\n\n项目批准号 92159302\n\n"
                     "# 国家自然科学基金\n\n# 资助项目结题/成果报告\n\n"
                     "资助类别：重大研究计划\n填表日期：2025年12月23日\n"
                     "## 项目摘要\n类别：报告/墙报/科普")
    assert report_metadata(actual_header)[:2] == (2025, "重大研究计划")
    long_header = "填表日期：2025年\n资助类别：面上项目\n" + "说明\n" * 62 + "类别：报告/墙报/科普"
    assert report_metadata(long_header)[1:] == ("面上项目", "matched", "matched")


def test_user_report_metadata_summary_lists_only_missing_field_identifiers(tmp_path):
    # Given one fully labelled and one ambiguous report in a corpus
    store = Knowledge(tmp_path / "db")
    store.put(Document(title="可识别报告", origin="known.pdf", kind="pdf", parser="mineru",
                       pages=[Page(number=1, text="正文")], markdown="填表日期：2025年\n资助类别：面上项目"))
    conflict_id = store.put(Document(title="冲突报告", origin="conflict.pdf", kind="pdf", parser="mineru",
                                     pages=[Page(number=1, text="正文")],
                                     markdown="填表日期：2024年\n填报日期：2025年"))["doc_id"]

    # When metadata coverage is summarized
    summary = summarize_report_metadata(store, "fund-a")

    # Then each field has explicit totals and the unmatched list contains no document text
    assert summary["total"] == 2
    assert summary["date"] == {"hits": 1, "missing": 1}
    assert summary["category"] == {"hits": 1, "missing": 1}
    unmatched = next(item for item in summary["unmatched"] if item["title"] == "冲突报告")
    assert unmatched == {"doc_id": conflict_id, "title": "冲突报告",
                         "corpus_id": "fund-a", "date": "ambiguous", "category": "missing"}


def _store(tmp_path):
    store = Knowledge(tmp_path / "db")
    add_report_doc(store)
    return store


def test_api_report_create_get_and_export(tmp_path, monkeypatch):
    monkeypatch.setattr("src.reports.model_for", lambda settings: FakeModel())
    app, store = setup(tmp_path)
    add_report_doc(store)
    with TestClient(app) as client:
        created = client.post("/api/reports", json={
            "domain": "癫痫", "year_from": 2021, "year_to": 2025, "template_id": "achievements"})
        assert created.status_code == 201
        report_id = created.json()["report_id"]
        assert client.get(f"/api/reports/{report_id}").json()["markdown"].startswith("# 报告")
        exported = client.get(f"/api/reports/{report_id}/export?format=md")
        assert exported.status_code == 200 and exported.text.startswith("# 报告")
        assert client.get(f"/api/reports/{report_id}/export?format=docx").status_code == 422
        assert client.get("/api/reports/missing").status_code == 404
        assert client.post("/api/reports", json={"domain": "x", "year_from": 2025, "year_to": 2020,
                                                 "template_id": "achievements"}).status_code == 422


def test_report_store_migrates_legacy_schema(tmp_path):
    import sqlite3
    # Given a legacy reports table without session_key/run_id/corpus_id
    path = tmp_path / "reports.sqlite3"
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE reports (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, "
                   "params TEXT NOT NULL, markdown TEXT NOT NULL)")
    # When the store opens it
    store = ReportStore(path)
    # Then the columns are migrated in place and idempotency still works
    store.save("r1", {"template_id": "achievements", "domain": "x", "year_from": 2021, "year_to": 2025},
               "# 报告", session_key="s1", run_id="run1")
    assert store.find("s1", "run1")["report_id"] == "r1"
    assert store.list(session_key="s1")[0]["template_id"] == "achievements"


def test_api_report_idempotency_and_listing(tmp_path, monkeypatch):
    monkeypatch.setattr("src.reports.model_for", lambda settings: FakeModel())
    app, store = setup(tmp_path)
    add_report_doc(store)
    body = {"domain": "癫痫", "year_from": 2021, "year_to": 2025, "template_id": "achievements",
            "session_key": "s1", "run_id": "run1"}
    with TestClient(app) as client:
        first = client.post("/api/reports", json=body)
        assert first.status_code == 201
        again = client.post("/api/reports", json=body)
        assert again.status_code == 200 and again.json()["idempotent"] is True
        assert again.json()["report_id"] == first.json()["report_id"]
        other = client.post("/api/reports", json={**body, "run_id": "run2"})
        assert other.status_code == 201 and other.json()["report_id"] != first.json()["report_id"]
        listed = client.get("/api/reports?session_key=s1").json()
        assert {item["run_id"] for item in listed} == {"run1", "run2"}
        assert all("markdown" not in item for item in listed)
        assert client.get("/api/reports?session_key=unknown").json() == []


def test_user_report_list_distinguishes_omitted_and_empty_query_values(tmp_path):
    # Given legacy reports with empty fields and current reports with populated fields
    app, _ = setup(tmp_path)
    # When the report API is queried with omitted or explicitly empty filters
    with TestClient(app) as client:
        app.state.reports.save("legacy", {}, "# legacy")
        app.state.reports.save("current", {}, "# current", session_key="s1", run_id="r1")
        all_reports = client.get("/api/reports").json()
        empty_session = client.get("/api/reports?session_key=").json()
        empty_run = client.get("/api/reports?run_id=").json()

    # Then omission means no filter while explicit empty values match only legacy rows
    assert {item["report_id"] for item in all_reports} == {"legacy", "current"}
    assert [item["report_id"] for item in empty_session] == ["legacy"]
    assert [item["report_id"] for item in empty_run] == ["legacy"]


def test_user_report_metadata_endpoint_returns_per_corpus_coverage(tmp_path):
    # Given an explicitly selected corpus
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        corpus = client.post("/api/corpora", json={"name": "coverage"}).json()

        # When metadata coverage is requested for that corpus
        response = client.get(f"/api/corpora/{corpus['id']}/report-metadata")

    # Then the response is scoped to that library and contains coverage counters
    assert response.status_code == 200
    assert response.json() == {"corpus_id": corpus["id"], "total": 0,
                               "date": {"hits": 0, "missing": 0},
                               "category": {"hits": 0, "missing": 0}, "unmatched": []}
