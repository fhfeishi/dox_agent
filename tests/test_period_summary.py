"""Period work summaries (query 2026-1013 1801): counted charts, model-written text, saved as a report."""
import json
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from src import main
from src.agent.config import Settings
from src.period_summary import charts, gather, markdown, period_start


def test_periods_count_from_local_midnight():
    now = datetime(2026, 10, 13, 16, 30)  # a Tuesday
    assert period_start("3d", now) == datetime(2026, 10, 11)
    assert period_start("week", now) == datetime(2026, 10, 12)
    assert period_start("quarter", now) == datetime(2026, 10, 1)
    assert period_start("year", datetime(2026, 2, 3)) == datetime(2026, 1, 1)


def test_facts_charts_and_markdown_keep_numbers_out_of_the_model():
    now = datetime.now().astimezone()
    recent, old = (now - timedelta(days=1)).isoformat(), (now - timedelta(days=40)).isoformat()
    reports = [{"title": "肺结节研判", "corpus_ids": ["m"], "updated_at": recent, "status": "completed", "markdown": "结论 [1]\n```dox-chart\n{}\n```"},
               {"title": "旧报告", "corpus_ids": ["m"], "updated_at": old, "status": "completed", "markdown": ""},
               {"title": "上期总结", "corpus_ids": [], "updated_at": recent, "status": "completed", "task_id": "period_summary", "markdown": ""}]
    runs = [{"status": "completed", "created_at": recent, "request": {"kind": "professional", "corpus_ids": ["m"]},
             "document": {"filename": "a.docx", "metadata": {"title": "申请书甲"}}, "summary": {"issue": 2}}]
    facts = gather("7d", now, reports, runs, {"m": "自然科学基金-AI与医疗"})
    assert [r["title"] for r in facts["reports"]] == ["肺结节研判"]  # outside the period and earlier summaries are left out
    assert facts["reports"][0]["excerpt"] == "结论"  # citations and chart blocks are not passed on
    assert facts["reviews"][0] == {"title": "申请书甲", "kind": "专业审查", "domains": ["AI与医疗"], "date": recent[:10], "state": "已完成", "issues": 2}
    figures = charts(facts, lambda name: [("肿瘤", 5), ("神经", 3), ("心血管", 2)])
    assert [f["title"] for f in figures] == ["各领域的工作量", "工作类型", "按日产出", "AI与医疗 · 应用领域分布"]
    assert figures[0]["values"] == [2] and figures[1]["values"] == [1, 0, 1] and figures[3]["type"] == "radar"
    body = markdown(facts, {"headline": "本期聚焦医疗影像。", "focus": ["《肺结节研判》关注早筛"], "suggestions": [{"issue": "证据少", "proposal": "补充多中心资料"}]}, figures)
    assert body.count("```dox-chart") == 4 and "本期聚焦医疗影像。" in body and "- **证据少**：补充多中心资料" in body
    assert "- 本期无可写内容。" in body  # empty sections say so instead of being filled


def test_summary_endpoint_saves_a_report_and_leaders_may_ask_for_one(tmp_path, monkeypatch):
    class Model:
        async def ainvoke(self, messages):
            facts = json.loads(messages[1].content)
            assert facts["reports"][0]["title"] == "医疗研判"
            return type("R", (), {"content": json.dumps({"headline": "本期以医疗为主。", "focus": ["《医疗研判》"], "suggestions": []})})()

    monkeypatch.setattr(main, "model_for", lambda settings, **_: Model())
    app = main.create_app(Settings(_env_file=None, state_dir=tmp_path / "state", corpora_root=tmp_path / "corpora",
                                   user_dir=tmp_path / "usr", model_api_key="test"))
    with TestClient(app) as client:
        app.state.artifacts.create("a" * 32, type="report", title="医疗研判", markdown="正文", status="completed")
        assert client.post("/api/summaries", json={"period": "decade"}).status_code == 422
        created = client.post("/api/summaries", json={"period": "7d"})
        assert created.status_code == 201, created.text
        saved = created.json()
        assert saved["task_id"] == "period_summary" and saved["title"].startswith("工作总结 · 近 7 天")
        assert "本期以医疗为主。" in saved["markdown"] and "```dox-chart" in saved["markdown"]
        client.post("/api/auth/logout")
        client.post("/api/auth/login", json={"username": "owner", "password": "123456"})
        assert client.post("/api/summaries", json={"period": "month"}).status_code == 201


def test_word_export_turns_chart_blocks_into_tables():
    from src.docx_export import _chart_tables
    md = '```dox-chart\n{"type": "radar", "title": "应用领域分布", "labels": ["肿瘤", "神经"], "values": [5, 3], "unit": " 项", "note": "按项目计"}\n```'
    assert _chart_tables(md) == "**应用领域分布**\n\n| 项目 | 数量 |\n| --- | --- |\n| 肿瘤 | 5 项 |\n| 神经 | 3 项 |\n\n按项目计"
