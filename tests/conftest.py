"""Existing business journeys run as the administrator, through the real login API."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def authenticated_client(request, tmp_path, monkeypatch):
    if request.node.path.name == "test_auth.py":
        return
    from src.auth import Accounts
    original_init = Accounts.__init__
    monkeypatch.setattr(Accounts, "__init__", lambda self, directory: original_init(self, tmp_path / "users"))
    enter = TestClient.__enter__

    def logged_in(client):
        result = enter(client)
        if hasattr(client.app.state, "accounts"):
            response = client.post("/api/auth/login", json={"username": "admin", "password": "123456"})
            assert response.status_code == 200, response.text
        return result

    monkeypatch.setattr(TestClient, "__enter__", logged_in)
