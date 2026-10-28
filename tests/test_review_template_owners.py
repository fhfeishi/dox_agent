"""Review templates by owner (D-20261028-1): shared ones are everyone's to use and the administrator's to
change; every account keeps its own, which only it sees, changes and uses."""

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.main import create_app


def login(client, name):
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"username": name, "password": "123456"}).status_code == 200


def test_shared_and_personal_review_templates(tmp_path):
    app = create_app(Settings(_env_file=None, state_dir=tmp_path / "state", corpora_root=tmp_path / "corpora",
                              user_dir=tmp_path / "usr"))
    with TestClient(app) as client:
        login(client, "admin")
        builtin = next(r for r in client.get("/api/review/rules").json() if r["id"] == "builtin-formal")
        shared = client.post("/api/review/rules", json={**builtin, "id": "shared-t", "name": "共享模版", "source_kind": "manual"})
        assert shared.status_code == 200 and shared.json()["owner"] == ""

        login(client, "user")
        ids = {r["id"] for r in client.get("/api/review/rules").json()}
        assert {"builtin-formal", "shared-t"} <= ids
        # A shared template is read and used, not changed: copy it to edit.
        assert client.post("/api/review/rules", json={**shared.json(), "name": "改名"}).status_code == 403
        assert client.delete("/api/review/rules/shared-t").status_code == 403
        # The same page works for a user's own template: create, edit, and the server sets the owner.
        mine = client.post("/api/review/rules", json={**builtin, "id": "mine-t", "name": "我的模版", "source_kind": "manual",
                                                       "owner": "someone-else"})
        assert mine.status_code == 200 and mine.json()["owner"] == "user"
        edited = client.post("/api/review/rules", json={**mine.json(), "name": "我的模版二"})
        assert edited.status_code == 200 and edited.json()["version"] == 2 and edited.json()["owner"] == "user"
        assert client.get("/api/review/rules/mine-t/versions/1").status_code == 200

        # Nobody else sees, changes or reviews with it; nor can it become everyone's default.
        for other in ("owner", "admin"):
            login(client, other)
            assert "mine-t" not in {r["id"] for r in client.get("/api/review/rules").json()}
            assert client.get("/api/review/rules/mine-t/versions/1").status_code == 404
            assert client.post("/api/review/rules", json={**mine.json(), "name": "抢改"}).status_code == 404
            assert client.delete("/api/review/rules/mine-t").status_code == 404
        body = "# 项目摘要\n" + "甲" * 300 + "\n# 项目背景\n" + "乙" * 300 + "\n# 项目方案\n" + "丙" * 600
        uploaded = client.post("/api/review/documents", files={"file": ("proposal.md", body.encode())})
        assert uploaded.status_code == 200, uploaded.text
        doc = uploaded.json()
        run = {"document_id": doc["id"], "kind": "formal", "rule_id": "mine-t", "rule_version": 2}
        assert client.post("/api/review/runs", json=run).status_code == 404
        assert client.put("/api/review/applied", json={"kind": "formal", "rule_id": "mine-t"}).status_code == 422
        assert client.put("/api/review/applied", json={"kind": "formal", "rule_id": "shared-t"}).status_code == 200

        login(client, "user")
        assert client.put("/api/review/applied", json={"kind": "formal", "rule_id": "shared-t"}).status_code == 403
        assert client.delete("/api/review/rules/mine-t").status_code == 200
