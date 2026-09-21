import asyncio
from types import SimpleNamespace

from src.agent import graph
from src.agent.config import Settings
from src.knowledge import Document, Knowledge, Page


def test_graph_reads_real_tool_evidence(tmp_path, monkeypatch):
    store = Knowledge(tmp_path / "db")
    store.put(
        Document(
            title="南溪",
            origin="test",
            parser="text",
            kind="text",
            pages=[Page(number=1, text="南溪施工完成日期2025年10月22日")],
        )
    )

    def fake_agent(**kwargs):
        search, read = kwargs["tools"]

        class Agent:
            async def ainvoke(self, *args, **kwargs):
                hits = await search.ainvoke({"query": "南溪施工"})
                hit = hits[0]
                await read.ainvoke({k: hit[k] for k in ("doc_id", "version", "page", "start_line")})

        return Agent()

    monkeypatch.setattr(graph, "create_deep_agent", fake_agent)

    class Model:
        async def astream(self, messages):
            assert "2025年10月22日" in messages[0].content
            yield SimpleNamespace(content="2025年10月22日 [1]")

    app = graph.build_graph(store, Settings(_env_file=None, query_routing="knowledge_only", evidence_routing=False), Model())

    async def run():
        return [
            e
            async for e in app.astream(
                {"messages": [{"role": "user", "content": "南溪?"}], "rounds": 0, "evidence": []},
                stream_mode="custom",
            )
        ]

    events = asyncio.run(run())
    sources = next(e["data"] for e in events if e["event"] == "sources")
    assert len(sources) == 1
    assert sources[0]["version"] == store.all()[0]["version"]


def test_empty_research_is_bounded(tmp_path, monkeypatch):
    calls = []

    class Agent:
        async def ainvoke(self, *args, **kwargs):
            calls.append(1)

    monkeypatch.setattr(graph, "create_deep_agent", lambda **kwargs: Agent())
    app = graph.build_graph(Knowledge(tmp_path / "db"), Settings(_env_file=None, query_routing="knowledge_only", max_rounds=2, evidence_routing=False), object())
    result = asyncio.run(
        app.ainvoke({"messages": [{"role": "user", "content": "?"}], "rounds": 0, "evidence": []})
    )
    assert len(calls) == 2
    assert "没有读到" in result["answer"]
