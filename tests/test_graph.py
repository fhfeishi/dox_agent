"""L6: deterministic retrieval graph — no LLM search/read tool loop."""

import asyncio
from types import SimpleNamespace

from src.agent import graph
from src.agent.config import Settings
from src.agent.graph import extract_report_params
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
    assert "还缺：填表日期年份（报告提交时间）" in tokens  # required years still missing
    assert [event["data"] for event in events if event["event"] == "telemetry"][-1]["path"] == "report"
    assert [event["data"] for event in events if event["event"] == "policy"][-1]["stop_reason"] == "report_pending"

    events = asyncio.run(run([{"role": "user", "content": "综合报告，2020 至 2024"}]))
    tokens = "".join(event["data"]["text"] for event in events if event["event"] == "token")
    assert "已记录报告需求" in tokens  # all required fields present


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
