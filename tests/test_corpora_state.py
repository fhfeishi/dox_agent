"""K0 (app-level session DB) and K0b (corpus-scoped read/file); §10 layout."""

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.agent.corpora import rewrite_origins, scan_corpora
from src.knowledge import Document, Knowledge, Page
from src.main import create_app, workspace_path
from src.parsers import import_defaults


def settings_for(tmp_path):
    return Settings(_env_file=None, corpora_root=tmp_path / "knowledge",
                    default_corpus="demo", state_dir=tmp_path / "state")


def seed_corpus(tmp_path, name):
    corpus = tmp_path / "knowledge" / name
    source = corpus / "source"
    source.mkdir(parents=True, exist_ok=True)
    raw = source / "报告.md"
    raw.write_text("报告正文", encoding="utf-8")
    store = Knowledge(corpus / "datadb" / "knowledge.sqlite3")
    doc_id = store.put(Document(title="报告", origin=str(raw), kind="text", parser="utf8",
                                pages=[Page(number=1, text="正文")]))["doc_id"]
    return doc_id, raw


def demo_db(tmp_path):
    return tmp_path / "knowledge" / "demo" / "datadb" / "knowledge.sqlite3"


def test_workspace_moves_to_app_level_state_and_migrates_once(tmp_path):
    settings = settings_for(tmp_path)
    db_dir = tmp_path / "knowledge" / "demo" / "datadb"
    db_dir.mkdir(parents=True)
    knowledge = Knowledge(db_dir / "knowledge.sqlite3")
    legacy = db_dir / "workspace.sqlite3"
    legacy.write_text("legacy", encoding="utf-8")

    target = workspace_path(settings, knowledge)
    assert target == tmp_path / "state" / "workspace.sqlite3"
    assert target.read_text(encoding="utf-8") == "legacy"

    legacy.write_text("changed", encoding="utf-8")
    target.write_text("keep", encoding="utf-8")
    assert workspace_path(settings, knowledge).read_text(encoding="utf-8") == "keep"


def test_sessions_live_outside_the_active_corpus(tmp_path):
    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
    with TestClient(app) as client:
        assert client.put("/api/workspace/sessions/s1",
                          json={"title": "会话", "data": {"turns": [], "options": {}}, "revision": 0}).status_code == 200
    assert (tmp_path / "state" / "workspace.sqlite3").is_file()
    assert not (tmp_path / "knowledge" / "demo" / "datadb" / "workspace.sqlite3").exists()


def test_non_default_corpus_read_and_file_require_corpus_param(tmp_path):
    doc_id, raw = seed_corpus(tmp_path, "自然科学基金")
    seed_corpus(tmp_path, "demo")  # a default corpus exists
    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
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
    seed_corpus(tmp_path, "demo")
    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
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
        assert renamed.status_code == 200
        assert renamed.json()["name"] == "改名库" and renamed.json()["id"] == cid
        # KB-5b: the directory itself is renamed (name and dir stay in sync).
        assert (tmp_path / "knowledge" / "改名库").is_dir()
        assert not (tmp_path / "knowledge" / "新库").exists()
        assert client.post("/api/corpora", json={"name": "CON"}).status_code == 422

        assert client.delete(f"/api/corpora/{cid}").status_code == 200
        assert (tmp_path / "knowledge" / "改名库" / "source").is_dir()  # source kept
        assert not (tmp_path / "knowledge" / "改名库" / "datadb").exists()

        first_id = client.get("/api/corpora").json()[0]["id"]
        assert client.delete(f"/api/corpora/{first_id}").status_code == 200


def test_user_corpus_description_persists_and_is_separate_from_the_name(tmp_path):
    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
    with TestClient(app) as client:
        cid = client.post("/api/corpora", json={"name": "说明库"}).json()["id"]
        saved = client.put(f"/api/corpora/{cid}/description", json={"description": "  本地基金资料  "})
        assert saved.status_code == 200 and saved.json()["description"] == "本地基金资料"
        # the directory name stays canonical; the note is extra metadata
        assert saved.json()["name"] == "说明库"
        listed = next(item for item in client.get("/api/corpora").json() if item["id"] == cid)
        assert listed["description"] == "本地基金资料"
        # an empty description clears the field without touching the corpus
        cleared = client.put(f"/api/corpora/{cid}/description", json={"description": ""})
        assert cleared.json()["description"] == ""
        assert client.put("/api/corpora/nope/description", json={"description": "x"}).status_code == 404


def test_user_can_read_builtin_output_templates(tmp_path):
    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
    with TestClient(app) as client:
        items = client.get("/api/templates").json()
        assert {item["id"] for item in items} == {"achievements", "hotspots", "future_directions", "comprehensive"}
        detail = client.get("/api/templates/comprehensive")
        assert detail.status_code == 200
        assert "综合报告" in detail.json()["name"] and detail.json()["content"]
        assert client.get("/api/templates/nope").status_code == 404


def test_corpus_file_upload_list_rename_delete(tmp_path):
    seed_corpus(tmp_path, "demo")
    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
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


def test_empty_directory_listing_is_read_only_and_reports_misplaced_root_files(tmp_path):
    settings = settings_for(tmp_path)
    root = tmp_path / "knowledge" / "empty"
    root.mkdir(parents=True)
    (root / "wrong-place.md").write_text("正文", encoding="utf-8")
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
    with TestClient(app) as client:
        corpus = next(item for item in client.get("/api/corpora").json() if item["name"] == "empty")
        assert not (root / "source").exists()
        listing = client.get(f"/api/corpora/{corpus['id']}/files")
        assert listing.status_code == 200
        assert listing.json()["files"] == []
        assert listing.json()["misplaced_files"] == ["wrong-place.md"]
        assert not (root / "datadb").exists()


def test_explicit_refresh_discovers_external_changes_incrementally(tmp_path):
    import time

    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
    with TestClient(app) as client:
        corpus = client.post("/api/corpora", json={"name": "refresh"}).json()
        source = tmp_path / "knowledge" / "refresh" / "source"
        old_file = source / "old.md"
        old_file.write_text("# old\n原文", encoding="utf-8")

        def refresh_until_done():
            started = client.post(f"/api/corpora/{corpus['id']}/ingest")
            assert started.status_code == 202
            for _ in range(200):
                job = next(item["job"] for item in client.get("/api/corpora").json() if item["id"] == corpus["id"])
                if job and job["status"] != "running":
                    return job
                time.sleep(0.01)
            raise AssertionError("refresh job did not finish")

        first = refresh_until_done()
        assert first["added"] == 1 and first["errors"] == []
        old_doc_id = client.get(f"/api/documents?corpus={corpus['id']}").json()[0]["doc_id"]
        old_file.unlink()
        (source / "new.md").write_text("# new\n新文", encoding="utf-8")
        updated = refresh_until_done()
        docs = client.get(f"/api/documents?corpus={corpus['id']}").json()
        assert updated["added"] == 1 and updated["deleted"] == 1
        assert [doc["title"] for doc in docs] == ["new"]
        assert client.get(f"/api/documents/{old_doc_id}?corpus={corpus['id']}").status_code == 404
        repeated = refresh_until_done()
        assert repeated["added"] == 0 and repeated["updated"] == 0 and repeated["skipped"] == 1


def test_external_directory_rename_is_not_merged_until_explicit_reassociation(tmp_path):
    doc_id, _ = seed_corpus(tmp_path, "旧目录")
    seed_corpus(tmp_path, "demo")
    settings = settings_for(tmp_path)
    scan_corpora(settings)  # The old id must have been observed before an external move.
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
    old_root = tmp_path / "knowledge" / "旧目录"
    new_root = tmp_path / "knowledge" / "外部改名"
    old_root.rename(new_root)

    with TestClient(app) as client:
        corpora = client.get("/api/corpora").json()
        old = next(item for item in corpora if item["rel_path"] == "旧目录")
        new = next(item for item in corpora if item["rel_path"] == "外部改名")
        assert old["missing"] and not new["missing"] and old["id"] != new["id"]

        linked = client.post(f"/api/corpora/{old['id']}/reassociate", json={"directory": "外部改名"})
        assert linked.status_code == 200 and linked.json()["id"] == old["id"]
        assert linked.json()["name"] == "外部改名" and not linked.json()["missing"]
        assert client.get(f"/api/documents/{doc_id}?corpus={old['id']}").json()["text"] == "正文"
        assert client.get(f"/api/documents/{doc_id}/file?corpus={old['id']}").status_code == 200


def test_reassociation_rejects_a_directory_owned_by_another_created_library(tmp_path):
    seed_corpus(tmp_path, "旧目录")
    seed_corpus(tmp_path, "demo")
    settings = settings_for(tmp_path)
    scan_corpora(settings)
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
    (tmp_path / "knowledge" / "旧目录").rename(tmp_path / "knowledge" / "外部改名")

    with TestClient(app) as client:
        old = next(item for item in client.get("/api/corpora").json() if item["rel_path"] == "旧目录")
        client.post("/api/corpora", json={"name": "已占用"})
        conflict = client.post(f"/api/corpora/{old['id']}/reassociate", json={"directory": "已占用"})
        assert conflict.status_code == 409


def test_rename_syncs_directory_and_keeps_doc_identity(tmp_path):
    doc_id, _ = seed_corpus(tmp_path, "旧名")
    seed_corpus(tmp_path, "demo")
    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
    with TestClient(app) as client:
        cid = next(item["id"] for item in client.get("/api/corpora").json() if item["rel_path"] == "旧名")
        renamed = client.patch(f"/api/corpora/{cid}", json={"name": "新名"})
        assert renamed.status_code == 200 and renamed.json()["id"] == cid
        assert (tmp_path / "knowledge" / "新名" / "source" / "报告.md").is_file()
        # origin rewritten, doc id stable, read + /file serve the moved file
        assert client.get(f"/api/documents/{doc_id}?corpus={cid}").json()["text"] == "正文"
        assert client.get(f"/api/documents/{doc_id}/file?corpus={cid}").status_code == 200


def test_rename_rolls_back_directory_and_origins_when_registry_write_fails(tmp_path, monkeypatch):
    import src.main as main

    doc_id, _ = seed_corpus(tmp_path, "旧名")
    seed_corpus(tmp_path, "demo")
    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
    with TestClient(app, raise_server_exceptions=False) as client:
        cid = next(item["id"] for item in client.get("/api/corpora").json() if item["rel_path"] == "旧名")
        monkeypatch.setattr(main, "save_corpus_overrides", lambda *_args: (_ for _ in ()).throw(OSError("disk full")))
        response = client.patch(f"/api/corpora/{cid}", json={"name": "新名"})
        assert response.status_code == 500
        assert (tmp_path / "knowledge" / "旧名" / "source" / "报告.md").is_file()
        assert not (tmp_path / "knowledge" / "新名").exists()
        store = Knowledge(tmp_path / "knowledge" / "旧名" / "datadb" / "knowledge.sqlite3")
        assert store.get(doc_id)["origin"].endswith("旧名/source/报告.md")


def test_reimport_after_corpus_rename_keeps_doc_id(tmp_path):
    corpus = tmp_path / "knowledge" / "旧"
    source = corpus / "source"
    source.mkdir(parents=True)
    (source / "a.txt").write_text("正文", encoding="utf-8")
    settings = Settings(_env_file=None, corpora_root=tmp_path / "knowledge")
    store = Knowledge(corpus / "datadb" / "knowledge.sqlite3")
    doc_id = import_defaults(store, settings, root=source)["imported"][0]["doc_id"]
    # KB-5b rename: move the dir + rewrite file origins (id kept), then force a re-import.
    new = tmp_path / "knowledge" / "新"
    corpus.rename(new)
    rewrite_origins(new / "datadb" / "knowledge.sqlite3", corpus, new, [])
    store = Knowledge(new / "datadb" / "knowledge.sqlite3")  # reopen at the moved path
    import_defaults(store, settings, root=new / "source", parsed_root=new / "parsed", force=True)
    assert len(store.all()) == 1  # T1: no duplicate row
    assert store.all()[0]["doc_id"] == doc_id


def test_missing_corpus_marked_and_chat_409(tmp_path):
    import shutil
    seed_corpus(tmp_path, "demo")
    seed_corpus(tmp_path, "gone")
    settings = settings_for(tmp_path)
    app = create_app(settings, Knowledge(demo_db(tmp_path)))
    with TestClient(app) as client:
        cid = next(item["id"] for item in client.get("/api/corpora").json() if item["rel_path"] == "gone")
    shutil.rmtree(tmp_path / "knowledge" / "gone")  # external removal
    app2 = create_app(settings, Knowledge(demo_db(tmp_path)))
    with TestClient(app2) as client:
        listed = {item["rel_path"]: item for item in client.get("/api/corpora").json()}
        assert listed["gone"]["missing"] is True
        duplicate = client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}],
                                                     "corpus_ids": [cid, cid]})
        assert duplicate.status_code == 422
        missing = client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}], "corpus_id": cid})
        assert missing.status_code == 409 and missing.json()["detail"]["missing"] is True
        unknown = client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}], "corpus_id": "nope"})
        assert unknown.status_code == 404
