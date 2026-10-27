"""Personal libraries (D-20261027-1): references to system-library documents, each account's own."""

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.main import create_app


def login(client, name):
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"username": name, "password": "123456"}).status_code == 200


def test_a_personal_library_keeps_references_and_belongs_to_its_owner(tmp_path):
    app = create_app(Settings(_env_file=None, state_dir=tmp_path / "state", corpora_root=tmp_path / "corpora",
                              user_dir=tmp_path / "usr"))
    with TestClient(app) as client:
        login(client, "admin")
        a = client.post("/api/corpora", json={"name": "甲库"}).json()["id"]
        b = client.post("/api/corpora", json={"name": "乙库"}).json()["id"]

        login(client, "user")
        created = client.post("/api/personal-libraries", json={
            "name": " 课题资料 ", "refs": [{"corpus_id": a, "doc_id": "d1", "title": "报告一"},
                                       {"corpus_id": a, "doc_id": "d1", "title": "重复"}]})
        assert created.status_code == 201
        library = created.json()
        assert library["name"] == "课题资料" and [r["doc_id"] for r in library["refs"]] == ["d1"]  # each document once
        assert library["corpus_ids"] == [a] and library["refs"][0]["library_missing"] is False
        # Only existing system libraries can be referenced.
        assert client.post("/api/personal-libraries", json={"name": "x", "refs": [{"corpus_id": "none", "doc_id": "d"}]}).status_code == 422

        changed = client.patch(f"/api/personal-libraries/{library['id']}", json={
            "revision": library["revision"], "name": "课题", "add": [{"corpus_id": b, "doc_id": "d2", "title": "报告二"}],
            "remove": [{"corpus_id": a, "doc_id": "d1"}]})
        assert changed.status_code == 200
        assert [(r["corpus_id"], r["doc_id"]) for r in changed.json()["refs"]] == [(b, "d2")]
        assert changed.json()["name"] == "课题"
        # A stale revision is refused rather than overwriting a change made elsewhere.
        assert client.patch(f"/api/personal-libraries/{library['id']}", json={"revision": library["revision"], "name": "旧"}).status_code == 409
        listed = client.get("/api/personal-libraries").json()
        assert [(item["name"], item["count"], item["corpus_ids"]) for item in listed] == [("课题", 1, [b])]

        # Another account, even an administrator, neither sees nor changes it.
        for other in ("owner", "admin"):
            login(client, other)
            assert client.get("/api/personal-libraries").json() == []
            assert client.get(f"/api/personal-libraries/{library['id']}").status_code == 404
            assert client.delete(f"/api/personal-libraries/{library['id']}").status_code == 404

        # A system library that disappears leaves its references marked, not silently dropped.
        login(client, "admin")
        assert client.delete(f"/api/corpora/{b}", params={"purge_source": True}).status_code == 200
        login(client, "user")
        read = client.get(f"/api/personal-libraries/{library['id']}").json()
        assert read["refs"][0]["library_missing"] is True and read["refs"][0]["title"] == "报告二"
        assert client.delete(f"/api/personal-libraries/{library['id']}").status_code == 200
        assert client.get("/api/personal-libraries").json() == []
