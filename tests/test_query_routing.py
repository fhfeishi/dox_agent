"""A batch: routing, strict scope, partial delivery and cancellation contracts."""

import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from src.agent import graph
from src.agent.config import Settings
from src.agent.evidence import CorpusBlocked
from src.agent.routing import Intent, TurnOptions, classify, resolve_policy
from src.knowledge import Document, Knowledge, Page
from src.main import create_app


class Model:
    def __init__(self, route="direct", intent="general", **extra):
        self.decision = {"route": route, "intent": intent, **extra}
        self.prompts = []

    async def ainvoke(self, messages):
        return SimpleNamespace(content=json.dumps(self.decision))

    async def astream(self, messages):
        self.prompts.append(messages)
        yield SimpleNamespace(content="简短回答")


def messages(text="解释一个概念"):
    return [{"role": "user", "content": text}]


def add(store, title, origin):
    return store.put(Document(title=title, origin=origin, kind="text", parser="test",
                              pages=[Page(number=1, text="shared fact 本文资料内容")]))


@pytest.mark.parametrize("level", ["low", "middle", "high"])
@pytest.mark.parametrize("preparation", ["ready", "running", "error"])
def test_empty_greeting_never_touches_corpus(tmp_path, monkeypatch, level, preparation):
    store = Knowledge(tmp_path / "db")
    monkeypatch.setattr(store, "all", lambda: pytest.fail("Greeting accessed corpus"))
    monkeypatch.setattr(graph, "create_deep_agent", lambda **kwargs: pytest.fail("Greeting researched"))
    model = Model()
    app = graph.build_graph(store, Settings(_env_file=None), model)
    result = asyncio.run(app.ainvoke({"messages": messages("你好"), "preparation": preparation,
                                     "options": TurnOptions(evidence_level=level).model_dump()}))
    assert result["policy"]["route"] == "direct" and result["answer"] == "简短回答"
    assert "不声称查阅过资料" in model.prompts[0][0].content


@pytest.mark.parametrize("question,level,expected", [
    ("解释一下递归", "middle", "direct"), ("讨论一个类比", "low", "direct"),
    ("API参数是哪个", "low", "research"), ("把上一条简化", "high", "research"),
])
def test_fact_and_high_guards(tmp_path, question, level, expected):
    result = asyncio.run(resolve_policy(messages(question), TurnOptions(evidence_level=level), Model(), Knowledge(tmp_path / "db")))
    assert result["route"] == expected


@pytest.mark.parametrize("preparation", ["running", "error"])
def test_research_unavailable_never_starts_tools(tmp_path, monkeypatch, preparation):
    monkeypatch.setattr(graph, "create_deep_agent", lambda **kwargs: pytest.fail("Unavailable research"))
    app = graph.build_graph(Knowledge(tmp_path / "db"), Settings(_env_file=None), Model())
    result = asyncio.run(app.ainvoke({"messages": messages("API参数"), "preparation": preparation}))
    assert result["policy"]["route"] == "research"
    assert result["stop_reason"] == "corpus_" + preparation


def test_scope_resolution_conflict_and_ambiguity(tmp_path):
    store = Knowledge(tmp_path / "db")
    a, b = add(store, "A", "a"), add(store, "B", "b")

    def resolve(options, **decision):
        question = "根据这份资料回答" + ("《" + decision["source_reference"] + "》" if decision.get("source_reference") else "")
        return asyncio.run(resolve_policy(messages(question), options, Model(source_required=True, **decision), store))

    assert resolve(TurnOptions())["stop_reason"] == "scope_ambiguous"
    assert resolve(TurnOptions(), source_reference="不存在")["stop_reason"] == "scope_missing"
    assert resolve(TurnOptions(allowed_doc_ids=[b["doc_id"]]), source_reference="A")["stop_reason"] == "scope_conflict"
    result = resolve(TurnOptions(), source_reference="A")
    assert result["allowed_doc_ids"] == [a["doc_id"]] and result["route"] == "research"
    result = asyncio.run(resolve_policy(messages("仅按资料讨论"), TurnOptions(evidence_level="low", allowed_doc_ids=[a["doc_id"]]), Model(), store))
    assert result["query_routing"] == "knowledge_only" and result["evidence_level"] == "low"


def test_scope_enforced_before_ranking_and_at_read(tmp_path, monkeypatch):
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
                refused = await tools["read_doc"].ainvoke({"doc_id": b["doc_id"], "version": b["version"]})
                assert "范围" in refused["error"]
                await tools["read_doc"].ainvoke({"doc_id": a["doc_id"], "version": a["version"]})

        return Agent()

    monkeypatch.setattr(graph, "create_deep_agent", factory)
    app = graph.build_graph(store, Settings(_env_file=None, query_routing="knowledge_only"), Model())
    result = asyncio.run(app.ainvoke({"messages": messages(), "options": TurnOptions(query_routing="knowledge_only", evidence_level="low", allowed_doc_ids=[a["doc_id"]]).model_dump()}))
    assert len(result["evidence"]) == 1 and result["evidence"][0]["doc_id"] == a["doc_id"]


def test_partial_block_keeps_evidence_and_stops_tools(tmp_path, monkeypatch):
    store = Knowledge(tmp_path / "db")
    a = add(store, "A", "a")
    url = "https://docs.langchain.com/oss/python/absent"
    rounds = []

    def factory(**kwargs):
        tools = {tool.name: tool for tool in kwargs["tools"]}

        class Agent:
            async def ainvoke(self, *args, **kwargs):
                rounds.append(1)
                await tools["search_docs"].ainvoke({"query": "shared"})
                source = await tools["read_doc"].ainvoke({"doc_id": a["doc_id"], "version": a["version"]})
                if len(rounds) == 1:
                    await tools["finish_research"].ainvoke({"result": {"assessments": [
                        {"question": "已有部分", "status": "supported", "evidence_ids": [source["evidence_id"]], "gap": "none", "next_action": "answer"},
                        {"question": "缺失子问题", "status": "unsupported", "gap": "reading", "next_action": "read"},
                    ]}})
                    return
                with pytest.raises(CorpusBlocked):
                    await tools["check_corpus_page"].ainvoke({"source_url": url, "question": "缺失子问题"})
                with pytest.raises(CorpusBlocked):
                    await tools["search_docs"].ainvoke({"query": "again"})
                with pytest.raises(CorpusBlocked):
                    await tools["read_doc"].ainvoke({"doc_id": a["doc_id"], "version": a["version"]})

        return Agent()

    monkeypatch.setattr(graph, "create_deep_agent", factory)
    model = Model()
    app = graph.build_graph(store, Settings(_env_file=None, query_routing="knowledge_only"), model)
    result = asyncio.run(app.ainvoke({"messages": messages("shared 和 " + url)}))
    assert len(rounds) == 2 and len(result["evidence"]) == 1
    assert result["report"]["assessments"][0]["status"] == "supported"
    assert result["report"]["assessments"][-1]["question"] == "缺失子问题"
    assert result["stop_reason"] == "corpus_unavailable"
    assert "缺失子问题" in model.prompts[0][1].content
    assert "shared fact" in model.prompts[0][0].content


@pytest.mark.parametrize("output", ["not json", '{"route":"invented","intent":"general"}', '{"route":"direct","intent":"invented"}'])
def test_bad_classification_falls_back_to_research(output):
    class Bad:
        async def ainvoke(self, *args):
            return SimpleNamespace(content=output)

    decision, reason = asyncio.run(classify(messages(), Bad()))
    assert decision.route == "research" and reason == "routing_invalid"


def test_timeout_and_provider_failure_are_controlled():
    class Failing:
        def __init__(self, error):
            self.error = error

        async def ainvoke(self, *args):
            raise self.error

    decision, reason = asyncio.run(classify(messages(), Failing(TimeoutError())))
    assert decision.route == "research" and reason == "routing_timeout"
    decision, reason = asyncio.run(classify(messages(), Failing(RuntimeError("secret"))))
    assert decision.route == "clarify" and reason == "routing_unavailable"


def test_cancel_classification_never_starts_research(tmp_path, monkeypatch):
    monkeypatch.setattr(graph, "create_deep_agent", lambda **kwargs: pytest.fail("Research after cancellation"))

    async def scenario():
        started = asyncio.Event()

        class Slow:
            async def ainvoke(self, *args):
                started.set()
                await asyncio.Event().wait()

        app = graph.build_graph(Knowledge(tmp_path / "db"), Settings(_env_file=None), Slow())
        task = asyncio.create_task(app.ainvoke({"messages": messages()}))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(scenario())


def test_api_options_and_effective_metadata(tmp_path):
    store = Knowledge(tmp_path / "db")
    app = create_app(Settings(_env_file=None), store, lambda store, settings: graph.build_graph(store, settings, Model()))
    with TestClient(app) as client:
        for option in ({"evidence_level": "invalid"}, {"query_routing": "invalid"}, {"allowed_doc_ids": []}):
            assert client.post("/api/chat", json={"messages": messages("你好"), **option}).status_code == 422
        app.state.preparation = "running"
        response = client.post("/api/chat", json={"messages": messages("你好"), "evidence_level": "high"})
        assert '"route": "direct"' in response.text and '"evidence_level": "high"' in response.text
        assert "event: done" in response.text
        assert client.get("/api/health").json()["model_verified"] is False


def test_strict_intent_rejects_unknown_enum():
    with pytest.raises(ValueError):
        Intent(route="direct", intent="anything")


def test_model_cannot_invent_existing_source_identity(tmp_path):
    store = Knowledge(tmp_path / "db")
    add(store, "unmentioned", "a")
    result = asyncio.run(resolve_policy(messages("根据这份资料回答"), TurnOptions(), Model(source_required=True, source_reference="unmentioned"), store))
    assert result["stop_reason"] == "scope_ambiguous"


def test_turn_deadline_includes_classifier(tmp_path):
    cancelled = []

    class Slow(Model):
        async def ainvoke(self, *args):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.append(True)

    settings = Settings(_env_file=None).model_copy(update={"run_timeout": 0.05})
    app = create_app(settings, Knowledge(tmp_path / "db"), lambda store, settings: graph.build_graph(store, settings, Slow()))
    with TestClient(app) as client:
        response = client.post("/api/chat", json={"messages": messages()})
    assert cancelled and "时间预算" in response.text and "event: done" not in response.text


def test_cancel_research_never_starts_answer(tmp_path, monkeypatch):
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
        app = graph.build_graph(store, Settings(_env_file=None, query_routing="knowledge_only"), model)
        task = asyncio.create_task(app.ainvoke({"messages": messages()}))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert model.prompts == []

    asyncio.run(scenario())
