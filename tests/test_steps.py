import asyncio
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.agent.graph import build_graph
from src.knowledge import Knowledge
from src.main import create_app


class DirectModel:
    async def astream(self, messages):
        yield SimpleNamespace(content="你好")


def test_graph_emits_real_step_lifecycle(tmp_path):
    async def run():
        graph = build_graph(Knowledge(tmp_path / "docs"), Settings(_env_file=None), DirectModel())
        return [event async for event in graph.astream(
            {"messages": [{"role": "user", "content": "你好"}], "evidence": [], "rounds": 0, "preparation": "running"},
            stream_mode="custom",
        )]

    events = asyncio.run(run())
    steps = [event["data"] for event in events if event["event"] == "step"]
    assert [(step["phase"], step["status"]) for step in steps] == [
        ("understand", "running"), ("understand", "completed"),
        ("direct", "running"), ("direct", "completed"),
        ("finish", "running"), ("finish", "completed"),
    ]
    assert [step["sequence"] for step in steps] == [1, 1, 2, 2, 3, 3]
    # Observable per-step latency: completed steps carry a non-negative duration, running ones do not.
    assert all("duration_ms" not in step for step in steps if step["status"] == "running")
    completed = [step for step in steps if step["status"] == "completed"]
    assert completed and all(isinstance(step.get("duration_ms"), int) and step["duration_ms"] >= 0 for step in completed)


def test_api_attaches_client_run_id_to_steps(tmp_path):
    class Graph:
        async def astream(self, state, **kwargs):
            yield {"event": "step", "data": {"id": "one", "sequence": 1, "phase": "understand",
                                                   "status": "completed", "label": "理解问题"}}

    app = create_app(Settings(_env_file=None, corpora_root=tmp_path / ".knowledge", state_dir=tmp_path), Knowledge(tmp_path / "docs"), lambda *_: Graph())
    with TestClient(app) as client:
        response = client.post("/api/chat", json={"run_id": "client-run", "messages": [{"role": "user", "content": "hi"}]})
    frames = [json.loads(frame.split("data: ")[1]) for frame in response.text.split("\n\n") if frame.startswith("event: step")]
    assert frames == [{"id": "one", "sequence": 1, "phase": "understand", "status": "completed",
                       "label": "理解问题", "run_id": "client-run"}]
