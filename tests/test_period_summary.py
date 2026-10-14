"""Period work summaries (query 2026-1013 1801): counted charts, model-written text, saved as a report."""
import json
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from src import main
from src.agent.config import Settings
from src.period_summary import charts, gather, markdown, period_start


def test_periods_are_rolling_windows_from_local_midnight():
    now = datetime(2026, 10, 13, 16, 30)
    # 一周内 … 一年内 (query 2026-1014 1716): the last 7/30/90/180/365 days including today.
    assert period_start("week", now) == datetime(2026, 10, 7)
    assert period_start("month", now) == datetime(2026, 9, 14)
    assert period_start("quarter", now) == datetime(2026, 7, 16)
    assert period_start("half", now) == datetime(2026, 4, 17)
    assert period_start("year", now) == datetime(2025, 10, 14)


def test_facts_charts_and_markdown_keep_numbers_out_of_the_model():
    now = datetime.now().astimezone()
    recent, earlier, old = ((now - timedelta(days=d)).isoformat() for d in (1, 2, 40))
    reports = [{"artifact_id": "r1", "title": "肺结节研判", "corpus_ids": ["m"], "updated_at": recent, "status": "completed",
                "markdown": "结论 [1]\n```dox-chart\n{}\n```"},
               {"artifact_id": "r2", "title": "草稿", "corpus_ids": ["b"], "updated_at": earlier, "status": "completed", "markdown": ""},
               {"title": "旧报告", "corpus_ids": ["m"], "updated_at": old, "status": "completed", "markdown": ""},
               {"title": "上期总结", "corpus_ids": [], "updated_at": recent, "status": "completed", "task_id": "period_summary", "markdown": ""}]
    run = {"status": "completed", "request": {"kind": "professional", "corpus_ids": ["m"]},
           "document": {"id": "d1", "filename": "a.docx", "metadata": {"title": "申请书甲"}}, "summary": {"issue": 2}}
    # The second run is the same file uploaded again: a new document id, the same content hash.
    runs = [{**run, "id": "x1", "created_at": recent, "input_versions": [{"sha256": "s1"}]},
            {**run, "id": "x0", "created_at": earlier, "document": {**run["document"], "id": "d9"}, "input_versions": [{"sha256": "s1"}]},
            {"id": "x2", "status": "completed", "created_at": earlier, "request": {}, "document": {"id": "d2", "filename": "b.docx"}}]
    names = {"m": "自然科学基金-AI与医疗", "b": "自然科学基金-AI与农业"}
    facts = gather("week", now, reports, runs, names)
    assert [r["title"] for r in facts["reports"]] == ["肺结节研判", "草稿"]  # outside the period and earlier summaries are left out
    assert facts["reports"][0]["excerpt"] == "结论"  # citations and chart blocks are not passed on
    # Two professional reviews of one application count once, with how many runs; a run without a kind is not called formal.
    assert facts["reviews"][0] == {"id": "x1", "title": "申请书甲", "kind": "专业审查", "domains": ["AI与医疗"], "date": recent[:10],
                                   "state": "已完成", "issues": 2, "runs": 2}
    assert [r["kind"] for r in facts["reviews"]] == ["专业审查", "资料审查"]
    figures = charts(facts, lambda name: {"fields": [("肿瘤", 5), ("神经", 3), ("心血管", 2)], "outside": 4, "total": 12})
    assert [f["title"] for f in figures] == ["各领域的工作量", "工作类型", "按日产出", "AI与医疗 · 应用领域分布"]
    assert figures[0]["values"] == [2, 1] and figures[1]["values"] == [2, 0, 1, 1] and figures[3]["type"] == "radar"
    assert "4 个项目的技术都未判定领域" in figures[3]["note"]
    # A chart with one bar says nothing: one domain and one day draw nothing; two kinds of work still do.
    one = gather("week", now, reports[:1], runs[:1], names)
    assert [f["title"] for f in charts(one, lambda name: {})] == ["工作类型"]
    body = markdown(facts, {"headline": "本期聚焦医疗影像。", "focus": ["《肺结节研判》关注早筛"], "suggestions": [{"issue": "证据少", "proposal": "补充多中心资料"}]}, figures)
    assert body.count("```dox-chart") == 4 and "本期聚焦医疗影像。" in body and "- **证据少**：补充多中心资料" in body
    assert "- 本期无可写内容。" in body  # empty sections say so instead of being filled


def test_summary_endpoint_saves_a_report_and_every_role_sees_the_same_work(tmp_path, monkeypatch):
    class Model:
        async def ainvoke(self, messages):
            facts = json.loads(messages[1].content)
            assert facts["reports"][0]["title"] == "医疗研判"
            return type("R", (), {"content": json.dumps({"headline": "本期以医疗为主。", "focus": ["《医疗研判》"], "suggestions": []})})()

    monkeypatch.setattr(main, "model_for", lambda settings, **_: Model())
    app = main.create_app(Settings(_env_file=None, state_dir=tmp_path / "state", corpora_root=tmp_path / "corpora",
                                   user_dir=tmp_path / "usr", model_api_key="test"))
    with TestClient(app) as client:
        client.post("/api/auth/login", json={"username": "user", "password": "123456"})
        app.state.artifacts.create("a" * 32, type="report", title="医疗研判", markdown="正文", status="completed")
        # Publishing was removed (query 2026-1014 1516): no publish endpoint, every report counts.
        assert client.post("/api/artifacts/" + "a" * 32 + "/publish", json={"published": True}).status_code in (404, 405)
        assert [r["title"] for r in client.get("/api/summaries/facts", params={"period": "week"}).json()["reports"]] == ["医疗研判"]
        client.post("/api/auth/logout")
        client.post("/api/auth/login", json={"username": "admin", "password": "123456"})
        assert client.post("/api/summaries", json={"period": "decade"}).status_code == 422
        created = client.post("/api/summaries", json={"period": "week"})
        assert created.status_code == 201, created.text
        saved = created.json()
        assert saved["task_id"] == "period_summary" and saved["title"].startswith("工作总结 · 一周内")
        # One report gives no chart and no empty chart heading.
        assert "本期以医疗为主。" in saved["markdown"] and "数据概览" not in saved["markdown"] and "分析报告 1 份" in saved["markdown"]
        client.post("/api/auth/logout")
        client.post("/api/auth/login", json={"username": "owner", "password": "123456"})
        # A leader sees the same recent work as everyone else.
        assert [r["title"] for r in client.get("/api/summaries/facts", params={"period": "week"}).json()["reports"]] == ["医疗研判"]
        assert client.post("/api/summaries", json={"period": "month"}).status_code == 201


def test_word_export_turns_chart_blocks_into_tables():
    from src.docx_export import _chart_tables
    md = '```dox-chart\n{"type": "radar", "title": "应用领域分布", "labels": ["肿瘤", "神经"], "values": [5, 3], "unit": " 项", "note": "按项目计"}\n```'
    assert _chart_tables(md) == "**应用领域分布**\n\n| 项目 | 数量 |\n| --- | --- |\n| 肿瘤 | 5 项 |\n| 神经 | 3 项 |\n\n按项目计"


def test_results_totals_exclude_unfinished_and_do_not_stop_at_list_limit(tmp_path):
    from src.review import storage
    settings = Settings(_env_file=None, state_dir=tmp_path/"state", corpora_root=tmp_path/"corpora")
    with TestClient(main.create_app(settings)) as client:
        store = client.app.state.artifacts
        for i in range(201):
            store.create(f"report-{i}", type="report", title="已生成报告", markdown="# 正文",
                         run_id=f"run-{i}", task_id="task4")
        store.create("pending-report", type="report", title="生成中", markdown="", run_id="pending",
                     task_id="intelligence", status="generating")
        store.create("failed-report", type="report", title="失败", markdown="", run_id="failed",
                     task_id="task4", status="failed")
        storage.save("run", {"id": "review-ok", "status": "completed", "created_at": datetime.now().astimezone().isoformat()})
        storage.save("run", {"id": "review-wait", "status": "queued", "created_at": datetime.now().astimezone().isoformat()})
        response = client.get("/api/results/summary")
        assert response.status_code == 200
        value = response.json()
        assert value["completed"] == {"analysis": 201, "review": 1, "intelligence": 0, "total": 202}
        assert value["active"] == 2 and value["failed"] == 1
        assert value["recent_completed"] == 202
