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
        listed = client.get("/api/documents?corpus=自然科学基金").json()
        assert [item["doc_id"] for item in listed] == [doc_id]
        # Default corpus does not own this doc.
        assert client.get(f"/api/documents/{doc_id}").status_code == 404
        assert client.get(f"/api/documents/{doc_id}/file").status_code == 404
        read = client.get(f"/api/documents/{doc_id}?corpus=自然科学基金")
        assert read.status_code == 200 and read.json()["text"] == "正文"
        file = client.get(f"/api/documents/{doc_id}/file?corpus=自然科学基金")
        assert file.status_code == 200 and file.text == "报告正文"
        from urllib.parse import quote
        header = client.get(f"/api/documents/{doc_id}/file?corpus=自然科学基金").headers["content-disposition"]
        assert quote(raw.name) in header
        # Unknown corpus is a clear 404, not a silent fallback to the default.
        assert client.get(f"/api/documents/{doc_id}?corpus=missing").status_code == 404
        assert client.get(f"/api/documents/{doc_id}/file?corpus=missing").status_code == 404
