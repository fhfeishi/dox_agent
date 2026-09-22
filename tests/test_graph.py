"""L6: deterministic retrieval graph — no LLM search/read tool loop."""

import asyncio
from types import SimpleNamespace

from src.agent import graph
from src.agent.config import Settings
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
