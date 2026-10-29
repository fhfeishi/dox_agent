"""Personal libraries (D-20261027-1): references to system-library documents, each account's own."""

import time

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.main import create_app


def login(client, name):
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"username": name, "password": "123456"}).status_code == 200


def settled(client, library_id):
    """The library once its upload queue is empty (failed files stay listed)."""
    for _ in range(200):
        library = client.get(f"/api/personal-libraries/{library_id}").json()
        if all(item["state"] == "failed" for item in library["uploads"]):
            return library
        time.sleep(0.05)
    raise AssertionError(library["uploads"])


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


def test_uploads_belong_to_their_personal_library_and_its_owner(tmp_path):
    """D-20261028-2: a file uploaded to a personal library is parsed under the owner's workspace, can be
    listed and previewed like any library document, is invisible to everyone else, and goes with it."""
    app = create_app(Settings(_env_file=None, state_dir=tmp_path / "state", corpora_root=tmp_path / "corpora",
                              user_dir=tmp_path / "usr"))
    with TestClient(app) as client:
        login(client, "user")
        library = client.post("/api/personal-libraries", json={"name": "我的笔记"}).json()
        url = f"/api/personal-libraries/{library['id']}/files"
        uploaded = client.post(url, files={"upload": ("调研笔记.md", "# 调研笔记\n\n联邦学习在医疗影像中的应用。".encode(), "text/markdown")})
        assert uploaded.status_code == 202 and uploaded.json() == {"name": "调研笔记.md", "state": "queued"}
        # Parsing runs in the background; the file joins the library when it is indexed.
        read = settled(client, library["id"])
        mine = "mine-" + library["id"]
        assert read["uploads"] == []
        assert [(r["corpus_id"], r["title"], r["library_missing"]) for r in read["refs"]] == [(mine, "调研笔记.md", False)]
        body = {"doc_id": read["refs"][0]["doc_id"]}
        source = tmp_path / "usr" / "user" / "workspace" / "libraries" / library["id"] / "source" / "调研笔记.md"
        assert source.is_file()
        listed = client.get("/api/personal-libraries").json()
        assert listed[0]["count"] == 1 and listed[0]["uploads"] == 1

        docs = client.get("/api/documents", params={"corpus": mine})
        assert docs.status_code == 200 and [d["doc_id"] for d in docs.json()] == [body["doc_id"]]
        preview = client.get(f"/api/documents/{body['doc_id']}/file", params={"corpus": mine})
        assert preview.status_code == 200 and "联邦学习" in preview.text
        # Same name again is refused, not replaced; unsupported kinds are refused before saving.
        assert client.post(url, files={"upload": ("调研笔记.md", b"x", "text/markdown")}).status_code == 409
        assert client.post(url, files={"upload": ("a.exe", b"x", "application/octet-stream")}).status_code == 415
        assert client.post(url, files={"upload": ("../逃逸.md", b"# x", "text/markdown")}).json()["name"] == "逃逸.md"
        # A GBK text (common from Chinese Windows tools) is read; an empty one fails, stays listed with
        # its reason and is not parsed again, until the owner removes it.
        assert client.post(url, files={"upload": ("旧笔记.txt", "国产工具保存的笔记".encode("gbk"), "text/plain")}).status_code == 202
        assert client.post(url, files={"upload": ("空白.md", b"   ", "text/markdown")}).status_code == 202
        read = settled(client, library["id"])
        assert [r["title"] for r in read["refs"]] == ["调研笔记.md", "逃逸.md", "旧笔记.txt"]
        assert [(u["name"], u["state"], u["error"]) for u in read["uploads"]] == [("空白.md", "failed", "解析结果为空，未入库")]
        gbk = next(r for r in read["refs"] if r["title"] == "旧笔记.txt")
        assert "国产工具" in client.get(f"/api/documents/{gbk['doc_id']}/file", params={"corpus": mine}).content.decode("gbk")
        assert client.delete(f"{url}/调研笔记.md").status_code == 404  # only a failed file is removed here
        assert client.delete(f"{url}/空白.md").status_code == 200
        assert client.get(f"/api/personal-libraries/{library['id']}").json()["uploads"] == []

        # Another account, administrator included, cannot reach the uploads by their id.
        for other in ("owner", "admin"):
            login(client, other)
            assert client.get("/api/documents", params={"corpus": mine}).status_code == 404
            assert client.get(f"/api/documents/{body['doc_id']}/file", params={"corpus": mine}).status_code == 404
            assert client.post(url, files={"upload": ("b.md", b"# b", "text/markdown")}).status_code == 404
            other_library = client.post("/api/personal-libraries", json={"name": "x"}).json()
            assert client.patch(f"/api/personal-libraries/{other_library['id']}", json={
                "revision": other_library["revision"], "add": [{"corpus_id": mine, "doc_id": body["doc_id"]}]}).status_code == 422

        # The owner may also add the upload to another personal library of their own.
        login(client, "user")
        second = client.post("/api/personal-libraries", json={"name": "汇总", "refs": [{"corpus_id": mine, "doc_id": body["doc_id"], "title": "调研笔记.md"}]})
        assert second.status_code == 201

        # Removing it from the library it was uploaded to deletes the file and the document.
        current = client.get(f"/api/personal-libraries/{library['id']}").json()
        removed = client.patch(f"/api/personal-libraries/{library['id']}", json={
            "revision": current["revision"], "remove": [{"corpus_id": mine, "doc_id": body["doc_id"]}]})
        assert removed.status_code == 200 and [r["title"] for r in removed.json()["refs"]] == ["逃逸.md", "旧笔记.txt"]
        assert not source.exists()
        assert body["doc_id"] not in [d["doc_id"] for d in client.get("/api/documents", params={"corpus": mine}).json()]

        # Deleting the library deletes its upload folder; the other library's reference is then marked gone.
        assert client.delete(f"/api/personal-libraries/{library['id']}").status_code == 200
        assert not source.parent.parent.exists()
        assert client.get(f"/api/personal-libraries/{second.json()['id']}").json()["refs"][0]["library_missing"] is True
