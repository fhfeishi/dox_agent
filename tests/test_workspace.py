from fastapi.testclient import TestClient

from src.knowledge import Document, Page
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
        # A conversation is its author's (query 2026-1023 1044): another account does not see it listed.
        client.post("/api/auth/logout")
        client.post("/api/auth/login", json={"username": "user", "password": "123456"})
        assert client.get("/api/workspace/sessions").json() == []


def test_notes_require_current_sources(tmp_path):
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        doc = client.post("/api/ingest/text", json={"title": "Demo", "text": "# Demo\nreal facts"}).json()
        source = {**doc, "page": 1, "start_line": 1}
        note = {"title": "navigation", "data": {"body": "do not trust this assertion", "sources": [source], "reviewed": False}}
        assert client.put("/api/workspace/notes/test", json=note).status_code == 200
        note["revision"] = 1
        note["data"]["reviewed"] = True
        assert client.put("/api/workspace/notes/test", json=note).status_code == 200
        # The source changes in place (as a re-import does); a client can no longer pick the id (P0-3).
        app.state.knowledge.put(Document(title="Demo", origin="manual:test", kind="text", parser="manual",
                                         pages=[Page(number=1, text="changed facts")]), doc_id=doc["doc_id"])
        assert client.get("/api/workspace/notes").json()[0]["source_status"] == "stale"
        note["revision"] = 2
        assert client.put("/api/workspace/notes/test", json=note).status_code == 422


def test_text_import_cannot_take_over_an_indexed_document(tmp_path):
    # P0-3: the client used to choose `origin`, and a new document's id is derived from it, so an
    # indexed file's absolute path replaced that document's body while it stayed current.
    app, store = setup(tmp_path)
    source = tmp_path / ".knowledge" / "fixture" / "source" / "report.md"
    source.write_text("genuine facts", encoding="utf-8")
    stat = source.stat()
    original = store.put(Document(title="report", origin=str(source.resolve()), kind="text", parser="markdown",
                                  pages=[Page(number=1, text="genuine facts")]),
                         source_file=("report.md", stat.st_size, stat.st_mtime_ns, "sha"))
    manifest = store.files()["report.md"]
    hits = store.search("genuine")
    assert hits and {hit["doc_id"] for hit in hits} == {original["doc_id"]}
    with TestClient(app) as client:
        client.cookies.clear()
        assert client.post("/api/auth/login", json={"username": "user", "password": "123456"}).status_code == 200
        assert client.get("/api/auth/session").json()["role"] == "user"
        response = client.post("/api/ingest/text", json={"title": "x", "origin": str(source.resolve()),
                                                       "text": "forged facts"})
        assert response.status_code == 200, response.text
        made = response.json()
        for method in (client.get, client.head):
            assert method(f"/api/documents/{made['doc_id']}/file").status_code == 404
    assert made["doc_id"] != original["doc_id"]
    assert store.read_markdown(made["doc_id"]) == "forged facts"
    assert store.read_markdown(original["doc_id"]) == "genuine facts"
    assert store.get(original["doc_id"])["version"] == original["version"]
    assert store.files()["report.md"] == manifest
    assert {doc["doc_id"] for doc in store.current()} == {original["doc_id"], made["doc_id"]}
    assert store.search("genuine", allowed_doc_ids=[original["doc_id"]]) == hits
    assert store.get(made["doc_id"])["origin"].startswith("manual:")
