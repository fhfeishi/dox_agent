"""K0 (app-level session DB) and K0b (corpus-scoped read/file)."""

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.knowledge import Document, Knowledge, Page
from src.main import create_app, workspace_path


def settings_for(tmp_path):
    return Settings(
        _env_file=None,
        corpora_root=tmp_path / "knowledge",
        data_dir=tmp_path / "demo" / "datadb",
        state_dir=tmp_path / "state",
    )


def seed_corpus(tmp_path, name="自然科学基金"):
    corpus = tmp_path / "knowledge" / name
    source = corpus / "source"
    source.mkdir(parents=True)
    raw = source / "报告.md"
    raw.write_text("报告正文", encoding="utf-8")
    store = Knowledge(corpus / "datadb" / "knowledge.sqlite3")
    doc_id = store.put(Document(title="报告", origin=str(raw), kind="text", parser="utf8",
                                pages=[Page(number=1, text="正文")]))["doc_id"]
    return doc_id, raw


def test_workspace_moves_to_app_level_state_and_migrates_once(tmp_path):
    settings = settings_for(tmp_path)
    corpus = settings.data_dir
    corpus.mkdir(parents=True)
    knowledge = Knowledge(corpus / "knowledge.sqlite3")
    legacy = corpus / "workspace.sqlite3"
    legacy.write_text("legacy", encoding="utf-8")

    target = workspace_path(settings, knowledge)
    assert target == tmp_path / "state" / "workspace.sqlite3"
    assert target.read_text(encoding="utf-8") == "legacy"

    legacy.write_text("changed", encoding="utf-8")
    target.write_text("keep", encoding="utf-8")
    assert workspace_path(settings, knowledge).read_text(encoding="utf-8") == "keep"


def test_sessions_live_outside_the_active_corpus(tmp_path):
    settings = settings_for(tmp_path)
    store = Knowledge(settings.data_dir / "knowledge.sqlite3")
    app = create_app(settings, store)
    with TestClient(app) as client:
        assert client.put("/api/workspace/sessions/s1",
                          json={"title": "会话", "data": {"turns": [], "options": {}}, "revision": 0}).status_code == 200
    assert (tmp_path / "state" / "workspace.sqlite3").is_file()
    assert not (settings.data_dir / "workspace.sqlite3").exists()


def test_non_default_corpus_read_and_file_require_corpus_param(tmp_path):
    doc_id, raw = seed_corpus(tmp_path)
    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(settings.data_dir / "knowledge.sqlite3"))
    with TestClient(app) as client:
        corpus_id = next(item["id"] for item in client.get("/api/corpora").json() if not item["is_default"])
        listed = client.get(f"/api/documents?corpus={corpus_id}").json()
        assert [item["doc_id"] for item in listed] == [doc_id]
        # Default corpus does not own this doc.
        assert client.get(f"/api/documents/{doc_id}").status_code == 404
        assert client.get(f"/api/documents/{doc_id}/file").status_code == 404
        read = client.get(f"/api/documents/{doc_id}?corpus={corpus_id}")
        assert read.status_code == 200 and read.json()["text"] == "正文"
        file = client.get(f"/api/documents/{doc_id}/file?corpus={corpus_id}")
        assert file.status_code == 200 and file.text == "报告正文"
        from urllib.parse import quote
        header = file.headers["content-disposition"]
        assert header.startswith("inline") and quote(raw.name) in header
        # Unknown corpus is a clear 404, not a silent fallback to the default.
        assert client.get(f"/api/documents/{doc_id}?corpus=missing").status_code == 404
        assert client.get(f"/api/documents/{doc_id}/file?corpus=missing").status_code == 404


def test_corpus_id_is_injective_and_length_bounded():
    from src.agent.corpora import corpus_id_for

    assert corpus_id_for("a b") != corpus_id_for("a-b")
    assert len(corpus_id_for("长" * 200)) <= 120
    assert corpus_id_for("自然科学基金") == corpus_id_for("自然科学基金")


def test_corpus_create_rename_and_delete(tmp_path):
    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(settings.data_dir / "knowledge.sqlite3"))
    with TestClient(app) as client:
        created = client.post("/api/corpora", json={"name": "新库"})
        assert created.status_code == 201
        cid = created.json()["id"]
        assert (tmp_path / "knowledge" / "新库" / "source").is_dir()
        # empty created corpus is visible, and duplicate names are rejected
        assert cid in {item["id"] for item in client.get("/api/corpora").json()}
        assert client.post("/api/corpora", json={"name": "新库"}).status_code == 409
        # names that only differ by separator must not collide
        spaced = client.post("/api/corpora", json={"name": "a b"}).json()
        dashed = client.post("/api/corpora", json={"name": "a-b"}).json()
        assert spaced["id"] != dashed["id"]
        assert client.post("/api/corpora", json={"name": "../escape"}).status_code == 422

        renamed = client.patch(f"/api/corpora/{cid}", json={"name": "改名库"})
        assert renamed.json()["name"] == "改名库" and renamed.json()["id"] == cid
        assert (tmp_path / "knowledge" / "新库").is_dir()  # directory unchanged

        assert client.delete(f"/api/corpora/{cid}").status_code == 200
        assert (tmp_path / "knowledge" / "新库" / "source").is_dir()  # source kept
        assert not (tmp_path / "knowledge" / "新库" / "datadb").exists()

        default_id = next(item["id"] for item in client.get("/api/corpora").json() if item["is_default"])
        assert client.delete(f"/api/corpora/{default_id}").status_code == 409


def test_corpus_file_upload_list_rename_delete(tmp_path):
    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(settings.data_dir / "knowledge.sqlite3"))
    with TestClient(app) as client:
        cid = client.post("/api/corpora", json={"name": "文件库"}).json()["id"]
        uploaded = client.post(f"/api/corpora/{cid}/files",
                               files={"upload": ("报告.md", "# 报告\n正文", "text/markdown")})
        assert uploaded.status_code == 201 and uploaded.json()["added"] == 1

        listing = client.get(f"/api/corpora/{cid}/files").json()["files"]
        assert [item["rel_path"] for item in listing] == ["报告.md"]
        assert listing[0]["status"] == "indexed" and listing[0]["doc_id"]
        assert [doc["title"] for doc in client.get(f"/api/documents?corpus={cid}").json()] == ["报告"]

        assert client.post(f"/api/corpora/{cid}/files",
                           files={"upload": ("bad.exe", b"x", "application/octet-stream")}).status_code == 415

        renamed = client.patch(f"/api/corpora/{cid}/files", json={"rel_path": "报告.md", "new_name": "改名.md"})
        assert renamed.status_code == 200 and renamed.json()["added"] == 1
        assert [item["rel_path"] for item in client.get(f"/api/corpora/{cid}/files").json()["files"]] == ["改名.md"]
        assert [doc["title"] for doc in client.get(f"/api/documents?corpus={cid}").json()] == ["改名"]

        assert client.delete(f"/api/corpora/{cid}/files", params={"rel_path": "改名.md"}).status_code == 200
        assert client.get(f"/api/corpora/{cid}/files").json()["files"] == []
        assert client.get(f"/api/documents?corpus={cid}").json() == []
        assert client.delete(f"/api/corpora/{cid}/files", params={"rel_path": "../escape"}).status_code == 404
