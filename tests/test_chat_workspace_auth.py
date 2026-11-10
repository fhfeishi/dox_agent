"""High#2 (2026-11-05): chat runs and workspace sessions belong to the account that made them."""

from fastapi.testclient import TestClient

from src.auth import CURRENT_USER
from tests.test_app import setup


def login(client, name):
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"username": name, "password": "123456"}).status_code == 200


def seed_run(app, run_id: str, owner: str, status: str = "completed") -> None:
    """The run store lives on app state from the lifespan, so call this inside TestClient."""
    token = CURRENT_USER.set(owner)
    try:
        app.state.runs.create(run_id, f"fp-{run_id}", owner=owner, run_type="chat", status=status)
    finally:
        CURRENT_USER.reset(token)


def test_run_events_enforce_owner(tmp_path):
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        seed_run(client.app, "run-a", "user")
        login(client, "user")
        # The author passes the owner check; this seeded run has no replay, so 409 is the honest
        # answer (409 here is "nothing to replay", not a permission failure).
        assert client.get("/api/runs/run-a/events").status_code in (200, 409)
        login(client, "admin")
        assert client.get("/api/runs/run-a/events").status_code == 403


def test_foreign_finished_run_cancel_is_denied(tmp_path):
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        seed_run(client.app, "run-b", "user", status="completed")
        login(client, "admin")
        assert client.post("/api/runs/run-b/cancel").status_code == 403


def test_session_put_cannot_claim_foreign_existing_key(tmp_path):
    app, _ = setup(tmp_path)
    body = {"revision": 0, "title": "会话", "data": {}}
    with TestClient(app) as client:
        login(client, "user")
        assert client.put("/api/workspace/sessions/s1", json=body).status_code == 200
        login(client, "admin")
        assert client.put("/api/workspace/sessions/s1", json={**body, "revision": 1}).status_code == 403


def test_session_delete_rejects_foreign_owner_atomically(tmp_path):
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        login(client, "user")
        assert client.put("/api/workspace/sessions/s2",
                          json={"revision": 0, "title": "会话", "data": {}}).status_code == 200
        login(client, "admin")
        assert client.delete("/api/workspace/sessions/s2").status_code == 403
        login(client, "user")
        assert [row["id"] for row in client.get("/api/workspace/sessions").json()] == ["s2"]
