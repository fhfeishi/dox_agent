import asyncio
import json
from uuid import uuid4

from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, LLMResult

from src.agent.graph import build_graph
from src.agent.usage import ModelBudgetExceeded, TurnUsage
from tests.test_app import setup


def result(usage=None, raw=None):
    return LLMResult(generations=[[ChatGeneration(message=AIMessage(content="ok", usage_metadata=usage))]],
                     llm_output=raw)


def test_usage_deduplicates_and_keeps_missing_unknown():
    async def check():
        ledger = TurnUsage()
        first, second = uuid4(), uuid4()
        await ledger.on_chat_model_start({}, [], run_id=first)
        response = result({"input_tokens": 10, "output_tokens": 3, "total_tokens": 13})
        await ledger.on_llm_end(response, run_id=first)
        await ledger.on_llm_end(response, run_id=first)
        assert ledger.snapshot()["total_tokens"] == 13
        await ledger.on_chat_model_start({}, [], run_id=second)
        await ledger.on_llm_end(result(), run_id=second)
        assert ledger.snapshot()["total_tokens"] is None
        assert ledger.snapshot()["reported_tokens"] == 13
        assert not ledger.snapshot()["complete"]
        await ledger.on_llm_end(result(raw={"token_usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7}}), run_id=second)
        assert ledger.snapshot()["total_tokens"] == 20
    asyncio.run(check())


def test_usage_explains_missing_calls_and_reserves_final_answer():
    async def check():
        ledger = TurnUsage(max_calls=2)
        first, second = uuid4(), uuid4()
        ledger.set_phase("research")
        await ledger.on_chat_model_start({}, [], run_id=first)
        await ledger.on_llm_end(result(), run_id=first)
        assert ledger.snapshot()["missing_reasons"] == {"provider_did_not_report": 1}
        try:
            await ledger.on_chat_model_start({}, [], run_id=second)
            raise AssertionError("research used the reserved final call")
        except ModelBudgetExceeded:
            pass
        ledger.set_phase("answer")
        await ledger.on_chat_model_start({}, [], run_id=second)
    asyncio.run(check())


def test_api_counts_classifier_and_answer_and_resets_each_request(tmp_path):
    usage = {"input_tokens": 10, "output_tokens": 3, "total_tokens": 13}
    model = FakeMessagesListChatModel(responses=[
        AIMessage(content='{"route":"direct","intent":"general"}', usage_metadata=usage),
        AIMessage(content="answer", usage_metadata=usage),
    ])
    app, _ = setup(tmp_path, lambda store, settings: build_graph(store, settings, model))
    with TestClient(app) as client:
        for _ in range(2):
            response = client.post("/api/chat", json={"messages": [{"role": "user", "content": "解释递归"}]})
            frames = [json.loads(frame.split("data: ")[1]) for frame in response.text.split("\n\n") if frame.startswith("event: usage")]
            assert frames[-1]["total_tokens"] == 26
            assert frames[-1]["calls"] == frames[-1]["reported_calls"] == 2
            assert response.text.index("event: usage") < response.text.index("event: done")
