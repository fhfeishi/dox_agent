from fastapi.testclient import TestClient

from src.workspace import note_locators
from tests.test_app import setup


def test_sessions_persist_and_reject_stale_writes(tmp_path):
    app, _ = setup(tmp_path)
    record = {"title": "会话", "data": {"turns": [], "options": {}}, "revision": 0}
    with TestClient(app) as client:
        assert client.put("/api/workspace/sessions/test", json=record).json()["revision"] == 1
        assert client.put("/api/workspace/sessions/test", json=record).status_code == 409
    other, _ = setup(tmp_path)
    with TestClient(other) as client:
        assert client.get("/api/workspace/sessions").json()[0]["title"] == "会话"


def test_notes_require_current_sources_and_never_return_note_body_as_evidence(tmp_path):
    app, store = setup(tmp_path)
    with TestClient(app) as client:
        doc = client.post("/api/ingest/text", json={"title": "Demo", "origin": "manual:test", "text": "# Demo\nreal facts"}).json()
        source = {**doc, "page": 1, "start_line": 1}
        note = {"title": "navigation", "data": {"body": "do not trust this assertion", "sources": [source], "reviewed": False}}
        assert client.put("/api/workspace/notes/test", json=note).status_code == 200
        assert note_locators(app.state.workspace, store, "navigation", None) == []
        note["revision"] = 1
        note["data"]["reviewed"] = True
        assert client.put("/api/workspace/notes/test", json=note).status_code == 200
        assert note_locators(app.state.workspace, store, "navigation", None) == [source]
        assert note_locators(app.state.workspace, store, "navigation", ["other"]) == []
        client.post("/api/ingest/text", json={"title": "Demo", "origin": "manual:test", "text": "changed facts"})
        assert client.get("/api/workspace/notes").json()[0]["source_status"] == "stale"
        assert note_locators(app.state.workspace, store, "navigation", None) == []
        note["revision"] = 2
        assert client.put("/api/workspace/notes/test", json=note).status_code == 422
