import asyncio
import json
from types import SimpleNamespace

from src.agent import graph
from src.agent.config import Settings
from src.knowledge import Document, Knowledge, Page


def test_quick_covered_skips_agent_and_partial_reuses_budget(tmp_path, monkeypatch):
    store = Knowledge(tmp_path / "docs")
    store.put(Document(title="fact", origin="fact", kind="text", parser="text", pages=[Page(number=1, text="fact is supported")]))
    searches = []
    original = store.search
    def search(query, **kwargs):
        searches.append(query)
        return original(query, **kwargs)
    monkeypatch.setattr(store, "search", search)
    calls = []
    def factory(**kwargs):
        calls.append(True)
        tools = {t.name: t for t in kwargs["tools"]}
        class Agent:
            async def ainvoke(self, data, **config):
                cached = json.loads(data["messages"][-1]["content"].split("：", 1)[1])
                assert cached["evidence"] and cached["searches"]
                assert await tools["search_docs"].ainvoke({"query": "new query"}) == [{"error": "搜索预算已用完，请提交研究报告"}]
                await tools["search_docs"].ainvoke({"query": "fact"})
                evidence_id = cached["evidence"][0]["evidence_id"]
                await tools["finish_research"].ainvoke({"result": {"assessments": [{"question": "fact", "status": "supported", "evidence_ids": [evidence_id], "gap": "none", "next_action": "answer"}]}})
        return Agent()
    monkeypatch.setattr(graph, "create_deep_agent", factory)
    class Model:
        supported = True
        async def ainvoke(self, messages):
            evidence = json.loads(messages[0].content.split("已读正文：")[1])
            return SimpleNamespace(content=json.dumps({"assessments": [{"question": "fact", "status": "supported" if self.supported else "partial", "evidence_ids": [evidence[0]["evidence_id"]], "gap": "none" if self.supported else "coverage", "next_action": "answer" if self.supported else "search"}]}))
        async def astream(self, messages):
            yield SimpleNamespace(content="fact [1]")
    model = Model()
    settings = Settings(_env_file=None, query_routing="knowledge_only", max_searches=1)
    def run():
        return asyncio.run(graph.build_graph(store, settings, model).ainvoke({"messages": [{"role": "user", "content": "fact"}], "evidence": [], "rounds": 0}))
    assert run()["stop_reason"] == "covered"
    assert not calls and searches == ["fact"]
    searches.clear()
    model.supported = False
    result = run()
    assert result["stop_reason"] == "covered" and len(calls) == 1
    assert searches == ["fact"]
    assert result["telemetry"]["reads"] == 1


def test_overview_reads_opening_and_continuation_instead_of_footer():
    from src.agent.quick import verify
    positions = []
    async def search(query):
        return [{"doc_id": "one", "version": "v1", "page": 1, "start_line": 90}] * 2
    async def read(doc_id, version, page, start_line):
        positions.append(start_line)
        return {"evidence_id": str(start_line), "next_start_line": 5 if start_line == 1 else None}
    class Model:
        async def ainvoke(self, messages):
            return SimpleNamespace(content='{"assessments":[{"question":"定位","status":"supported","evidence_ids":["5"],"gap":"none","next_action":"answer"}]}')
    result = asyncio.run(verify([{"role": "user", "content": "定位是什么"}], Model(), search, read))
    assert positions == [1, 5]
    assert result["assessments"][0]["status"] == "supported"
