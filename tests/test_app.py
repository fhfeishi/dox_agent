from io import BytesIO

import pytest
from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.knowledge import Document, Knowledge, Page
from src.main import create_app


def setup(tmp_path, graph_factory=None):
    root = tmp_path / ".knowledge"
    corpus = root / "fixture"
    (corpus / "source").mkdir(parents=True, exist_ok=True)
    settings = Settings(_env_file=None, corpora_root=root, state_dir=tmp_path)
    store = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings)
    args = {"settings": settings, "knowledge": store}
    if graph_factory:
        args["graph_factory"] = graph_factory
    return create_app(**args), store


def test_user_upload_with_existing_name_preserves_the_source_file(tmp_path):
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        corpus = client.post("/api/corpora", json={"name": "upload-test"}).json()
        source = tmp_path / ".knowledge" / "upload-test" / "source" / "same.md"
        source.write_bytes(b"original")
        before = client.get(f"/api/corpora/{corpus['id']}/files").json()["files"]

        response = client.post(
            f"/api/corpora/{corpus['id']}/files",
            files={"upload": ("same.md", BytesIO(b"replacement"), "text/markdown")},
        )
        after = client.get(f"/api/corpora/{corpus['id']}/files").json()["files"]

    assert response.status_code == 409
    assert response.json()["detail"] == "同名文件已存在，请改名后上传"
    assert source.read_bytes() == b"original"
    assert sorted(path.name for path in source.parent.iterdir()) == ["same.md"]
    assert after == before


def test_user_upload_new_markdown_is_published_and_imported(tmp_path):
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        corpus = client.post("/api/corpora", json={"name": "upload-success"}).json()
        response = client.post(
            f"/api/corpora/{corpus['id']}/files",
            files={"upload": ("new.md", BytesIO(b"# New\n\nBody"), "text/markdown")},
        )
        listing = client.get(f"/api/corpora/{corpus['id']}/files").json()["files"]

    assert response.status_code == 201
    assert response.json()["errors"] == []
    assert response.json()["added"] == 1
    assert any(item["rel_path"] == "new.md" and item["status"] == "indexed" for item in listing), listing


def test_user_upload_over_limit_does_not_publish_partial_source(tmp_path, monkeypatch):
    from src import main

    monkeypatch.setattr(main, "MAX_PREVIEW_BYTES", 4)
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        corpus = client.post("/api/corpora", json={"name": "upload-limit"}).json()
        before = client.get(f"/api/documents?corpus={corpus['id']}").json()
        response = client.post(
            f"/api/corpora/{corpus['id']}/files",
            files={"upload": ("large.md", BytesIO(b"12345"), "text/markdown")},
        )
        after = client.get(f"/api/documents?corpus={corpus['id']}").json()
        source_dir = tmp_path / ".knowledge" / "upload-limit" / "source"

    assert response.status_code == 413
    assert after == before
    assert list(source_dir.iterdir()) == []


def test_user_upload_parse_failure_stays_saved_and_can_be_retried(tmp_path):
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        corpus = client.post("/api/corpora", json={"name": "upload-parse-error"}).json()
        response = client.post(
            f"/api/corpora/{corpus['id']}/files",
            files={"upload": ("broken.txt", BytesIO(b"\xff\xfe\x00broken"), "text/plain")},
        )
        files = client.get(f"/api/corpora/{corpus['id']}/files").json()["files"]

    assert response.status_code == 201
    assert len(response.json()["errors"]) == 1
    assert files == [{"rel_path": "broken.txt", "size": 9, "status": "error", "doc_id": None}]


def test_user_corpus_overview_reports_source_and_index_status_counts(tmp_path):
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        corpus = client.post("/api/corpora", json={"name": "counts"}).json()
        for name, content, media in (("a.md", b"# A", "text/markdown"),
                                     ("b.md", b"# B", "text/markdown"),
                                     ("broken.txt", b"\xff\xfe\x00broken", "text/plain")):
            client.post(f"/api/corpora/{corpus['id']}/files",
                        files={"upload": (name, BytesIO(content), media)})
        # An external drop is discovered by the next read-only list, but is not imported yet.
        (tmp_path / ".knowledge" / "counts" / "source" / "c.md").write_text("# C", encoding="utf-8")
        info = next(item for item in client.get("/api/corpora").json() if item["id"] == corpus["id"])

    assert info["source_count"] == 4
    assert info["indexed_count"] == 2
    assert info["failed_count"] == 1
    assert info["pending_count"] == 1


def test_api_and_validation(tmp_path):
    app, store = setup(tmp_path)
    key = store.put(
        Document(
            title="test", origin="test", kind="text", parser="text", pages=[Page(number=1, text="source")]
        )
    )["doc_id"]
    with TestClient(app) as client:
        assert client.get("/api/health").json()["docs_count"] == 1
        assert client.get("/api/documents/" + key).json()["text"] == "source"
        assert client.get("/api/documents/missing").status_code == 404
        assert (
            client.post("/api/chat", json={"messages": [{"role": "assistant", "content": "x"}]}).status_code
            == 422
        )
        assert client.post("/api/web/confirm/unknown", json={"save_for_run": True}).status_code == 409


def test_document_markdown_endpoint_returns_full_body(tmp_path):
    app, store = setup(tmp_path)
    body = "# 标题\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n"
    key = store.put(
        Document(title="README", origin="README.md", kind="text", parser="markdown",
                 pages=[Page(number=1, text=body)], markdown=body)
    )["doc_id"]
    with TestClient(app) as client:
        payload = client.get(f"/api/documents/{key}/markdown").json()
        assert payload["text"] == body
        assert payload["version"] == store.get(key)["version"]
        assert client.get(f"/api/documents/{key}/markdown?version=stale").status_code == 422
        assert client.get("/api/documents/missing/markdown").status_code == 404


def test_user_pdf_preview_preflight_distinguishes_stale_version_and_missing_source(tmp_path):
    app, store = setup(tmp_path)
    source = tmp_path / ".knowledge" / "preview-test" / "source" / "report.pdf"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"%PDF-1.4\n%%EOF")
    doc = store.put(Document(title="report.pdf", origin=str(source), kind="pdf", parser="test",
                             pages=[Page(number=1, text="page")]))
    doc_id, version = doc["doc_id"], doc["version"]

    with TestClient(app) as client:
        url = f"/api/documents/{doc_id}/file"
        assert client.head(url, params={"version": version}).status_code == 200
        assert client.head(url, params={"version": "old-version"}).status_code == 422
        source.unlink()
        missing = client.head(url, params={"version": version})

    assert missing.status_code == 404


def test_chat_rejects_client_research_state_and_starts_fresh(tmp_path):
    states = []

    class Graph:
        async def astream(self, state, **kwargs):
            assert state["evidence"] == [] and state["searches"] == {}
            assert state["rounds"] == 0 and state["report"] is None and state["blocked"] is None
            states.append(state)
            state["evidence"].append({"old": "server-only"})
            yield {"event": "token", "data": {"text": "answer"}}

    app, store = setup(tmp_path, lambda *args: Graph())
    store.put(Document(title="seed", origin="seed", kind="text", parser="text",
                       pages=[Page(number=1, text="seed")]))
    message = {"role": "user", "content": "问题"}
    with TestClient(app) as client:
        for field in ("evidence", "searches", "report", "previousAttempts", "sources"):
            assert client.post("/api/chat", json={"messages": [message], field: []}).status_code == 422
        assert client.post("/api/chat", json={"messages": [{**message, "sources": []}]}).status_code == 422
        for _ in range(2):
            assert "event: done" in client.post("/api/chat", json={"messages": [message]}).text
    assert states[0] is not states[1]


def test_user_web_previews_are_isolated_and_confirmed_to_an_explicit_destination(tmp_path, monkeypatch):
    from src import main

    async def fake(url, settings):
        return Document(
            title=url.rsplit("/", 1)[-1],
            origin=url,
            kind="web",
            parser="fake",
            pages=[Page(number=1, text="review " + url)],
        )

    monkeypatch.setattr(main, "parse_web", fake)
    app, store = setup(tmp_path)
    with TestClient(app) as client:
        second = client.post("/api/corpora", json={"name": "second"}).json()
        first = client.post("/api/web/preview", json={"url": "https://example.com/one"}).json()
        later = client.post("/api/web/preview", json={"url": "https://example.com/two"}).json()
        assert store.all() == []
        assert client.post("/api/web/confirm/" + first["preview_id"]).status_code == 422
        confirmed = client.post("/api/web/confirm/" + first["preview_id"],
                                json={"target_corpus_id": second["id"]})
        run_only = client.post("/api/web/confirm/" + later["preview_id"], json={"save_for_run": True})
        assert confirmed.status_code == run_only.status_code == 200
        assert store.all() == []
        assert len(client.get(f"/api/documents?corpus={second['id']}").json()) == 1
        assert client.post("/api/web/confirm/" + first["preview_id"],
                           json={"target_corpus_id": second["id"]}).status_code == 409
        snapshot_id = run_only.json()["web_snapshot_id"]
        snapshot = client.get(f"/api/web/snapshots/{snapshot_id}").json()
        assert snapshot["url"] == "https://example.com/two"
        assert snapshot["content_hash"] and snapshot["fetched_at"]

    # Confirmed run snapshots remain readable after the service restarts.
    restarted, _ = setup(tmp_path)
    with TestClient(restarted) as client:
        assert client.get(f"/api/web/snapshots/{snapshot_id}").json()["url"] == "https://example.com/two"


def test_user_searches_allowed_domains_then_confirms_only_selected_results(tmp_path, monkeypatch):
    from pydantic import SecretStr

    from src import main

    # Given explicit search settings and a provider result outside the chosen domain
    calls = []

    async def fake_search(query, domains, time_filter, limit, settings):
        calls.append((query, domains, time_filter, limit))
        return [{"url": "https://papers.example.org/one", "title": "研究一", "description": "摘要"},
                {"url": "https://outside.example/two", "title": "域外", "description": "不可用"}]

    async def fake_page(url, settings):
        return Document(title="研究一", origin=url, kind="web", parser="fake",
                        pages=[Page(number=1, text="确认后的正文")], markdown="确认后的正文")

    monkeypatch.setattr(main, "search_web", fake_search)
    monkeypatch.setattr(main, "parse_web", fake_page)
    root = tmp_path / ".knowledge"
    (root / "fixture" / "source").mkdir(parents=True)
    settings = Settings(_env_file=None, corpora_root=root, state_dir=tmp_path,
                        firecrawl_api_key=SecretStr("offline"))
    class SearchGraph:
        async def astream(self, state, **kwargs):
            source = state["web_snapshots"][0]
            yield {"event": "sources", "data": [{"kind": "web", "snapshot_id": source["web_snapshot_id"],
                "url": source["url"], "fetched_at": source["fetched_at"], "version": source["version"],
                "title": source["title"]}]}
            yield {"event": "token", "data": {"text": "确认后的正文 [1]"}}
            yield {"event": "done", "data": {"ok": True}}

    app = create_app(settings, Knowledge(root / "fixture" / "datadb" / "knowledge.sqlite3", settings=settings),
                     lambda *_: SearchGraph())
    with TestClient(app) as client:
        assert client.post("/api/web/search", json={"query": "研究", "domains": [], "limit": 5}).status_code == 422
        search = client.post("/api/web/search", json={"query": "研究", "domains": ["example.org"],
                                                   "time_filter": "year", "limit": 5}).json()
        assert calls == [("研究", ["example.org"], "year", 5)]
        assert len(search["results"]) == 1
        result_id = search["results"][0]["result_id"]
        assert client.post(f"/api/web/search/{search['search_id']}/preview/unknown").status_code == 404
        preview = client.post(f"/api/web/search/{search['search_id']}/preview/{result_id}").json()
        assert preview["origin"] == "https://papers.example.org/one"
        snapshot_id = client.post(f"/api/web/confirm/{preview['preview_id']}",
                                  json={"save_for_run": True}).json()["web_snapshot_id"]
        snapshot = client.get(f"/api/web/snapshots/{snapshot_id}").json()
        assert snapshot["search_query"] == "研究"
        assert snapshot["search_domains"] == ["example.org"]
        assert snapshot["search_time_filter"] == "year"
        assert snapshot["markdown"] == "确认后的正文"
        assert client.post(f"/api/web/search/{search['search_id']}/preview/{result_id}").status_code == 409
        corpus_id = client.get("/api/corpora").json()[0]["id"]
        answer = client.post("/api/chat", json={"messages": [{"role": "user", "content": "研究结论"}],
                            "corpus_ids": [corpus_id], "web_snapshot_ids": [snapshot_id],
                            "run_id": "search-run-0001"})
        run = client.get("/api/runs/search-run-0001").json()
        assert answer.status_code == 200
        assert run["params"]["web_snapshot_versions"][0]["search_query"] == "研究"
        async def failing_search(*args):
            raise ValueError("搜索服务暂时不可用")

        monkeypatch.setattr(main, "search_web", failing_search)
        failed = client.post("/api/web/search", json={"query": "另一项研究", "domains": ["example.org"]})
        assert failed.status_code == 502
        assert client.get(f"/api/documents?corpus={corpus_id}").json() == []


def test_user_confirmed_web_snapshot_is_bound_to_the_actual_chat_run(tmp_path, monkeypatch):
    # Given a confirmed web snapshot kept outside the knowledge base
    from src import main

    async def fake_page(url, settings):
        return Document(title="网页证据", origin=url, kind="web", parser="fake",
                        pages=[Page(number=1, text="网页事实")], markdown="网页事实")

    class RecordingGraph:
        async def astream(self, state, **kwargs):
            source = state["web_snapshots"][0]
            yield {"event": "sources", "data": [{"citation": 1, "kind": "web",
                "snapshot_id": source["web_snapshot_id"], "url": source["url"],
                "version": source["version"], "title": source["title"]}]}
            yield {"event": "token", "data": {"text": "网页事实 [1]"}}
            yield {"event": "done", "data": {"ok": True}}

    monkeypatch.setattr(main, "parse_web", fake_page)
    app, _ = setup(tmp_path, lambda *_: RecordingGraph())
    with TestClient(app) as client:
        preview = client.post("/api/web/preview", json={"url": "https://example.com/one"}).json()
        snapshot_id = client.post(f"/api/web/confirm/{preview['preview_id']}",
                                  json={"save_for_run": True}).json()["web_snapshot_id"]
        corpus_id = client.get("/api/corpora").json()[0]["id"]

        # When the user explicitly includes that snapshot in a chat run
        response = client.post("/api/chat", json={"messages": [{"role": "user", "content": "网页说了什么"}],
            "corpus_ids": [corpus_id], "web_snapshot_ids": [snapshot_id], "run_id": "web-run-0001"})
        run = client.get("/api/runs/web-run-0001").json()

    # Then the effective resource policy and versioned web source are persisted
    assert response.status_code == 200 and "snapshot_id" in response.text
    assert run["resource_policy"] == "local_plus_urls"
    assert run["params"]["web_snapshot_ids"] == [snapshot_id]
    assert run["citations"][0]["snapshot_id"] == snapshot_id


def test_sse_success_and_failure(tmp_path):
    class Graph:
        async def astream(self, *args, **kwargs):
            yield {"event": "sources", "data": []}
            yield {"event": "token", "data": {"text": "answer"}}

    app, store = setup(tmp_path, lambda *args: Graph())
    store.put(Document(title="seed", origin="seed", kind="text", parser="text",
                       pages=[Page(number=1, text="seed")]))
    payload = {"messages": [{"role": "user", "content": "question"}]}
    with TestClient(app) as client:
        response = client.post("/api/chat", json=payload)
        assert response.text.index("event: sources") < response.text.index("event: token")
        assert "event: done" in response.text

    class Failed:
        async def astream(self, *args, **kwargs):
            raise RuntimeError("private key details")
            yield {}

    app, store = setup(tmp_path, lambda *args: Failed())
    store.put(Document(title="seed", origin="seed", kind="text", parser="text",
                       pages=[Page(number=1, text="seed")]))
    with TestClient(app) as client:
        response = client.post("/api/chat", json=payload)
        assert "event: error" in response.text
        assert "event: done" not in response.text
        assert "private key" not in response.text


def test_preparation_guards_and_lightweight_health(tmp_path, monkeypatch):
    class Graph:
        async def astream(self, state, **kwargs):
            assert state["preparation"] in ("running", "error")
            yield {"event": "token", "data": {"text": "路由按能力决定是否查证"}}

    app, store = setup(tmp_path, lambda *args: Graph())
    with TestClient(app) as client:
        def unexpected_read():
            raise AssertionError("Health must not deserialize the corpus")

        monkeypatch.setattr(store, "all", unexpected_read)
        app.state.preparation = "running"
        health = client.get("/api/health").json()
        assert health["preparation"] == "running"
        assert health["docs_count"] == 0
        payload = {"messages": [{"role": "user", "content": "question"}]}
        response = client.post("/api/chat", json=payload)
        assert response.status_code == 409
        assert "尚无已入库文档" in response.text
        assert client.post("/api/official-docs", json={}).status_code == 409
        assert client.post("/api/ingest/local").status_code == 409
        assert client.post("/api/web/confirm/unknown", json={"save_for_run": True}).status_code == 409
        app.state.preparation = "error"
        assert client.post("/api/chat", json=payload).status_code == 409


@pytest.mark.parametrize("outcome", ["success", "empty", "failure"])
def test_background_preparation(tmp_path, monkeypatch, outcome):
    import asyncio
    import threading
    import time

    from src import main

    store = Knowledge(tmp_path / "db")
    release = threading.Event()

    async def importer(knowledge, sections, progress):
        while not release.is_set():
            await asyncio.sleep(0.01)
        if outcome == "failure":
            raise RuntimeError("private details")
        if outcome == "success":
            knowledge.put(Document(title="Official", origin="test", kind="official", parser="test", pages=[Page(number=1, text="docs")]))

    monkeypatch.setattr(main, "Knowledge", lambda *args, **kwargs: store)
    monkeypatch.setattr(main, "import_official", importer)
    root = tmp_path / ".knowledge"
    (root / "fixture" / "source").mkdir(parents=True)
    app = create_app(settings=Settings(_env_file=None, corpora_root=root, state_dir=tmp_path))
    with TestClient(app) as client:
        try:
            assert client.get("/api/health").json()["preparation"] == "running"
        finally:
            release.set()
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            health = client.get("/api/health").json()
            if health["preparation"] != "running":
                break
            time.sleep(0.01)
        assert health["preparation"] == ("ready" if outcome == "success" else "error")
        assert "private details" not in str(health)


def test_chat_rejects_both_corpus_id_and_corpus_ids(tmp_path):
    # KB-4a: corpus_id and corpus_ids are mutually exclusive and the set is 1-6.
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        both = client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}],
                                              "corpus_id": "a", "corpus_ids": ["a"]})
        assert both.status_code == 422
        empty = client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}], "corpus_ids": []})
        assert empty.status_code == 422


def test_web_run_reports_the_real_corpus_state(tmp_path, monkeypatch):
    # Given a corpus without documents and one snapshot confirmed for this run only
    from src import main

    async def fake_page(url, settings):
        return Document(title="网页证据", origin=url, kind="web", parser="fake",
                        pages=[Page(number=1, text="网页事实")], markdown="网页事实")

    class RecordingGraph:
        async def astream(self, state, **kwargs):
            source = state["web_snapshots"][0]
            yield {"event": "sources", "data": [{"citation": 1, "kind": "web",
                "snapshot_id": source["web_snapshot_id"], "url": source["url"],
                "version": source["version"], "title": source["title"]}]}
            yield {"event": "token", "data": {"text": "网页事实 [1]"}}
            yield {"event": "done", "data": {"ok": True}}

    monkeypatch.setattr(main, "parse_web", fake_page)
    app, store = setup(tmp_path, lambda *_: RecordingGraph())
    with TestClient(app) as client:
        corpus_id = client.get("/api/corpora").json()[0]["id"]
        assert store.all() == []
        preview = client.post("/api/web/preview", json={"url": "https://example.com/one"}).json()
        snapshot_id = client.post(f"/api/web/confirm/{preview['preview_id']}",
                                  json={"save_for_run": True}).json()["web_snapshot_id"]

        # When the run uses that snapshot while the selected corpus has no documents
        response = client.post("/api/chat", json={"messages": [{"role": "user", "content": "网页说了什么"}],
            "corpus_ids": [corpus_id], "web_snapshot_ids": [snapshot_id], "run_id": "web-run-0002"})
        run = client.get("/api/runs/web-run-0002").json()

    # Then the run proceeds without claiming the corpus is ready
    assert response.status_code == 200
    assert run["resource_policy"] == "local_plus_urls"
    assert run["preparation"] != "ready"
    assert run["params"]["web_snapshot_ids"] == [snapshot_id]
