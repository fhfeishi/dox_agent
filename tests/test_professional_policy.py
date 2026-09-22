"""Professional Q&A policy: fixed corpus-grounded flow, scope handling and failure semantics.

Phase C removes automatic intent classification and the user-facing strategy switches
(``query_routing`` / ``evidence_level`` / ``execution_mode``).  Every user question is a
professional, evidence-bound question; only the document scope can change the policy.
"""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from src.agent import graph
from src.agent.config import Settings
from src.agent.evidence import CorpusBlocked
from src.agent.routing import TurnOptions, resolve_policy
from src.knowledge import Document, Knowledge, Page
from src.main import create_app


class Model:
    """Minimal provider: quick verification fails, the final answer streams a cited line."""

    def __init__(self):
        self.prompts = []

    async def ainvoke(self, messages):
        return SimpleNamespace(content='{"route":"direct","intent":"general"}')

    async def astream(self, messages):
        self.prompts.append(messages)
        yield SimpleNamespace(content="有据回答 [1]")


def messages(text="解释一个概念"):
    return [{"role": "user", "content": text}]


def add(store, title, origin):
    return store.put(Document(title=title, origin=origin, kind="text", parser="test",
                              pages=[Page(number=1, text="shared fact 本文资料内容")]))


def test_user_question_always_routes_to_grounded_research(tmp_path):
    # Given a ready corpus and no user-selected strategy,
    # When the turn policy is resolved, Then it always researches with citations.
    store = Knowledge(tmp_path / "db")
    add(store, "A", "a")
    policy = asyncio.run(resolve_policy(TurnOptions(), store, "ready"))
    assert policy["route"] == "research"
    assert policy["stop_reason"] == "professional"
    assert policy["notice"] == ""
    assert policy["allowed_doc_ids"] is None


def test_user_unavailable_scope_is_clarified(tmp_path):
    store = Knowledge(tmp_path / "db")
    policy = asyncio.run(resolve_policy(TurnOptions(allowed_doc_ids=["missing"]), store, "ready"))
    assert policy["route"] == "clarify" and policy["stop_reason"] == "scope_missing"


@pytest.mark.parametrize("preparation", ["running", "error"])
def test_user_cannot_research_before_corpus_is_ready(tmp_path, monkeypatch, preparation):
    monkeypatch.setattr(graph, "create_deep_agent", lambda **kwargs: pytest.fail("Research before corpus ready"))
    app = graph.build_graph(Knowledge(tmp_path / "db"), Settings(_env_file=None), Model())
    result = asyncio.run(app.ainvoke({"messages": messages("API参数"), "preparation": preparation}))
    assert result["policy"]["route"] == "research"
    assert result["stop_reason"] == "corpus_" + preparation
    assert "知识库" in result["answer"]


def test_user_scope_is_enforced_before_ranking_and_at_read(tmp_path, monkeypatch):
    store = Knowledge(tmp_path / "db")
    a, b = add(store, "A", "a"), add(store, "B", "b")
    store.dense = SimpleNamespace(search=lambda *args: pytest.fail("Scoped dense would mutate shared index"))
    assert {hit["doc_id"] for hit in store.search("shared", allowed_doc_ids=[a["doc_id"]])} == {a["doc_id"]}
    assert store.search("shared", allowed_doc_ids=[]) == []

    def factory(**kwargs):
        tools = {tool.name: tool for tool in kwargs["tools"]}

        class Agent:
            async def ainvoke(self, *args, **kwargs):
                hits = await tools["search_docs"].ainvoke({"query": "shared"})
                assert {h["doc_id"] for h in hits} == {a["doc_id"]}
                refused = await tools["read_doc"].ainvoke({"doc_id": b["doc_id"], "version": b["version"],
                                                         "chunk_id": hits[0]["chunk_id"]})
                assert "范围" in refused["error"]
                await tools["read_doc"].ainvoke({"doc_id": a["doc_id"], "version": a["version"],
                                                "chunk_id": hits[0]["chunk_id"]})

        return Agent()

    monkeypatch.setattr(graph, "create_deep_agent", factory)
    app = graph.build_graph(store, Settings(_env_file=None), Model())
    result = asyncio.run(app.ainvoke({"messages": messages(),
                                      "options": TurnOptions(allowed_doc_ids=[a["doc_id"]]).model_dump()}))
    assert len(result["evidence"]) == 1 and result["evidence"][0]["doc_id"] == a["doc_id"]


def test_user_partial_block_keeps_evidence_and_stops_tools(tmp_path, monkeypatch):
    store = Knowledge(tmp_path / "db")
    a = add(store, "A", "a")
    url = "https://docs.langchain.com/oss/python/absent"
    rounds = []

    def factory(**kwargs):
        tools = {t.name: t for t in kwargs["tools"]}

        class Agent:
            async def ainvoke(self, *args, **kwargs):
                rounds.append(1)
                hits = await tools["search_docs"].ainvoke({"query": "shared"})
                source = await tools["read_doc"].ainvoke({"doc_id": a["doc_id"], "version": a["version"],
                                                         "chunk_id": hits[0]["chunk_id"]})
                if len(rounds) == 1:
                    await tools["finish_research"].ainvoke({"result": {"assessments": [
                        {"question": "已有部分", "status": "supported", "evidence_ids": [source["evidence_id"]],
                         "gap": "none", "next_action": "answer"},
                        {"question": "缺失子问题", "status": "unsupported", "gap": "reading", "next_action": "read"},
                    ]}})
                    return
                with pytest.raises(CorpusBlocked):
                    await tools["check_corpus_page"].ainvoke({"source_url": url, "question": "缺失子问题"})
                with pytest.raises(CorpusBlocked):
                    await tools["search_docs"].ainvoke({"query": "again"})
                with pytest.raises(CorpusBlocked):
                    await tools["read_doc"].ainvoke({"doc_id": a["doc_id"], "version": a["version"],
                                                    "chunk_id": hits[0]["chunk_id"]})

        return Agent()

    monkeypatch.setattr(graph, "create_deep_agent", factory)
    model = Model()
    app = graph.build_graph(store, Settings(_env_file=None), model)
    result = asyncio.run(app.ainvoke({"messages": messages("shared 和 " + url)}))
    assert len(rounds) == 2 and len(result["evidence"]) == 1
    assert result["report"]["assessments"][0]["status"] == "supported"
    assert result["report"]["assessments"][-1]["question"] == "缺失子问题"
    assert result["stop_reason"] == "corpus_unavailable"
    assert "缺失子问题" in model.prompts[0][1].content
    assert "shared fact" in model.prompts[0][0].content


def test_user_removed_strategy_fields_are_rejected_and_health_is_clean(tmp_path):
    store = Knowledge(tmp_path / "db")
    app = create_app(Settings(_env_file=None, state_dir=tmp_path), store, lambda store, settings: graph.build_graph(store, settings, Model()))
    with TestClient(app) as client:
        for option in ({"evidence_level": "invalid"}, {"query_routing": "invalid"},
                       {"execution_mode": "research"}, {"allowed_doc_ids": []}):
            assert client.post("/api/chat", json={"messages": messages("你好"), **option}).status_code == 422
        health = client.get("/api/health").json()
        assert "defaults" not in health and health["model_verified"] is False


def test_user_run_timeout_reports_budget_instead_of_a_fake_answer(tmp_path):
    class HangingGraph:
        async def astream(self, *args, **kwargs):
            await asyncio.Event().wait()
            yield {}  # pragma: no cover

    settings = Settings(_env_file=None, state_dir=tmp_path).model_copy(update={"run_timeout": 0.05})
    app = create_app(settings, Knowledge(tmp_path / "db"), lambda store, settings: HangingGraph())
    with TestClient(app) as client:
        response = client.post("/api/chat", json={"messages": messages()})
    assert "时间预算" in response.text
    assert "event: done" not in response.text


def test_user_cancel_during_research_never_generates_answer(tmp_path, monkeypatch):
    async def scenario():
        started = asyncio.Event()
        store = Knowledge(tmp_path / "db")
        add(store, "A", "a")

        class Agent:
            async def ainvoke(self, *args, **kwargs):
                started.set()
                await asyncio.Event().wait()

        monkeypatch.setattr(graph, "create_deep_agent", lambda **kwargs: Agent())
        model = Model()
        app = graph.build_graph(store, Settings(_env_file=None), model)
        task = asyncio.create_task(app.ainvoke({"messages": messages()}))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert model.prompts == []

    asyncio.run(scenario())
