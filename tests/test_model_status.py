"""R4: actual HTTP/storage contracts, with only the upstream model transport controlled."""
import json

import httpx
from fastapi.testclient import TestClient
from pydantic import SecretStr

from src.agent import models
from src.agent.config import Settings
from src.core.db import connect, migrate
from src.main import create_app
from src.review import model_client


def setup(tmp_path, monkeypatch, *, separate=False):
    settings = Settings(_env_file=None, state_dir=tmp_path / "state", user_dir=tmp_path / "users",
                        corpora_root=tmp_path / "corpora", model_base_url="https://main.test/v1",
                        model_name="fixture-main", model_api_key=SecretStr("fixture-main-key"),
                        review_model_base_url="https://review.test/v1" if separate else "",
                        review_model_name="fixture-review" if separate else "",
                        review_model_api_key=SecretStr("fixture-review-key") if separate else None)
    for key in ("REVIEW_MODEL_BASE_URL", "REVIEW_MODEL_NAME", "REVIEW_MODEL_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(model_client, "get_settings", lambda: settings)
    failures = set()

    def provider(request):
        if request.url.host in failures:
            return httpx.Response(401, json={"error": {"message": "rejected " + request.headers.get("Authorization", "")}})
        return httpx.Response(200, json={"model": "fixture", "choices": [{"message": {
            "content": json.dumps({"checks": [], "notes": []})}}], "usage": {"prompt_tokens": 1, "completion_tokens": 1}})

    real = httpx.Client

    def controlled(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(provider)
        return real(*args, **kwargs)

    monkeypatch.setattr(httpx, "Client", controlled)
    return settings, failures


def test_model_state_is_shared_and_recovers_after_failure(tmp_path, monkeypatch):
    settings, failures = setup(tmp_path, monkeypatch)
    from src.workspace import SCHEMA as workspace_schema

    workspace = settings.state_dir / "workspace.sqlite3"
    migrate(workspace, workspace_schema[:1])
    with connect(workspace) as db:
        db.execute("INSERT INTO records VALUES('kept-note','notes',1,?)", ('{"title":"保留的笔记"}',))
    legacy = settings.state_dir / "review/workspace.sqlite3"
    migrate(legacy, ["CREATE TABLE objects(kind TEXT,id TEXT,payload TEXT,updated TEXT,PRIMARY KEY(kind,id))"])
    with connect(legacy) as db:
        db.execute("INSERT INTO objects VALUES('model_connection','old',?,?)", ('{"status":"failed"}', "old"))
    assert models.check_model(settings, source="launcher")["ok"]
    with TestClient(create_app(settings)) as client:
        health = client.get("/api/health").json()
        assert "model_verified" not in health
        initial = health["model_status"]
        assert initial["status"] == "connected" and initial["checked_at"] and initial["latency_ms"] is not None
        assert client.get("/api/review/health").json()["model_status"] == initial
        with connect(workspace, readonly=True) as db:
            assert json.loads(db.execute("SELECT payload FROM records WHERE id='kept-note'").fetchone()[0])["title"] == "保留的笔记"
        with connect(legacy, readonly=True) as db:
            assert db.execute("SELECT COUNT(*) FROM objects WHERE kind='model_connection'").fetchone()[0] == 0

        failures.add("main.test")
        failed = client.post("/api/model/check").json()
        assert failed["ok"] is False
        review = client.get("/api/review/health").json()["model_status"]
        assert review["status"] == "failed" and review["checked_at"] != initial["checked_at"]
        assert "fixture-main-key" not in json.dumps(failed) + json.dumps(review)
        failures.clear()
        assert client.post("/api/model/check").json()["ok"]
        recovered = client.get("/api/review/health").json()["model_status"]
        assert recovered["status"] == "connected" and not recovered["error"]
        assert models.read_model_status(settings) == recovered


def test_review_override_uses_its_own_shared_connection_row(tmp_path, monkeypatch):
    settings, failures = setup(tmp_path, monkeypatch, separate=True)
    assert models.check_model(settings, source="launcher")["ok"]
    with TestClient(create_app(settings)) as client:
        main = client.get("/api/health").json()["model_status"]
        assert client.get("/api/review/health").json()["model_status"]["status"] == "untested"
        tested = client.post("/api/review/model/test")
        assert tested.status_code == 200, tested.text
        assert tested.json()["model_status"]["status"] == "connected"
        assert client.get("/api/health").json()["model_status"] == main
        failures.add("review.test")
        failed = client.post("/api/review/model/test")
        assert failed.status_code == 502 and "fixture-review-key" not in failed.text
        assert client.get("/api/review/health").json()["model_status"]["status"] == "failed"
        assert client.get("/api/health").json()["model_status"] == main
        with connect(settings.state_dir / "workspace.sqlite3", readonly=True) as db:
            assert db.execute("SELECT COUNT(*) FROM model_checks").fetchone()[0] == 2
