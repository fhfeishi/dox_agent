"""E MVP: report storage, generation and export (R1, markdown only)."""

import asyncio
import json
from io import BytesIO
from types import SimpleNamespace
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from src.agent.config import Settings
from src.agent.corpora import corpus_id_for
from src.knowledge import Document, Knowledge, Page
from src.parsers import sha256_file
from src.reports import ReportStore, generate_markdown, preflight_report, report_metadata, report_period, summarize_report_metadata
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
    store = Knowledge(tmp_path / "db")
    store.put(Document(title="双页报告", origin="two-pages.pdf", kind="pdf", parser="mineru",
                       pages=[Page(number=1, text="癫痫机制证据"), Page(number=2, text="癫痫治疗证据")],
                       markdown="资助类别:面上项目\n填表日期:2025年01月05日\n# 癫痫致痫网络\n正文"))
    markdown = asyncio.run(generate_markdown(
        store, Settings(_env_file=None),
        {"domain": "癫痫", "year_from": 2021, "year_to": 2025, "template_id": "achievements"},
        llm=model))
    assert markdown.startswith("# 报告")
    assert "模板章节" in model.seen and "总体成果概述" in model.seen  # section structure injected
    assert "癫痫致痫网络" in model.seen  # selected report markdown injected
    assert "来源附录（系统记录）" in markdown and "[1]" in markdown
    assert model.seen.count("[1] 《双页报告》") == 1
    assert markdown.split("## 来源附录（系统记录）\n", 1)[1].count("双页报告") == 1


def test_user_published_report_inputs_reach_the_generation_prompt(tmp_path):
    # Given a report task with server-resolved inputs and a local evidence document
    model = FakeModel()
    params = {"domain": "癫痫", "year_from": 2021, "year_to": 2025,
              "template_id": "comprehensive", "task_params": {"audience": "项目评审专家", "include_limits": True}}

    # When the report is generated
    asyncio.run(generate_markdown(_store(tmp_path), Settings(_env_file=None), params,
                                  llm=model, task_definition={"goal": "评估研究方法"}))

    # Then the actual prompt contains the fixed task inputs as well as the original evidence
    assert "项目评审专家" in model.seen and "include_limits" in model.seen
    assert "评估研究方法" in model.seen and "癫痫致痫网络" in model.seen


def test_user_report_brief_reaches_writing_with_its_confirmed_scope(tmp_path):
    # Given a confirmed reader, purpose, focus and length for a local report
    model = FakeModel()
    params = {"domain": "癫痫", "year_from": 2021, "year_to": 2025,
              "template_id": "comprehensive", "purpose": "给评审会决策",
              "audience": "临床研究者", "focus": "比较证据冲突", "length": "简短"}

    # When the report is generated
    asyncio.run(generate_markdown(_store(tmp_path), Settings(_env_file=None), params, llm=model))

    # Then the model receives the actual brief and its selected evidence boundary
    assert "给评审会决策" in model.seen and "临床研究者" in model.seen
    assert "比较证据冲突" in model.seen and "简短" in model.seen
    assert "填表日期年份（报告提交时间）：2021–2025" in model.seen


def test_user_invalid_report_citations_are_repaired_once_or_fail(tmp_path):
    # Given a model that first cites a nonexistent source
    class RepairModel:
        def __init__(self, repaired):
            self.repaired = repaired
            self.outputs = iter(["# 报告\n\n## 发现\n无来源 [99]", repaired])

        async def ainvoke(self, messages):
            return SimpleNamespace(content=next(self.outputs))

    params = {"domain": "癫痫", "year_from": 2021, "year_to": 2025,
              "template_id": "comprehensive"}

    # When the model fixes the reference, the report can be saved; otherwise it fails visibly
    fixed = asyncio.run(generate_markdown(_store(tmp_path / "ok"), Settings(_env_file=None), params,
                                          llm=RepairModel("# 报告\n\n## 发现\n真实来源 [1]")))
    with pytest.raises(ValueError, match="引用或结构校验失败"):
        asyncio.run(generate_markdown(_store(tmp_path / "bad"), Settings(_env_file=None), params,
                                      llm=RepairModel("# 报告\n\n## 发现\n依然错误 [99]")))

    # Then only the valid, cited body is treated as complete
    assert "真实来源 [1]" in fixed


def test_user_truncated_model_output_is_never_saved_as_a_complete_report(tmp_path):
    # Given a model response that looks plausible but reached the provider output limit
    class TruncatedModel:
        async def ainvoke(self, messages):
            return SimpleNamespace(content="# 报告\n\n## 发现\n证据 [1]",
                                   response_metadata={"finish_reason": "length"})

    # When generation receives that response, then no partial body is returned as complete
    with pytest.raises(ValueError, match="输出长度上限"):
        asyncio.run(generate_markdown(_store(tmp_path), Settings(_env_file=None),
            {"domain": "癫痫", "year_from": 2021, "year_to": 2025,
             "template_id": "comprehensive"}, llm=TruncatedModel()))


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


def test_user_report_preflight_and_generation_share_the_same_eligible_scope(tmp_path):
    # Given four local reports with a missing date, an old date, a different category, and a match
    app, store = setup(tmp_path)
    add_report_doc(store)
    for title, header in (("无日期", "资助类别:面上项目"),
                          ("旧年份", "填表日期:2020年\n资助类别:面上项目"),
                          ("其他类别", "填表日期:2025年\n资助类别:重点项目")):
        store.put(Document(title=title, origin=title, kind="text", parser="text",
                           pages=[Page(number=1, text=title)], markdown=header + "\n" + title))
    with TestClient(app) as client:
        corpus_id = client.get("/api/corpora").json()[0]["id"]
        body = {"corpus_id": corpus_id, "domain": "癫痫", "year_from": 2025, "year_to": 2025,
                "fund_type": "面上项目", "template_id": "comprehensive"}

        # When the user inspects the exact current report scope
        response = client.post("/api/reports/preflight", json=body)

        # Then exclusions are mutually exclusive and only the matching file is a candidate
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["total"] == 4 and result["eligible_count"] == 1
        assert result["excluded"] == {"date": 1, "year": 1, "category": 1}
        assert result["eligible"][0]["title"] == "报告"
        assert result["fingerprint"]


def test_user_changed_report_scope_requires_a_new_preflight(tmp_path):
    # Given a user-preflighted report scope
    app, store = setup(tmp_path)
    add_report_doc(store)
    with TestClient(app) as client:
        corpus_id = client.get("/api/corpora").json()[0]["id"]
        body = {"corpus_id": corpus_id, "domain": "癫痫", "year_from": 2025, "year_to": 2025,
                "template_id": "comprehensive"}
        old = client.post("/api/reports/preflight", json=body).json()["fingerprint"]
        store.put(Document(title="新增报告", origin="new", kind="text", parser="text",
                           pages=[Page(number=1, text="新证据")], markdown="填表日期:2025年\n新证据"))

        # When generation uses the old preflight fingerprint
        response = client.post("/api/reports", json={**body, "scope_fingerprint": old})

        # Then the server asks for a fresh click before any model generation starts
        assert response.status_code == 409
        assert "资料范围已变化" in str(response.json()["detail"])


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
        word = client.get(f"/api/reports/{report_id}/export?format=docx")
        assert word.status_code == 200 and word.content.startswith(b"PK")
        assert client.get("/api/reports/missing").status_code == 404
        assert client.post("/api/reports", json={"domain": "x", "year_from": 2025, "year_to": 2020,
                                                 "template_id": "achievements"}).status_code == 422


def test_illustrated_report_keeps_verified_images_across_versions(tmp_path, monkeypatch):
    """A real PDF crop, source scope and OOXML/ZIP bytes must agree end to end."""
    class FigureModel:
        async def ainvoke(self, messages):
            return SimpleNamespace(content="# 报告\n\n## 架构\n云边协同架构 [1]。")

    monkeypatch.setattr("src.reports.model_for", lambda settings: FigureModel())
    app, store = setup(tmp_path)
    source = tmp_path / ".knowledge" / "fixture" / "source" / "study.pdf"
    parsed = tmp_path / ".knowledge" / "fixture" / "parsed" / "study.pdf"
    (parsed / "images").mkdir(parents=True)
    cover = Image.new("RGB", (640, 400), "white")
    ImageDraw.Draw(cover).text((30, 30), "LOGO", fill="black")
    chart = Image.new("RGB", (640, 400), "white")
    draw = ImageDraw.Draw(chart)
    draw.line((20, 20, 600, 380), fill="black", width=4)
    alternative = Image.new("RGB", (640, 400), "white")
    ImageDraw.Draw(alternative).ellipse((90, 50, 550, 350), outline="green", width=16)
    stacked = Image.new("RGB", (640, 600), "white")
    ImageDraw.Draw(stacked).line((30, 30, 600, 260), fill="red", width=10)
    ImageDraw.Draw(stacked).ellipse((100, 350, 530, 550), outline="blue", width=12)
    source.parent.mkdir(parents=True, exist_ok=True)
    cover.save(source, save_all=True, append_images=[chart, alternative, stacked])
    chart.save(parsed / "images" / "chart.jpg", quality=95)
    alternative.save(parsed / "images" / "alternative.jpg", quality=95)
    stacked.crop((0, 0, 640, 300)).save(parsed / "images" / "top.jpg", quality=95)
    stacked.crop((0, 300, 640, 600)).save(parsed / "images" / "bottom.jpg", quality=95)
    middle = {"pages": [
        {"page_idx": 0, "blocks": [{"type": "image", "index": 0, "bbox": [0, 0, 1, 1],
                                    "content": [{"image_path": "images/chart.jpg"}]}]},
        {"page_idx": 1, "blocks": [
            {"type": "chart", "index": 0, "bbox": [0, 0, 1, 1],
             "content": [{"type": "chart_body", "image_path": "images/chart.jpg"},
                         {"type": "chart_caption", "content": [{"type": "text", "content": "图1 云边协同架构"}]}]},
            {"type": "table", "index": 1, "bbox": [0, 0, 1, 1],
             "content": [{"image_path": "images/chart.jpg"}]}]},
        {"page_idx": 2, "blocks": [{"type": "chart", "index": 0, "bbox": [0, 0, 1, 1],
             "content": [{"type": "chart_body", "image_path": "images/alternative.jpg"},
                         {"type": "chart_caption", "content": [{"type": "text", "content": "图2 边缘计算拓扑"}]}]}]},
        {"page_idx": 3, "blocks": [
            {"type": "chart", "index": 0, "bbox": [0, 0, 1, .5],
             "content": [{"type": "chart_body", "image_path": "images/top.jpg"}]},
            {"type": "chart", "index": 1, "bbox": [0, .5, 1, 1],
             "content": [{"type": "chart_body", "image_path": "images/bottom.jpg"},
                         {"type": "chart_caption", "content": [{"type": "text", "content": "图3 云边协同架构上下图"}]}]}]}]}
    (parsed / "middle_json.json").write_text(json.dumps(middle, ensure_ascii=False))
    doc = store.put(Document(title="云边协同", origin=str(source), kind="pdf", parser="mineru",
                             pages=[Page(number=1, text="标题"), Page(number=2, text="云边协同架构"),
                                    Page(number=3, text="边缘计算拓扑"), Page(number=4, text="组合图")],
                             markdown="填表日期：2025年\n资助类别：面上项目\n云边协同架构"))
    store.record_file("study.pdf", source.stat().st_size, source.stat().st_mtime_ns,
                      sha256_file(source), doc["doc_id"], "indexed")
    with TestClient(app) as client:
        created = client.post("/api/reports", json={"domain": "云边协同", "year_from": 2025,
            "year_to": 2025, "template_id": "comprehensive", "corpus_id": corpus_id_for("fixture"),
            "illustrated": True})
        assert created.status_code == 201
        report = created.json()
        assert len(report["figures"]) == 1 and report["figures"][0]["page"] == 2
        figure_id = report["figures"][0]["figure_id"]
        image = client.get(f"/api/reports/{report['report_id']}/figures/{figure_id}")
        assert image.status_code == 200 and image.content == (parsed / "images" / "chart.jpg").read_bytes()
        word = client.get(f"/api/reports/{report['report_id']}/export?format=docx")
        with ZipFile(BytesIO(word.content)) as package:
            assert any(name.startswith("word/media/") for name in package.namelist())
            body = package.read("word/document.xml").decode()
            assert "图1 云边协同架构" in body and "第 2 页" in body
        bundle = client.get(f"/api/reports/{report['report_id']}/export?format=zip")
        with ZipFile(BytesIO(bundle.content)) as package:
            assert package.read(f"figures/{figure_id}.jpg") == image.content
            assert f"figures/{figure_id}.jpg" in package.read("report.md").decode()
        artifact = client.get("/api/artifacts").json()[0]
        candidates = client.get(f"/api/artifacts/{artifact['artifact_id']}/figure-candidates").json()
        alternative_id = next(item["figure_id"] for item in candidates if item["page"] == 3)
        replaced = client.post(f"/api/artifacts/{artifact['artifact_id']}/figures/{figure_id}/replace",
                               json={"figure_id": alternative_id})
        assert replaced.status_code == 201 and replaced.json()["version"] == 2
        assert replaced.json()["figures"][0]["figure_id"] == alternative_id
        assert client.get(f"/api/artifacts/{artifact['artifact_id']}/versions/2/figures/{alternative_id}").status_code == 200
        removed = client.delete(f"/api/artifacts/{artifact['artifact_id']}/figures/{alternative_id}")
        assert removed.status_code == 201 and removed.json()["version"] == 3
        assert not removed.json()["figures"]
        assert client.get(f"/api/artifacts/{artifact['artifact_id']}?version=1").json()["figures"]
        wrong = Image.new("RGB", (640, 400), "white")
        ImageDraw.Draw(wrong).line((20, 380, 600, 20), fill="black", width=4)
        wrong.save(parsed / "images" / "chart.jpg", quality=95)
        changed_cache = client.post("/api/reports", json={"domain": "云边协同", "year_from": 2025,
            "year_to": 2025, "template_id": "comprehensive", "corpus_id": corpus_id_for("fixture"),
            "illustrated": True})
        assert changed_cache.status_code == 201 and changed_cache.json()["figures"] == []
        chart.save(parsed / "images" / "chart.jpg", quality=95)
        with monkeypatch.context() as patch:
            def fail_attachments(*args, **kwargs):
                raise OSError("artifact database unavailable")
            patch.setattr(app.state.artifacts, "ensure_report", fail_attachments)
            failed_attachment = client.post("/api/reports", json={"domain": "云边协同", "year_from": 2025,
                "year_to": 2025, "template_id": "comprehensive", "corpus_id": corpus_id_for("fixture"),
                "illustrated": True})
        assert failed_attachment.status_code == 201 and failed_attachment.json()["figures"] == []
        assert "figures/" not in failed_attachment.json()["markdown"]
        assert client.get(f"/api/reports/{failed_attachment.json()['report_id']}").json()["markdown"] == failed_attachment.json()["markdown"]
        source.write_bytes(source.read_bytes() + b"changed")
        assert client.get(f"/api/artifacts/{artifact['artifact_id']}/figure-candidates").json() == []
        assert client.get(f"/api/reports/{report['report_id']}/figures/{figure_id}").content == image.content


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


def test_preflight_explains_why_no_document_is_eligible(tmp_path):
    # Given a document whose parsed text carries only a project period, no filing date
    store = Knowledge(tmp_path / "db")
    store.put(Document(title="无填表日期", origin="/docs/a.pdf", kind="pdf", parser="mineru",
                       pages=[Page(number=1, text="正文")],
                       markdown="---\nprojectName: 示例\nstartYear: 2022\nendYear: 2025\n---\n\n# 示例\n正文"))

    result = preflight_report(store, {"corpus_id": "kb", "year_from": 2021, "year_to": 2025})

    # Then the exclusion is attributed to the missing field and the remediation is named
    assert result["eligible_count"] == 0 and result["excluded"]["date"] == 1
    assert result["reasons"][0]["reason"] == "date"
    assert result["reasons"][0]["period"] == "2022–2025"
    assert "重导入" in result["hint"]


def test_preflight_reports_the_filing_years_it_actually_found(tmp_path):
    # Given one document filed in 2026 while the window is 2021-2025
    store = Knowledge(tmp_path / "db")
    store.put(Document(title="2026 结题", origin="/docs/b.pdf", kind="pdf", parser="mineru",
                       pages=[Page(number=1, text="正文")],
                       markdown="资助类别:面上项目\n填表日期:2026年02月02日\n# 标题\n正文"))

    result = preflight_report(store, {"corpus_id": "kb", "year_from": 2021, "year_to": 2025})

    assert result["eligible_count"] == 0 and result["excluded"]["year"] == 1
    assert result["observed_years"] == [2026]
    assert "2026" in result["hint"]


def test_report_period_reads_the_project_years_without_changing_the_filter(tmp_path):
    assert report_period("| 研究期限 | 2022-01-01 00:00:00.0到2025-12-31 00:00:00.0 |") == (2022, 2025)
    assert report_period("startYear: 2022\nendYear: 2025") == (2022, 2025)
    assert report_period("# 标题\n正文") == (None, None)
