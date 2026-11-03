"""P0-3 B1: every published document has a manifest entry; manual text and web pages are virtual ones."""
import pytest
from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.agent.corpora import corpus_id_for
from src.knowledge import Document, Knowledge, Page, backfill_virtual_manifest
from src.parsers import import_defaults
from tests.helpers import put_unlisted
from tests.test_app import setup

CID = corpus_id_for("fixture")


def web_page(text: str, url: str = "https://example.com/news") -> Document:
    return Document(title="新闻", origin=url, kind="web", parser="firecrawl",
                    pages=[Page(number=1, text=text)], markdown=text)


def confirm(client, monkeypatch, doc: Document) -> dict:
    async def fake_parse(url, settings):
        return doc
    monkeypatch.setattr("src.api.web.parse_web", fake_parse)
    preview = client.post("/api/web/preview", json={"url": doc.origin})
    assert preview.status_code == 200, preview.text
    response = client.post(f"/api/web/confirm/{preview.json()['preview_id']}", json={"target_corpus_id": CID})
    assert response.status_code == 200, response.text
    return response.json()


def test_confirmed_web_page_stays_current_and_searchable(tmp_path, monkeypatch):
    app, store = setup(tmp_path)
    with TestClient(app) as client:
        first = confirm(client, monkeypatch, web_page("银河 星图 第一版"))
        rel = "web:" + first["doc_id"]
        assert store.files()[rel]["status"] == "indexed"
        assert first["doc_id"] in {doc["doc_id"] for doc in store.current()}
        assert [hit["doc_id"] for hit in store.search("星图")] == [first["doc_id"]]

        changed = confirm(client, monkeypatch, web_page("银河 星图 第二版"))
        assert changed["doc_id"] == first["doc_id"] and changed["version"] != first["version"]
        same = confirm(client, monkeypatch, web_page("银河 星图 第二版"))
        assert same["version"] == changed["version"] and same["changed"] is False
    assert [rel for rel in store.files() if rel.startswith("web:")] == [rel]
    assert store.read_markdown(first["doc_id"]) == "银河 星图 第二版"


def test_manual_text_is_listed_and_current(tmp_path):
    app, store = setup(tmp_path)
    with TestClient(app) as client:
        made = client.post("/api/ingest/text", json={"title": "笔记", "text": "手工 补充"}).json()
    entry = store.files()["manual:" + made["doc_id"]]
    assert (entry["doc_id"], entry["status"], entry["mtime_ns"]) == (made["doc_id"], "indexed", 0)
    assert made["doc_id"] in {doc["doc_id"] for doc in store.current()}


def virtual_and_file(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "a.md").write_text("文件 正文", encoding="utf-8")
    store = Knowledge(tmp_path / "datadb" / "knowledge.sqlite3", source_root=source)
    import_defaults(store, Settings(_env_file=None), root=source)
    web = store.put(web_page("网页 正文"))
    manual = store.put(Document(title="笔记", origin="manual:abc", kind="text", parser="manual",
                                pages=[Page(number=1, text="手工 正文")]))
    return source, store, web, manual


def test_import_prune_keeps_virtual_sources(tmp_path):
    source, store, web, manual = virtual_and_file(tmp_path)
    report = import_defaults(store, Settings(_env_file=None), root=source)
    assert report["deleted"] == 0
    (source / "a.md").unlink()
    report = import_defaults(store, Settings(_env_file=None), root=source)
    assert report["deleted"] == 1
    assert {doc["doc_id"] for doc in store.current()} == {web["doc_id"], manual["doc_id"]}
    assert set(store.files()) == {"web:" + web["doc_id"], "manual:" + manual["doc_id"]}


def test_file_name_with_colon_is_reported_not_indexed(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "manual:x.md").write_text("冒号", encoding="utf-8")
    store = Knowledge(tmp_path / "datadb" / "knowledge.sqlite3", source_root=source)
    report = import_defaults(store, Settings(_env_file=None), root=source)
    assert report["errors"] == [{"source": "manual:x.md", "error": "UnsafeName"}]
    assert store.files() == {} and store.current() == []


def test_counts_exclude_virtual_sources(tmp_path, monkeypatch):
    app, store = setup(tmp_path)
    source = tmp_path / ".knowledge" / "fixture" / "source"
    (source / "a.md").write_text("文件 正文", encoding="utf-8")
    import_defaults(store, Settings(_env_file=None), root=source)
    with TestClient(app) as client:
        confirm(client, monkeypatch, web_page("网页 正文"))
        client.post("/api/ingest/text", json={"title": "笔记", "text": "手工 补充"})
        card = next(item for item in client.get("/api/corpora").json() if item["id"] == CID)
        files = client.get(f"/api/corpora/{CID}/files").json()["files"]
    assert (card["source_count"], card["indexed_count"], card["pending_count"], card["failed_count"],
            card["virtual_count"]) == (1, 3, 0, 0, 2)
    assert [(item["rel_path"], item["status"]) for item in files] == [("a.md", "indexed")]


def test_preview_of_virtual_source_is_404(tmp_path, monkeypatch):
    app, store = setup(tmp_path)
    with TestClient(app) as client:
        web = confirm(client, monkeypatch, web_page("网页 正文"))
        manual = client.post("/api/ingest/text", json={"title": "笔记", "text": "手工"}).json()
        for doc_id in (web["doc_id"], manual["doc_id"]):
            assert client.get(f"/api/documents/{doc_id}/file").status_code == 404
            assert client.head(f"/api/documents/{doc_id}/file").status_code == 404


@pytest.mark.parametrize("origin", ["C:\\a.pdf", "c:/a.pdf", "/abs/a.pdf", "a.pdf", "manual", "web:x", "ftp://h/a"])
def test_windows_drive_and_other_origins_are_not_virtual(tmp_path, origin):
    store = Knowledge(tmp_path / "knowledge.sqlite3")
    with pytest.raises(ValueError, match="本地文件须经清单入库"):
        store.put(Document(title="x", origin=origin, kind="pdf", parser="mineru", pages=[Page(number=1, text="x")]))
    assert store.count() == 0 and store.files() == {}


def test_put_local_origin_without_manifest_is_refused(tmp_path):
    store = Knowledge(tmp_path / "knowledge.sqlite3")
    with pytest.raises(ValueError, match="本地文件须经清单入库"):
        store.put(Document(title="x", origin=str(tmp_path / "a.md"), kind="text", parser="utf8",
                           pages=[Page(number=1, text="x")]))
    assert store.count() == 0


def test_doc_without_manifest_is_not_current(tmp_path):
    # Kept as the unlisted counterexample: a history row written before B1 (direct SQL).
    store = Knowledge(tmp_path / "knowledge.sqlite3")
    with store.connect() as db:
        db.execute("INSERT INTO docs VALUES (?, ?, ?)",
                   ("legacy", "v0", '{"title": "旧", "origin": "/old/a.md", "kind": "text", "parser": "utf8"}'))
        db.execute("INSERT INTO doc_pages VALUES ('legacy', 1, '旧 正文')")
    assert [doc["doc_id"] for doc in store.all()] == ["legacy"]
    assert store.current() == []


def test_backfill_virtual_manifest_is_idempotent_and_reports_local_orphans(tmp_path):
    store = Knowledge(tmp_path / "knowledge.sqlite3")
    web = put_unlisted(store, web_page("网页 正文"))
    manual = put_unlisted(store, Document(title="笔记", origin="manual:old", kind="text", parser="manual",
                                          pages=[Page(number=1, text="手工")], markdown="手工"))
    orphan = put_unlisted(store, Document(title="孤儿", origin="/abs/x.pdf", kind="pdf", parser="mineru",
                                          pages=[Page(number=1, text="本地")]))
    listed = store.put(web_page("另一页", url="http://example.org/b"))
    assert {doc["doc_id"] for doc in store.current()} == {listed["doc_id"]}

    dry = backfill_virtual_manifest(store, apply=False)
    assert dry["applied"] is False and dry["docs"] == 4
    assert {item["rel_path"] for item in dry["virtual"]} == {"web:" + web["doc_id"], "manual:" + manual["doc_id"]}
    assert dry["local_orphans"] == [{"doc_id": orphan["doc_id"], "origin": "/abs/x.pdf"}]
    assert {doc["doc_id"] for doc in store.current()} == {listed["doc_id"]}  # the dry run writes nothing

    applied = backfill_virtual_manifest(store, apply=True)
    assert applied["virtual"] == dry["virtual"]
    assert {doc["doc_id"] for doc in store.current()} == {listed["doc_id"], web["doc_id"], manual["doc_id"]}
    # The backfilled entry is the one put writes now, so republishing the same body changes nothing.
    before = store.files()["web:" + web["doc_id"]]
    store.put(web_page("网页 正文"))
    after = store.files()["web:" + web["doc_id"]]
    assert (before["size"], before["sha256"]) == (after["size"], after["sha256"])

    again = backfill_virtual_manifest(store, apply=True)
    assert again["virtual"] == [] and again["local_orphans"] == dry["local_orphans"]
    assert orphan["doc_id"] not in {doc["doc_id"] for doc in store.current()}
