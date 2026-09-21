import pytest
from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.knowledge import Document, Knowledge, Page
from src.main import create_app


def setup(tmp_path, graph_factory=None):
    settings = Settings(_env_file=None, data_dir=tmp_path)
    store = Knowledge(tmp_path / "db")
    args = {"settings": settings, "knowledge": store}
    if graph_factory:
        args["graph_factory"] = graph_factory
    return create_app(**args), store


def test_api_and_validation(tmp_path):
    app, store = setup(tmp_path)
    key = store.put(
        Document(
            title="test", origin="test", kind="text", parser="text", pages=[Page(number=1, text="source")]
        )
    )["doc_id"]
    with TestClient(app) as client:
        assert client.get("/api/health").json()["docs_count"] == 1
        assert client.get("/api/documents/" + key).json()["text"] == "source"
        assert client.get("/api/documents/missing").status_code == 404
        assert (
            client.post("/api/chat", json={"messages": [{"role": "assistant", "content": "x"}]}).status_code
            == 422
        )
        assert client.post("/api/web/confirm/unknown").status_code == 409


def test_chat_rejects_client_research_state_and_starts_fresh(tmp_path):
    states = []

    class Graph:
        async def astream(self, state, **kwargs):
            assert state["evidence"] == [] and state["searches"] == {}
            assert state["rounds"] == 0 and state["report"] is None and state["blocked"] is None
            states.append(state)
            state["evidence"].append({"old": "server-only"})
            yield {"event": "token", "data": {"text": "answer"}}

    app, _ = setup(tmp_path, lambda *args: Graph())
    message = {"role": "user", "content": "问题"}
    with TestClient(app) as client:
        for field in ("evidence", "searches", "report", "previousAttempts", "sources"):
            assert client.post("/api/chat", json={"messages": [message], field: []}).status_code == 422
        assert client.post("/api/chat", json={"messages": [{**message, "sources": []}]}).status_code == 422
        for _ in range(2):
            assert "event: done" in client.post("/api/chat", json={"messages": [message]}).text
    assert states[0] is not states[1]


def test_preview_requires_confirmation(tmp_path, monkeypatch):
    from src import main

    async def fake(*args):
        return Document(
            title="Page",
            origin="https://example.com",
            kind="web",
            parser="fake",
            pages=[Page(number=1, text="review first")],
        )

    monkeypatch.setattr(main, "parse_web", fake)
    app, store = setup(tmp_path)
    with TestClient(app) as client:
        preview = client.post("/api/web/preview", json={"url": "https://example.com"}).json()
        assert store.all() == []
        assert client.post("/api/web/confirm/" + preview["preview_id"]).status_code == 200
        assert len(store.all()) == 1
        assert client.post("/api/web/confirm/" + preview["preview_id"]).status_code == 409


def test_sse_success_and_failure(tmp_path):
    class Graph:
        async def astream(self, *args, **kwargs):
            yield {"event": "sources", "data": []}
            yield {"event": "token", "data": {"text": "answer"}}

    app, _ = setup(tmp_path, lambda *args: Graph())
    payload = {"messages": [{"role": "user", "content": "question"}]}
    with TestClient(app) as client:
        response = client.post("/api/chat", json=payload)
        assert response.text.index("event: sources") < response.text.index("event: token")
        assert "event: done" in response.text

    class Failed:
        async def astream(self, *args, **kwargs):
            raise RuntimeError("private key details")
            yield {}

    app, _ = setup(tmp_path, lambda *args: Failed())
    with TestClient(app) as client:
        response = client.post("/api/chat", json=payload)
        assert "event: error" in response.text
        assert "event: done" not in response.text
        assert "private key" not in response.text


def test_preparation_guards_and_lightweight_health(tmp_path, monkeypatch):
    class Graph:
        async def astream(self, state, **kwargs):
            assert state["preparation"] in ("running", "error")
            yield {"event": "token", "data": {"text": "路由按能力决定是否查证"}}

    app, store = setup(tmp_path, lambda *args: Graph())
    with TestClient(app) as client:
        def unexpected_read():
            raise AssertionError("Health must not deserialize the corpus")

        monkeypatch.setattr(store, "all", unexpected_read)
        app.state.preparation = "running"
        health = client.get("/api/health").json()
        assert health["preparation"] == "running"
        assert health["docs_count"] == 0
        payload = {"messages": [{"role": "user", "content": "question"}]}
        response = client.post("/api/chat", json=payload)
        assert response.status_code == 200
        assert "event: done" in response.text
        assert client.post("/api/official-docs", json={}).status_code == 409
        assert client.post("/api/ingest/local").status_code == 409
        assert client.post("/api/web/confirm/unknown").status_code == 409
        app.state.preparation = "error"
        assert "event: done" in client.post("/api/chat", json=payload).text


@pytest.mark.parametrize("outcome", ["success", "empty", "failure"])
def test_background_preparation(tmp_path, monkeypatch, outcome):
    import asyncio
    import threading
    import time

    from src import main

    store = Knowledge(tmp_path / "db")
    release = threading.Event()

    async def importer(knowledge, sections, progress):
        while not release.is_set():
            await asyncio.sleep(0.01)
        if outcome == "failure":
            raise RuntimeError("private details")
        if outcome == "success":
            knowledge.put(Document(title="Official", origin="test", kind="official", parser="test", pages=[Page(number=1, text="docs")]))

    monkeypatch.setattr(main, "Knowledge", lambda *args, **kwargs: store)
    monkeypatch.setattr(main, "import_official", importer)
    app = create_app(settings=Settings(_env_file=None, data_dir=tmp_path))
    with TestClient(app) as client:
        try:
            assert client.get("/api/health").json()["preparation"] == "running"
        finally:
            release.set()
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            health = client.get("/api/health").json()
            if health["preparation"] != "running":
                break
            time.sleep(0.01)
        assert health["preparation"] == ("ready" if outcome == "success" else "error")
        assert "private details" not in str(health)
