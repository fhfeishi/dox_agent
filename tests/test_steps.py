import asyncio
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.agent.graph import build_graph
from src.knowledge import Document, Knowledge, Page
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

    # The new chat contract resolves scope before streaming and requires a ready corpus, so the
    # fixture provides a minimal first corpus holding one indexed document.
    root = tmp_path / ".knowledge"
    corpus = root / "fixture"
    corpus.mkdir(parents=True)
    settings = Settings(_env_file=None, corpora_root=root, state_dir=tmp_path)
    store = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings)
    store.put(Document(title="seed", origin="seed", kind="text", parser="text",
                       pages=[Page(number=1, text="hi")]))

    app = create_app(settings, store, lambda *_: Graph())
    with TestClient(app) as client:
        response = client.post("/api/chat", json={"run_id": "client-run", "messages": [{"role": "user", "content": "hi"}]})
    frames = [json.loads(frame.split("data: ")[1]) for frame in response.text.split("\n\n") if frame.startswith("event: step")]
    assert frames == [{"id": "one", "sequence": 1, "phase": "understand", "status": "completed",
                       "label": "理解问题", "run_id": "client-run"}]


def test_a_search_is_traced_in_the_readers_terms_and_kept_with_the_run(tmp_path):
    """User, 2026-10-20: the answer shows which reports were found and why, and the run keeps it."""
    root = tmp_path / ".knowledge"
    corpus = root / "fixture"
    corpus.mkdir(parents=True)
    settings = Settings(_env_file=None, corpora_root=root, state_dir=tmp_path)
    store = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings)
    store.put(Document(title="2021_2024_62173009_王强_巡检机器人路径规划研究", origin="2021_2024_62173009_王强_巡检机器人路径规划研究.md",
                       kind="text", parser="text",
                       pages=[Page(number=1, text="国家自然科学基金\n# 研究进展\n巡检机器人的路径规划采用多传感器融合。")]))
    store.put(Document(title="2020_2023_62000001_李华_水稻育种", origin="2020_2023_62000001_李华_水稻育种.md",
                       kind="text", parser="text", pages=[Page(number=1, text="水稻育种与产量。")]))

    app = create_app(settings, store, lambda knowledge, s: build_graph(knowledge, s, DirectModel()))
    with TestClient(app) as client:
        response = client.post("/api/chat", json={"run_id": "traced-run", "messages": [{"role": "user", "content": "巡检机器人的路径规划有哪些进展？"}]})
        run = client.get("/api/runs/traced-run").json()
    frames = [json.loads(frame.split("data: ", 1)[1]) for frame in response.text.split("\n\n") if frame.startswith("event: trace")]
    search = next(frame for frame in frames if frame["kind"] == "search")
    # Too few documents here to tell topical words from common ones, so no filtered terms (real libraries have them).
    assert search["round"] == 1 and search["considered"] >= 1 and isinstance(search["terms"], list)
    chosen = search["reports"]
    assert [report["title"] for report in chosen] == ["巡检机器人路径规划研究"]  # the fund name, not the file name
    assert chosen[0]["project_no"] == "62173009" and chosen[0]["years"] == "2021–2024" and chosen[0]["pi"] == "王强"
    assert chosen[0]["where"][0]["page"] == 1 and 0 <= chosen[0]["cover"] <= 1
    assert any(frame["kind"] == "answer" and frame["sources"] == 1 for frame in frames)
    assert run["trace"] == frames
