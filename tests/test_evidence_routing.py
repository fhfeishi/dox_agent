import asyncio
from types import SimpleNamespace

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

from src.agent import graph
from src.agent.config import Settings
from src.agent.evidence import CorpusBlocked, ResearchReport, decide, merge_reports, validate_report
from src.knowledge import Document, Knowledge, Page


def corpus(tmp_path):
    store = Knowledge(tmp_path / "db")
    store.put(Document(title="retrieval", origin="https://docs.langchain.com/oss/python/langchain/retrieval",
                       kind="official", parser="text", pages=[Page(number=1, text="hybrid retrieval facts\n" * 130)]))
    return store


def assessment(question="召回", status="unsupported", ids=None, action="search", gap="retrieval"):
    return {"question": question, "status": status, "evidence_ids": ids or [], "next_action": action,
            "gap": gap, "detail": "检查另一子问题"}


def run(store, model, **settings):
    app = graph.build_graph(store, Settings(_env_file=None, query_routing="knowledge_only", **settings), model)
    return asyncio.run(app.ainvoke({"messages": [{"role": "user", "content": "比较召回与控制流"}],
                                  "evidence": [], "rounds": 0}))


class AnswerModel:
    async def astream(self, messages):
        assert "不意味着" in messages[1].content
        yield SimpleNamespace(content="有条件的建议 [1]")


def test_nonempty_partial_research_repairs_only_gap(tmp_path, monkeypatch):
    store = corpus(tmp_path)
    calls = []

    def factory(**kwargs):
        tools = {t.name: t for t in kwargs["tools"]}

        class Agent:
            async def ainvoke(self, data, **config):
                calls.append(data)
                if len(calls) == 2:
                    assert '"question": "控制流"' in data["messages"][-1]["content"]
                    assert '"status": "supported"' in data["messages"][-1]["content"]
                hits = await tools["search_docs"].ainvoke({"query": "hybrid"})
                source = await tools["read_doc"].ainvoke({"doc_id": hits[0]["doc_id"], "version": hits[0]["version"],
                                                        "start_line": 1 if len(calls) == 1 else 61})
                items = [assessment(status="supported", ids=[source["evidence_id"]], action="answer", gap="none")]
                items.append(assessment(question="控制流", status="unsupported" if len(calls) == 1 else "supported",
                                        ids=[] if len(calls) == 1 else [source["evidence_id"]], action="read",
                                        gap="reading" if len(calls) == 1 else "none"))
                await tools["finish_research"].ainvoke({"result": {"assessments": items}})

        return Agent()

    monkeypatch.setattr(graph, "create_deep_agent", factory)
    result = run(store, AnswerModel())
    assert len(calls) == 2 and result["stop_reason"] == "covered"
    # Section expansion already covers line 61; the second read reuses that evidence.
    assert len(result["evidence"]) == 1
    assert result["evidence"][0]["end_line"] >= 61
    assert result["report"]["assessments"][1]["status"] == "supported"


def test_no_progress_stops_before_third_round(tmp_path, monkeypatch):
    rounds = []

    def factory(**kwargs):
        tools = {t.name: t for t in kwargs["tools"]}

        class Agent:
            async def ainvoke(self, *args, **config):
                rounds.append(1)
                await tools["search_docs"].ainvoke({"query": "not-present"})
                await tools["finish_research"].ainvoke({"result": {"assessments": [assessment()]}})
        return Agent()

    monkeypatch.setattr(graph, "create_deep_agent", factory)
    result = run(corpus(tmp_path), object(), max_rounds=3)
    assert len(rounds) == 2 and result["stop_reason"] == "no_progress"
    assert result["blocked"] is None


def test_bad_report_ids_and_unverified_missing_corpus():
    report = {"assessments": [assessment(status="supported", ids=["invented"], gap="corpus_missing")]}
    item = validate_report(report, [{"evidence_id": "real"}])["assessments"][0]
    assert item["status"] == "unsupported" and item["gap"] == "unknown"
    assert item["next_action"] == "stop"
    with pytest.raises(ValueError):
        ResearchReport.model_validate({"assessments": []})


@pytest.mark.parametrize(("overrides", "reason"), [
    ({"blocked": True}, "corpus_unavailable"), ({"rounds": 3}, "round_limit"),
    ({"evidence_count": 6}, "read_limit"), ({"searches": 6}, "search_limit"),
])
def test_budgets(overrides, reason):
    args = {"blocked": False, "rounds": 1, "max_rounds": 3, "new_evidence": 1,
            "evidence_count": 1, "searches": 1, "max_searches": 6}
    args.update(overrides)
    assert decide({"assessments": [assessment()]}, **args) == reason


class ToolModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


def test_real_deepagent_propagates_verified_gap_without_another_model_call(tmp_path):
    url = "https://docs.langchain.com/oss/python/integrations/retrievers/missing"
    model = ToolModel(responses=[AIMessage(content="", tool_calls=[{
        "id": "gap", "name": "check_corpus_page", "args": {"source_url": url}, "type": "tool_call",
    }]), AIMessage(content="SHOULD NOT BE CALLED")])
    app = graph.build_graph(corpus(tmp_path), Settings(_env_file=None, query_routing="knowledge_only"), model)
    result = asyncio.run(app.ainvoke({"messages": [{"role": "user", "content": "请解释该页面 " + url}],
                                     "evidence": [], "rounds": 0}))
    assert result["stop_reason"] == "corpus_unavailable"
    assert "unknown" in result["answer"] and "下一步" in result["answer"]
    assert model.i == 1 and result["rounds"] == 1


def test_real_finish_tool_terminates_inner_agent(tmp_path):
    model = ToolModel(responses=[AIMessage(content="", tool_calls=[{
        "id": "finish", "name": "finish_research", "args": {"result": {"assessments": [assessment(action="stop", gap="unknown")]}},
        "type": "tool_call",
    }]), AIMessage(content="SHOULD NOT BE CALLED")])
    result = run(corpus(tmp_path), model)
    assert result["stop_reason"] == "partial_or_clarify" and result["report"] is not None
    assert model.i == 1


def test_hard_stop_guards_queued_tools_and_rejects_invented_url(tmp_path, monkeypatch):
    store = corpus(tmp_path)
    monkeypatch.setattr(store, "search", lambda *args, **kwargs: pytest.fail("Search after hard stop"))
    url = "https://docs.langchain.com/oss/python/langchain/needed"

    def factory(**kwargs):
        tools = {t.name: t for t in kwargs["tools"]}

        class Agent:
            async def ainvoke(self, *args, **config):
                unknown = await tools["check_corpus_page"].ainvoke({"source_url": url + "-invented"})
                assert unknown["status"] == "unknown"
                with pytest.raises(CorpusBlocked):
                    await tools["check_corpus_page"].ainvoke({"source_url": url})
                with pytest.raises(CorpusBlocked):
                    await tools["search_docs"].ainvoke({"query": "hybrid"})
                with pytest.raises(CorpusBlocked):
                    await tools["read_doc"].ainvoke({"doc_id": "x", "version": "y"})
        return Agent()

    monkeypatch.setattr(graph, "create_deep_agent", factory)
    app = graph.build_graph(store, Settings(_env_file=None, query_routing="knowledge_only", quick_verification=False), object())
    result = asyncio.run(app.ainvoke({"messages": [{"role": "user", "content": url}], "evidence": [], "rounds": 0}))
    assert result["blocked"]


def test_empty_corpus_never_starts_agent(tmp_path, monkeypatch):
    monkeypatch.setattr(graph, "create_deep_agent", lambda **kwargs: pytest.fail("No agent for empty corpus"))
    result = run(Knowledge(tmp_path / "db"), object())
    assert result["blocked"]["reason"] == "corpus_empty" and result["stop_reason"] == "corpus_unavailable"


def test_repair_cannot_drop_missing_subquestion_or_search_for_output_gap():
    previous = {"assessments": [assessment(question="未解决")], "answer_mode": "consultation"}
    current = {"assessments": [assessment(question="已解决", status="supported", ids=["real"], gap="none")]}
    merged = validate_report(merge_reports(previous, current), [{"evidence_id": "real"}])
    assert len(merged["assessments"]) == 2
    assert merged["assessments"][0]["status"] == "unsupported"
    report = validate_report({"assessments": [assessment(status="partial", ids=["real"], gap="output")]}, [{"evidence_id": "real"}])
    assert report["assessments"][0]["next_action"] == "answer"
