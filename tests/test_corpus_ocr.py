"""K12: per-corpus OCR config and forced re-import."""

import time

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.knowledge import Knowledge
from src.main import create_app


def app_for(tmp_path):
    settings = Settings(
        _env_file=None,
        corpora_root=tmp_path / "knowledge",
        data_dir=tmp_path / "demo" / "datadb",
        state_dir=tmp_path / "state",
        pdf_ocr_language="eng",
    )
    return create_app(settings, Knowledge(settings.data_dir / "knowledge.sqlite3"))


def wait_job(client, corpus_id, timeout=10.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = next(c["job"] for c in client.get("/api/corpora").json() if c["id"] == corpus_id)
        if job and job["status"] != "running":
            return job
        time.sleep(0.05)
    raise AssertionError("ingest job did not finish")


def test_per_corpus_ocr_config_marks_stale_and_force_clears(tmp_path):
    app = app_for(tmp_path)
    with TestClient(app) as client:
        corpus_id = client.post("/api/corpora", json={"name": "中文库"}).json()["id"]
        client.post(f"/api/corpora/{corpus_id}/files", files={"upload": ("a.md", "# A\n正文", "text/markdown")})

        # Uploaded under the global language (eng); no explicit config yet.
        state = client.get(f"/api/corpora/{corpus_id}/ocr").json()
        assert state["language"] == "eng" and state["stale"] is False
        assert next(c for c in client.get("/api/corpora").json() if c["id"] == corpus_id)["ocr_stale"] is False

        updated = client.put(f"/api/corpora/{corpus_id}/ocr", json={"mode": "auto", "language": "chi_sim+eng"}).json()
        assert updated["stale"] is True and updated["language"] == "chi_sim+eng"
        listed = next(c for c in client.get("/api/corpora").json() if c["id"] == corpus_id)
        assert listed["ocr_stale"] is True

        # Ingest without force is auto-forced while the config is stale.
        job = client.post(f"/api/corpora/{corpus_id}/ingest").json()
        assert job["forced"] is True
        done = wait_job(client, corpus_id)
        assert done["status"] in {"done", "partial"}
        assert client.get(f"/api/corpora/{corpus_id}/ocr").json()["stale"] is False

        # Now unchanged files are skipped again and ingest is not forced.
        job2 = client.post(f"/api/corpora/{corpus_id}/ingest").json()
        assert job2["forced"] is False
        done2 = wait_job(client, corpus_id)
        assert done2["skipped"] >= 1

        assert client.put(f"/api/corpora/{corpus_id}/ocr", json={"mode": "bogus", "language": "eng"}).status_code == 422
        assert client.get("/api/corpora/missing/ocr").status_code == 404
