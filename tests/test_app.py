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
    assert len(files) == 1
    assert {key: files[0][key] for key in ("rel_path", "size", "status", "doc_id")} == {
        "rel_path": "broken.txt", "size": 9, "status": "error", "doc_id": None}
    assert "UnicodeDecodeError" in files[0]["reason"]


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


def test_user_extracts_one_target_and_stale_evidence_is_blocked(tmp_path, monkeypatch):
    import json
    import time
    from types import SimpleNamespace

    from src import targets

    class TargetModel:
        async def ainvoke(self, messages):
            response = '''{
              "facets": [
                {"key":"场景","items":[{"id":"s1","name":"临床诊疗","desc":"用于临床诊疗流程。","evidence":[{"quote":"临床诊疗场景"}]}]},
                {"key":"问题","items":[{"id":"p1","name":"识别困难","desc":"解决病灶识别困难。","evidence":[{"quote":"病灶识别困难"}]}]},
                {"key":"技术","items":[{"id":"t1","name":"深度学习","desc":"采用深度学习方法。","evidence":[{"quote":"采用深度学习"}]}]},
                {"key":"成果","items":[{"id":"o1","name":"原型系统","desc":"报告记载已形成原型。","status":"已取得","evidence":[{"quote":"形成原型系统"}]}]}
              ],
              "relations": [
                {"from":{"dimension":"场景","item_id":"s1"},"to":{"dimension":"问题","item_id":"p1"},"basis":"原文明示"},
                {"from":{"dimension":"问题","item_id":"p1"},"to":{"dimension":"技术","item_id":"t1"},"basis":"原文明示"}
              ]
            }'''
            if "预期形成原型系统" in messages[-1].content:
                response = response.replace('"status":"已取得"', '"status":"预期"').replace("已形成原型", "预期形成原型").replace('"name":"临床诊疗"', '"name":"远程医疗"')
            return SimpleNamespace(content=response, response_metadata={})

    monkeypatch.setattr(targets, "model_for", lambda settings: TargetModel())
    app, store = setup(tmp_path)
    from src import main as main_module
    dist = tmp_path / "frontend" / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text("research shell")
    monkeypatch.setattr(main_module, "DOX_AGENT_ROOT", tmp_path)
    body = "# 国家自然科学基金报告\n\n直接费用：100（万元）\n\n临床诊疗场景存在病灶识别困难，项目采用深度学习并形成原型系统。"
    saved = store.put(Document(title="示例报告", origin="2021_2025_P1_张三_report.md", kind="text", parser="markdown",
                               pages=[Page(number=1, text=body)], markdown=body))
    with TestClient(app) as client:
        corpus_id = client.get("/api/corpora").json()[0]["id"]
        page = client.get(f"/library/{corpus_id}/targets/four-facets?scenario=临床诊疗")
        assert page.status_code == 200 and page.text == "research shell"
        assert "no-cache" in page.headers["cache-control"]
        for route in ("/review", "/review/guidelines", "/review/evidence", "/review/runs/example"):
            response = client.get(route)
            assert response.status_code == 200 and response.text == "research shell"
        for missing in ("/api/no-such-api", "/assets/missing.js", "/library/no-such-page"):
            assert client.get(missing).status_code == 404
        started = client.post(f"/api/corpora/{corpus_id}/target", json={"doc_ids": [saved["doc_id"]]})
        assert started.status_code == 202
        job_id = started.json()["job_id"]
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            job = client.get(f"/api/corpora/{corpus_id}/target/jobs/{job_id}").json()
            if job["status"] != "running":
                break
            time.sleep(0.01)

        reports = client.get(f"/api/corpora/{corpus_id}/reports").json()
        detail = client.get(f"/api/corpora/{corpus_id}/reports/{saved['doc_id']}/target")
        assert job["status"] == "done" and job["completed"] == job["total"] == 1
        assert reports[0]["process"]["status"] == "已完成"
        assert all(value["state"] == "has" for value in reports[0]["facets"].values())
        assert reports[0]["facets"]["场景"]["items"][0]["name"] == "临床诊疗"
        assert "evidence" not in reports[0]["facets"]["场景"]["items"][0]
        assert reports[0]["version"] == saved["version"]
        assert detail.status_code == 200
        assert detail.json()["facets"][3]["items"][0]["status"] == "已取得"
        assert detail.json()["relations"][0]["basis"] == "原文明示"
        assert detail.json()["facets"][0]["items"][0]["evidence"][0]["version"] == saved["version"]
        extra = store.put(Document(title="申请摘要", origin="2021_2025_P1_张三_abstract.md",
                                   kind="text", parser="markdown", pages=[Page(number=1, text="国家自然科学基金\n直接费用：120（万元）\n临床诊疗场景存在病灶识别困难，拟采用深度学习并预期形成原型系统。")],
                                   markdown="国家自然科学基金\n直接费用：120（万元）\n临床诊疗场景存在病灶识别困难，拟采用深度学习并预期形成原型系统。"))
        summary = client.get(f"/api/corpora/{corpus_id}/projects").json()
        assert summary["coverage"]["identified_projects"] == 1
        assert len(summary["projects"][0]["files"]) == 2
        assert summary["coverage"]["dimensions"]["场景"]["evidence_projects"] == 1
        assert summary["coverage"]["dimensions"]["场景"]["fully_processed_projects"] == 0
        assert summary["projects"][0]["funding_conflicts"] == ["direct"]
        assert summary["coverage"]["funding"]["direct"]["eligible_projects"] == 0
        second = client.post(f"/api/corpora/{corpus_id}/target", json={"doc_ids": [extra["doc_id"]]}).json()
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            if client.get(f"/api/corpora/{corpus_id}/target/jobs/{second['job_id']}").json()["status"] != "running":
                break
            time.sleep(.01)
        summary = client.get(f"/api/corpora/{corpus_id}/projects").json()
        outcomes = summary["projects"][0]["facets"]["成果"]["items"]
        assert {item["status"] for item in outcomes} == {"预期", "已取得"}
        assert {item["doc_id"] for item in outcomes} == {saved["doc_id"], extra["doc_id"]}
        # G2: every point cites member evidence; achieved and expected never share a point.
        from src import topic_summary

        class SummaryModel:
            fail = False

            async def ainvoke(self, messages):
                if self.fail:
                    return SimpleNamespace(content="not json")
                topic = messages[-1].content.split("主题：")[1].split("；")[0]
                return SimpleNamespace(content=json.dumps({
                    "overview": topic + "场景概述",
                    "common": [{"text": "两份资料都描述原型", "refs": ["E1", "E2"]}],
                    "differences": [{"text": "结题报告记载已形成原型", "refs": ["E1"]},
                                    {"text": "无依据的差异", "refs": ["E9"]}]}, ensure_ascii=False))

        monkeypatch.setattr(topic_summary, "model_for", lambda settings: SummaryModel())
        digest = f"/api/corpora/{corpus_id}/topic-summary"
        assert client.get(digest, params={"dimension": "成果", "name": "原型系统"}).json()["state"] == "missing"
        outcome = client.post(digest, json={"dimension": "成果", "name": "原型系统"}).json()
        assert outcome["common"] == [] and [p["text"] for p in outcome["differences"]] == ["结题报告记载已形成原型"]
        assert len(outcome["gaps"]) == 2 and outcome["representatives"][0]["items"] == 2
        assert {source["status"] for source in outcome["sources"]} == {"已取得", "预期"}
        for scene in ("临床诊疗", "远程医疗"):
            assert client.post(digest, json={"dimension": "场景", "name": scene}).json()["state"] == "ready"
        assert client.post(digest, json={"dimension": "场景", "name": "不存在"}).status_code == 409
        # G1: two files of one project count once per topic; a manual name groups extracted labels.
        assert summary["coverage"]["dimensions"]["技术"]["items"][0]["count"] == 1
        topics = f"/api/corpora/{corpus_id}/topics"
        merged = client.post(topics, json={"dimension": "问题", "names": ["识别困难"], "name": "病灶识别"})
        assert merged.status_code == 200, merged.text
        assert client.post(topics, json={"dimension": "问题", "names": ["识别困难"], "name": "另一名称"}).status_code == 422
        assert client.post(topics, json={"dimension": "技术", "names": ["深度学习"], "name": "病灶识别"}).status_code == 200
        problem = client.get(f"/api/corpora/{corpus_id}/projects").json()["coverage"]["dimensions"]["问题"]["items"]
        assert [(t["name"], t["members"], t["count"]) for t in problem] == [("病灶识别", ["识别困难"], 1)]

        store.put(Document(title="示例报告", origin="2021_2025_P1_张三_report.md", kind="text", parser="markdown",
                           pages=[Page(number=1, text=body + "\n更新")], markdown=body + "\n更新"),
                  doc_id=saved["doc_id"])
        stale = client.get(f"/api/corpora/{corpus_id}/reports/{saved['doc_id']}/target")
        assert stale.status_code == 409
        assert stale.json()["detail"]["stale"] is True
        assert stale.json()["detail"]["message"] == "资料已更新"
        refreshed = next(item for item in client.get(f"/api/corpora/{corpus_id}/reports").json() if item["doc_id"] == saved["doc_id"])
        assert refreshed["stale"] and not refreshed["facets"]["场景"]["items"]
        summary = client.get(f"/api/corpora/{corpus_id}/projects").json()
        assert summary["coverage"]["dimensions"]["场景"]["evidence_projects"] == 1
        assert {item["status"] for item in summary["projects"][0]["facets"]["成果"]["items"]} == {"预期"}
        assert summary["coverage"]["identified_projects"] == 1
        # A changed source does not drop the manual grouping; undo restores the extracted label.
        issue = summary["projects"][0]["facets"]["问题"]["items"][0]
        assert (issue["name"], issue["original_name"]) == ("病灶识别", "识别困难")
        rename = next(m for m in client.get(topics).json()["merges"] if m["dimension"] == "问题")
        assert client.post(f"{topics}/{rename['id']}/undo").status_code == 200
        assert client.post(f"{topics}/{rename['id']}/undo").status_code == 409
        summary = client.get(f"/api/corpora/{corpus_id}/projects").json()
        assert summary["coverage"]["dimensions"]["问题"]["items"][0]["name"] == "识别困难"
        # G2: the report's change made only its own topic stale; failure keeps the readable version.
        assert client.get(digest, params={"dimension": "场景", "name": "临床诊疗"}).json()["state"] == "stale"
        assert client.get(digest, params={"dimension": "场景", "name": "远程医疗"}).json()["state"] == "ready"
        assert client.post(digest, json={"dimension": "场景", "name": "临床诊疗"}).status_code == 409
        SummaryModel.fail = True
        kept = client.post(digest, json={"dimension": "场景", "name": "远程医疗"}).json()
        assert kept["overview"] == "远程医疗场景概述" and kept["update_error"] and kept["state"] == "ready"


        store.record_file("2021_2025_P1_张三_report.md", 0, 0, "", saved["doc_id"], "error", last_error="parse failed")
        summary = client.get(f"/api/corpora/{corpus_id}/projects").json()
        assert summary["coverage"]["identified_projects"] == 1
        assert len(summary["projects"][0]["files"]) == 2
        assert any(item["state"] == "unavailable" for item in summary["projects"][0]["files"])


def test_user_target_extraction_refuses_to_publish_when_the_source_changes(tmp_path, monkeypatch):
    import time
    from types import SimpleNamespace

    from src import targets

    app, store = setup(tmp_path)
    body = "# 报告\n\n临床诊疗场景存在病灶识别困难，项目采用深度学习并形成原型系统。"
    saved = store.put(Document(title="示例报告", origin="2021_2025_P1_张三_report.md", kind="text", parser="markdown",
                               pages=[Page(number=1, text=body)], markdown=body))

    class TargetModel:
        """第一次模型调用期间替换资料：提取器读到的是旧版本，发布前才变。"""

        async def ainvoke(self, messages):
            store.put(Document(title="示例报告", origin="2021_2025_P1_张三_report.md", kind="text", parser="markdown",
                               pages=[Page(number=1, text=body + "\n更新")], markdown=body + "\n更新"),
                      doc_id=saved["doc_id"])
            return SimpleNamespace(content='''{
              "facets": [
                {"key":"场景","items":[{"id":"s1","name":"临床诊疗","desc":"用于临床诊疗流程。","evidence":[{"quote":"临床诊疗场景"}]}]},
                {"key":"问题","items":[]}, {"key":"技术","items":[]}, {"key":"成果","items":[]}
              ]
            }''', response_metadata={})

    monkeypatch.setattr(targets, "model_for", lambda settings: TargetModel())
    with TestClient(app) as client:
        corpus_id = client.get("/api/corpora").json()[0]["id"]
        started = client.post(f"/api/corpora/{corpus_id}/target", json={"doc_ids": [saved["doc_id"]]})
        assert started.status_code == 202
        job_id = started.json()["job_id"]
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            job = client.get(f"/api/corpora/{corpus_id}/target/jobs/{job_id}").json()
            if job["status"] != "running":
                break
            time.sleep(0.01)
        stale = client.get(f"/api/corpora/{corpus_id}/reports/{saved['doc_id']}/target")

    # 期间变化的结果不得发布：任务报“资料已更新”，旧结果也没有落盘。
    assert job["status"] == "error", job
    assert job["errors"] and job["errors"][0]["error"] == "资料已更新", job["errors"]
    assert not (tmp_path / ".knowledge" / "fixture" / "target" / f"{saved['doc_id']}.json").exists()
    assert stale.status_code == 404


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


def test_session_can_be_deleted_and_stays_deleted(tmp_path):
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        saved = client.put("/api/workspace/sessions/s-1", json={"title": "会话", "data": {"turns": []}}).json()
        assert saved["id"] == "s-1"
        assert any(item["id"] == "s-1" for item in client.get("/api/workspace/sessions").json())

        assert client.delete("/api/workspace/sessions/s-1").json()["deleted"] is True
        assert not any(item["id"] == "s-1" for item in client.get("/api/workspace/sessions").json())
        assert client.delete("/api/workspace/sessions/s-1").status_code == 404
        assert client.delete("/api/workspace/notes/s-1").status_code == 404


def test_model_proxy_switch_persists_and_overrides_env(tmp_path, monkeypatch):
    """The settings-panel choice decides whether model clients read the system proxy."""
    from src.agent import models

    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:9")
    app, _ = setup(tmp_path)
    with TestClient(app) as client:
        settings = app.state.settings
        assert client.get("/api/model").json()["proxy"] == {"enabled": False, "source": "env", "address": "http://127.0.0.1:9"}
        assert client.put("/api/model/proxy", json={"enabled": True}).json()["enabled"] is True
    restarted, _ = setup(tmp_path)
    with TestClient(restarted) as client:
        assert client.get("/api/model").json()["proxy"]["source"] == "panel"
    assert models.use_proxy(settings)
