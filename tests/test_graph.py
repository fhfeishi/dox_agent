"""L6: deterministic retrieval graph — no LLM search/read tool loop."""

import asyncio
from datetime import date
from types import SimpleNamespace

from src.agent import graph
from src.agent.config import Settings
from src.agent.graph import build_report_brief, extract_report_params
from src.knowledge import Document, Knowledge, Page


class RecordingModel:
    def __init__(self, answer="2025年10月22日 [1]"):
        self.answer = answer
        self.seen = ""

    async def astream(self, messages):
        self.seen = messages[0].content
        yield SimpleNamespace(content=self.answer)


def test_graph_retrieves_selected_reports_and_answers(tmp_path):
    store = Knowledge(tmp_path / "db")
    store.put(Document(title="南溪", origin="test", parser="text", kind="text",
                       pages=[Page(number=1, text="南溪施工完成日期2025年10月22日")]))
    model = RecordingModel()

    async def run():
        app = graph.build_graph(store, Settings(_env_file=None), model)
        return [event async for event in app.astream(
            {"messages": [{"role": "user", "content": "南溪施工"}], "task_id": "task2"}, stream_mode="custom")]

    events = asyncio.run(run())
    sources = next(event["data"] for event in events if event["event"] == "sources")
    telemetry = [event["data"] for event in events if event["event"] == "telemetry"][-1]
    assert sources and sources[0]["chunk_id"]
    assert sources[0]["version"] == store.all()[0]["version"]
    assert "2025年10月22日" in model.seen  # full report markdown reachable by the answer model
    assert telemetry["reports_selected"] == 1 and telemetry["chunks_retrieved"] >= 1
    assert telemetry["path"] == "retrieve"


def test_graph_reports_no_match_for_empty_corpus(tmp_path):
    async def run():
        app = graph.build_graph(Knowledge(tmp_path / "db"), Settings(_env_file=None), object())
        return await app.ainvoke({"messages": [{"role": "user", "content": "南溪"}]})

    result = asyncio.run(run())
    assert result["stop_reason"] == "no_reports"
    assert "没有匹配的报告" in result["answer"]


def test_task4_intake_collects_params_without_sources(tmp_path):
    async def run(messages):
        app = graph.build_graph(Knowledge(tmp_path / "db"), Settings(_env_file=None), object())
        return [event async for event in app.astream(
            {"messages": messages, "task_id": "task4", "corpus_domain": "人工智能与医疗"},
            stream_mode="custom")]

    events = asyncio.run(run([{"role": "user", "content": "帮我做一个成果报告"}]))
    assert not any(event["event"] == "sources" for event in events)
    tokens = "".join(event["data"]["text"] for event in events if event["event"] == "token")
    assert "2021–2025" in tokens and "直接生成报告" in tokens
    assert [event["data"] for event in events if event["event"] == "telemetry"][-1]["path"] == "report"
    assert [event["data"] for event in events if event["event"] == "policy"][-1]["stop_reason"] == "report_pending"

    events = asyncio.run(run([{"role": "user", "content": "综合报告，2020 至 2024"}]))
    tokens = "".join(event["data"]["text"] for event in events if event["event"] == "token")
    assert "已整理报告需求" in tokens


def test_report_param_extraction_maps_templates_and_years():
    assert extract_report_params([{"role": "user", "content": "热点分析 2021-2025"}], "医疗") == {
        "domain": "医疗", "template_id": "hotspots", "year_from": 2021, "year_to": 2025}
    params = extract_report_params([
        {"role": "user", "content": "未来趋势 2020-2024"},
        {"role": "user", "content": "年份改 2023"},
    ], "医疗")
    assert params["year_from"] == params["year_to"] == 2023  # later turn overrides
    assert params["template_id"] == "future_directions"


def test_user_multi_corpus_report_intake_requires_an_explicit_domain():
    params = extract_report_params([{"role": "user", "content": "综合报告 2025，研究领域：人工智能，重点项目"}])
    assert params == {"domain": "人工智能", "template_id": "comprehensive",
                      "fund_type": "重点项目", "year_from": 2025, "year_to": 2025}


def test_user_single_corpus_report_has_visible_safe_defaults():
    # Given one selected corpus with a reliable domain and a short report request
    messages = [{"role": "user", "content": "做一份近年成果报告"}]

    # When intake prepares the report brief on a known execution date
    brief = build_report_brief(messages, "人工智能与医疗", today=date(2026, 9, 24))

    # Then one click can start with traceable, editable scope defaults
    assert (brief["domain"], brief["year_from"], brief["year_to"], brief["template_id"]) == (
        "人工智能与医疗", 2021, 2025, "comprehensive")
    assert brief["fund_type"] == "" and brief["purpose"] == "研究进展梳理"
    assert brief["audience"] == "专业研究人员" and brief["length"] == "标准篇幅"
    assert brief["sources"]["domain"] == "corpus"
    assert brief["sources"]["year_from"] == "safe_default"


def test_user_explicit_topic_works_without_corpus_domain_and_overrides_it():
    # Given a multi-corpus request with an explicit topic, followed by a single-corpus suggestion
    messages = [{"role": "user", "content": "写一份关于癫痫致痫网络的成果报告"}]

    # When intake prepares either brief
    without_domain = build_report_brief(messages, today=date(2026, 9, 24))
    with_domain = build_report_brief(messages, "其他领域", today=date(2026, 9, 24))

    # Then the user's topic is retained and identified as user supplied
    assert without_domain["domain"] == with_domain["domain"] == "癫痫致痫网络"
    assert without_domain["sources"]["domain"] == "user"
    assert build_report_brief([{"role": "user", "content": "帮我写报告"}], today=date(2026, 9, 24))["domain"] == ""


def test_user_confirmed_web_snapshot_can_support_an_answer_without_local_matches(tmp_path):
    # Given a confirmed, versioned web snapshot and no matching local document
    snapshot = {"web_snapshot_id": "web-1", "title": "公开资料", "url": "https://example.com/research",
                "fetched_at": "2026-09-24T00:00:00+00:00", "version": "hash-1", "markdown": "网页事实：有研究方法。"}
    model = RecordingModel("有研究方法 [1]")

    # When the user asks with that snapshot in the run scope
    async def run():
        app = graph.build_graph(Knowledge(tmp_path / "db"), Settings(_env_file=None), model)
        return [event async for event in app.astream({
            "messages": [{"role": "user", "content": "有哪些研究方法？"}],
            "task_id": "task1", "preparation": "ready", "web_snapshots": [snapshot]}, stream_mode="custom")]

    events = asyncio.run(run())

    # Then the answer receives that exact saved body and exposes a resolvable web source
    sources = next(event["data"] for event in events if event["event"] == "sources")
    assert sources[0]["kind"] == "web" and sources[0]["snapshot_id"] == "web-1"
    assert sources[0]["version"] == "hash-1"
    assert "网页事实：有研究方法" in model.seen


def test_confirmed_web_snapshot_shares_the_context_budget(tmp_path):
    # Given a very long confirmed snapshot and a small context budget
    body = "研究方法与实验设置。" * 20000
    snapshot = {"web_snapshot_id": "web-long", "title": "长网页", "url": "https://example.com/long",
                "fetched_at": "2026-09-24T00:00:00+00:00", "version": "hash-long", "markdown": body}
    model = RecordingModel("有研究方法 [1]")

    async def run():
        app = graph.build_graph(Knowledge(tmp_path / "db"),
                                Settings(_env_file=None, retrieve_context_tokens=1024), model)
        return [event async for event in app.astream({
            "messages": [{"role": "user", "content": "有哪些研究方法？"}], "task_id": "task1",
            "preparation": "ready", "web_snapshots": [snapshot]}, stream_mode="custom")]

    events = asyncio.run(run())

    # Then the snapshot is read inside the budget and the cut is visible in the source
    sources = next(event["data"] for event in events if event["event"] == "sources")
    assert sources[0]["truncated"] is True
    assert graph.estimate_tokens(body) > 1024
    assert graph.estimate_tokens(model.seen) < graph.estimate_tokens(body)


def test_short_web_snapshot_is_read_in_full(tmp_path):
    snapshot = {"web_snapshot_id": "web-short", "title": "短网页", "url": "https://example.com/short",
                "fetched_at": "2026-09-24T00:00:00+00:00", "version": "hash-short",
                "markdown": "网页事实：有研究方法。"}
    model = RecordingModel("有研究方法 [1]")

    async def run():
        app = graph.build_graph(Knowledge(tmp_path / "db"), Settings(_env_file=None), model)
        return [event async for event in app.astream({
            "messages": [{"role": "user", "content": "有哪些研究方法？"}], "task_id": "task1",
            "preparation": "ready", "web_snapshots": [snapshot]}, stream_mode="custom")]

    events = asyncio.run(run())

    sources = next(event["data"] for event in events if event["event"] == "sources")
    assert sources[0]["truncated"] is False
    assert "网页事实：有研究方法。" in model.seen
