"""W3-A: minimal RunSnapshot persisted for chat and report runs (A1/A3)."""

import asyncio
import contextlib
import threading
import time

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.agent.corpora import corpus_id_for
from src.knowledge import Document, Knowledge, Page
from src.main import create_app


class FakeGraph:
    def __init__(self, corpus_id):
        self.corpus_id = corpus_id

    async def astream(self, state, **kwargs):
        yield {"event": "sources", "data": [{"doc_id": "d1", "corpus_id": self.corpus_id,
                                             "version": "v1", "title": "报告", "page": 2}]}
        yield {"event": "telemetry", "data": {"run_id": "x", "path": "retrieve", "stages_ms": {},
                                              "chunks_retrieved": 1, "reports_selected": 1, "context_tokens": 10}}
        yield {"event": "token", "data": {"text": "回答"}}
        yield {"event": "done", "data": {"ok": True}}


def ready_app(tmp_path, factory=None):
    root = tmp_path / ".knowledge"
    corpus = root / "fixture"
    corpus.mkdir(parents=True)
    settings = Settings(_env_file=None, corpora_root=root, state_dir=tmp_path)
    store = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings)
    store.put(Document(title="seed", origin="seed", kind="text", parser="text",
                       pages=[Page(number=1, text="正文")]))
    cid = corpus_id_for("fixture")
    maker = factory or (lambda corpus_id: FakeGraph(corpus_id))
    return create_app(settings, store, lambda *_: maker(cid)), cid


def chat_body(cid, run_id, content="问题"):
    return {"run_id": run_id, "session_key": "sess-1", "messages": [{"role": "user", "content": content}],
            "corpus_ids": [cid], "task_id": "task1",
            "run_context": {"visible_params": {"task": "task1"}, "param_sources": {"task": "default"},
                            "resource_policy": "local_only", "output_intent": "text"}}


def test_user_chat_run_persists_the_server_effective_scope(tmp_path):
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        assert client.post("/api/chat", json=chat_body(cid, "chat-run-0001")).status_code == 200
        snapshot = client.get("/api/runs/chat-run-0001").json()
    assert snapshot["run_type"] == "chat" and snapshot["status"] == "completed"
    assert snapshot["session_key"] == "sess-1"
    assert snapshot["requested_corpus_ids"] == [cid]
    assert snapshot["effective_corpus_ids"] == [cid]
    assert snapshot["task_id"] == "task1"
    assert snapshot["resource_policy"] == "local_only"
    assert snapshot["params"] == {"task": "task1"}
    # A3: citations carry the corpus and title, not only locator fields.
    assert snapshot["citations"] == [{"doc_id": "d1", "corpus_id": cid, "version": "v1",
                                      "title": "报告", "page": 2}]
    assert "usage" in snapshot["metrics"] and "telemetry" in snapshot["metrics"]


def test_finished_run_is_not_silently_re_run_under_the_same_run_id(tmp_path):
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        assert client.post("/api/chat", json=chat_body(cid, "chat-run-done")).status_code == 200
        replay = client.post("/api/chat", json=chat_body(cid, "chat-run-done"))
    # A1: replaying a terminal run is rejected; it must not overwrite the snapshot.
    assert replay.status_code == 409
    assert "已存在" in replay.json()["detail"]


def test_duplicate_run_while_running_is_rejected(tmp_path):
    gate = threading.Event()

    class BlockingGraph:
        def __init__(self, corpus_id):
            self.corpus_id = corpus_id

        async def astream(self, state, **kwargs):
            await asyncio.to_thread(gate.wait, 5)
            yield {"event": "done", "data": {"ok": True}}

    app, cid = ready_app(tmp_path, lambda corpus_id: BlockingGraph(corpus_id))
    with TestClient(app) as client:
        first: dict = {}
        thread = threading.Thread(target=lambda: first.update(result=client.post("/api/chat", json=chat_body(cid, "chat-run-running"))))
        thread.start()
        for _ in range(300):
            try:
                if app.state.runs.get("chat-run-running")["status"] == "running":
                    break
            except KeyError:
                pass
            time.sleep(0.01)
        duplicate = client.post("/api/chat", json=chat_body(cid, "chat-run-running"))
        gate.set()
        thread.join(10)
    assert duplicate.status_code == 409
    assert first["result"].status_code == 200


def test_failed_run_backfills_status_and_sources(tmp_path):
    class FailingGraph:
        def __init__(self, corpus_id):
            self.corpus_id = corpus_id

        async def astream(self, state, **kwargs):
            yield {"event": "sources", "data": [{"doc_id": "d2", "corpus_id": self.corpus_id,
                                                 "version": "v2", "title": "报告2", "page": 3}]}
            raise RuntimeError("boom")

    app, cid = ready_app(tmp_path, lambda corpus_id: FailingGraph(corpus_id))
    with TestClient(app) as client:
        assert client.post("/api/chat", json=chat_body(cid, "chat-run-fail")).status_code == 200
        snapshot = client.get("/api/runs/chat-run-fail").json()
    assert snapshot["status"] == "failed"
    assert snapshot["citations"] == [{"doc_id": "d2", "corpus_id": cid, "version": "v2",
                                      "title": "报告2", "page": 3}]
    assert "usage" in snapshot["metrics"]


def test_requested_scope_may_differ_from_the_effective_scope(tmp_path):
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        # No corpus is sent: the server resolves the first corpus as the effective scope.
        body = {"run_id": "chat-run-default", "session_key": "sess-1",
                "messages": [{"role": "user", "content": "问题"}]}
        assert client.post("/api/chat", json=body).status_code == 200
        snapshot = client.get("/api/runs/chat-run-default").json()
    assert snapshot["requested_corpus_ids"] == []
    assert snapshot["effective_corpus_ids"] == [cid]


def test_timeout_run_is_marked_timed_out(tmp_path):
    class TimeoutGraph:
        def __init__(self, corpus_id):
            self.corpus_id = corpus_id

        async def astream(self, state, **kwargs):
            raise TimeoutError("budget")
            yield  # pragma: no cover - marks this as an async generator

    app, cid = ready_app(tmp_path, lambda corpus_id: TimeoutGraph(corpus_id))
    with TestClient(app) as client:
        assert client.post("/api/chat", json=chat_body(cid, "chat-run-timeout")).status_code == 200
        snapshot = client.get("/api/runs/chat-run-timeout").json()
    assert snapshot["status"] == "timed_out"


def test_snapshot_write_failure_does_not_block_the_answer(tmp_path, monkeypatch):
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        def boom(*_args, **_kwargs):
            raise RuntimeError("runs db down")

        monkeypatch.setattr(app.state.runs, "create", boom)
        response = client.post("/api/chat", json=chat_body(cid, "chat-run-nosnap"))
        assert response.status_code == 200 and "event: token" in response.text
        # No snapshot was persisted, so the run reads back as "not recorded" rather than failing.
        assert client.get("/api/runs/chat-run-nosnap").status_code == 404


def test_cancelled_run_backfills_interrupted_status(tmp_path):
    # A client disconnect cancels the response task; the endpoint's CancelledError branch must
    # still backfill the snapshot before re-raising.
    class CancelledGraph:
        def __init__(self, corpus_id):
            self.corpus_id = corpus_id

        async def astream(self, state, **kwargs):
            yield {"event": "token", "data": {"text": "部分"}}
            raise asyncio.CancelledError()
            yield {"event": "done", "data": {"ok": True}}  # pragma: no cover

    app, cid = ready_app(tmp_path, lambda corpus_id: CancelledGraph(corpus_id))
    with TestClient(app) as client:
        with contextlib.suppress(Exception):  # cancellation may surface as an error to the client
            client.post("/api/chat", json=chat_body(cid, "chat-run-interrupt"))
        snapshot = app.state.runs.get("chat-run-interrupt")
    assert snapshot["status"] == "interrupted"


def test_user_report_run_is_a_child_of_the_intake_run(tmp_path, monkeypatch):
    async def fake_generate(knowledge, settings, params, *, llm=None):
        return "# 报告"

    monkeypatch.setattr("src.main.generate_markdown", fake_generate)
    app, cid = ready_app(tmp_path)
    body = {"domain": "医疗", "year_from": 2024, "year_to": 2025, "template_id": "comprehensive",
            "corpus_id": cid, "session_key": "sess-1", "run_id": "report-run-0001",
            "parent_run_id": "intake-run-0001"}
    with TestClient(app) as client:
        created = client.post("/api/reports", json=body)
        assert created.status_code == 201
        # Same parameters retry idempotently, conflicting parameters are rejected (A1).
        again = client.post("/api/reports", json=body)
        assert again.status_code == 200 and again.json()["idempotent"] is True
        conflict = client.post("/api/reports", json={**body, "domain": "农业"})
        snapshot = client.get("/api/runs/report-run-0001").json()
    assert snapshot["run_type"] == "report" and snapshot["status"] == "completed"
    assert snapshot["parent_run_id"] == "intake-run-0001"
    assert snapshot["effective_corpus_ids"] == [cid]
    assert conflict.status_code == 409


def test_unknown_run_id_is_reported_as_not_recorded(tmp_path):
    app, _ = ready_app(tmp_path)
    with TestClient(app) as client:
        assert client.get("/api/runs/never-created").status_code == 404
