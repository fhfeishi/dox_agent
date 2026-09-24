"""W3-B: minimal Artifact store, reports compatibility, run linkage and DOCX export."""

import io

from docx import Document as DocxDocument
from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.agent.corpora import corpus_id_for
from src.docx_export import markdown_to_docx
from src.knowledge import Document, Knowledge, Page
from src.main import create_app


class FakeGraph:
    def __init__(self, corpus_id):
        self.corpus_id = corpus_id

    async def astream(self, state, **kwargs):
        yield {"event": "sources", "data": [{"doc_id": "d1", "corpus_id": self.corpus_id,
                                             "version": "v1", "title": "报告", "page": 2}]}
        yield {"event": "token", "data": {"text": "回答"}}
        yield {"event": "done", "data": {"ok": True}}


def ready_app(tmp_path):
    root = tmp_path / ".knowledge"
    corpus = root / "fixture"
    corpus.mkdir(parents=True)
    settings = Settings(_env_file=None, corpora_root=root, state_dir=tmp_path)
    store = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings)
    store.put(Document(title="seed", origin="seed", kind="text", parser="text",
                       pages=[Page(number=1, text="正文")]))
    cid = corpus_id_for("fixture")
    return create_app(settings, store, lambda *_: FakeGraph(cid)), cid


def chat_body(cid, run_id):
    return {"run_id": run_id, "session_key": "sess-1", "messages": [{"role": "user", "content": "问题"}],
            "corpus_ids": [cid], "task_id": "task1"}


def run_a_chat(client, cid, run_id):
    assert client.post("/api/chat", json=chat_body(cid, run_id)).status_code == 200


def test_user_can_save_an_answer_as_an_artifact_linked_to_its_run(tmp_path):
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        run_a_chat(client, cid, "chat-run-art-1")
        created = client.post("/api/artifacts", json={
            "type": "answer_snapshot", "run_id": "chat-run-art-1", "title": "癫痫结论",
            "markdown": "# 结论\n\n基于 [1] 的回答", "session_key": "sess-1"})
        assert created.status_code == 201
        artifact_id = created.json()["artifact_id"]
        fetched = client.get(f"/api/artifacts/{artifact_id}").json()
        listing = client.get("/api/artifacts?session_key=sess-1").json()
    assert fetched["type"] == "answer_snapshot" and fetched["status"] == "completed"
    assert fetched["run_id"] == "chat-run-art-1" and fetched["current_version"] == 1
    assert fetched["markdown"].startswith("# 结论")
    # Citations come from the linked run snapshot, not a separate per-artifact store.
    assert fetched["citations"][0]["doc_id"] == "d1" and fetched["citations"][0]["corpus_id"] == cid
    assert artifact_id in {item["artifact_id"] for item in listing}


def test_new_artifact_version_does_not_overwrite_the_old_version(tmp_path):
    app, _ = ready_app(tmp_path)
    with TestClient(app):
        store = app.state.artifacts
        store.create("art-1", type="answer_snapshot", title="v1 标题", markdown="# 第一版")
        store.add_version("art-1", markdown="# 第二版")
        current = store.get("art-1")
        first = store.get_version("art-1", 1)
    assert current["current_version"] == 2 and current["markdown"] == "# 第二版"
    assert first["markdown"] == "# 第一版"


def test_artifact_list_distinguishes_omitted_and_empty_session_filters(tmp_path):
    app, _ = ready_app(tmp_path)
    with TestClient(app) as client:
        app.state.artifacts.create("a-empty", type="answer_snapshot", title="空会话", markdown="# a")
        app.state.artifacts.create("a-s1", type="answer_snapshot", title="会话一", markdown="# b",
                                   session_key="s1")
        global_items = client.get("/api/artifacts").json()
        empty_items = client.get("/api/artifacts?session_key=").json()
        s1_items = client.get("/api/artifacts?session_key=s1").json()
    assert {item["artifact_id"] for item in global_items} >= {"a-empty", "a-s1"}
    assert {item["artifact_id"] for item in empty_items} == {"a-empty"}
    assert {item["artifact_id"] for item in s1_items} == {"a-s1"}


def test_legacy_report_is_readable_as_an_artifact_without_rewriting_it(tmp_path):
    app, _ = ready_app(tmp_path)
    with TestClient(app) as client:
        app.state.reports.save("legacy", {"template_id": "achievements", "domain": "旧领域"},
                               "# 旧报告", session_key="s1", run_id="", corpus_id="")
        listing = client.get("/api/artifacts?session_key=s1").json()
        detail = client.get("/api/artifacts/report:legacy").json()
        still_there = app.state.reports.get("legacy")
    assert any(item["artifact_id"] == "report:legacy" and item["legacy"] for item in listing)
    assert detail["markdown"] == "# 旧报告" and detail["type"] == "report"
    assert detail["run_id"] == "" and detail["corpus_ids"] == []  # "未记录", never inferred
    assert still_there["markdown"] == "# 旧报告"


def test_report_generation_creates_a_linked_artifact(tmp_path, monkeypatch):
    async def fake_generate(knowledge, settings, params, *, llm=None):
        return "# 报告"

    monkeypatch.setattr("src.main.generate_markdown", fake_generate)
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        created = client.post("/api/reports", json={
            "domain": "医疗", "year_from": 2024, "year_to": 2025, "template_id": "comprehensive",
            "corpus_id": cid, "session_key": "sess-1", "run_id": "report-run-art-1",
            "parent_run_id": "intake-run-1"})
        assert created.status_code == 201
        listing = client.get("/api/artifacts?session_key=sess-1").json()
    reports = [item for item in listing if item["type"] == "report" and item["run_id"] == "report-run-art-1"]
    assert len(reports) == 1 and reports[0]["current_version"] == 1
    # The compatible legacy entry is suppressed because the run is already linked by an artifact.
    assert all(item["artifact_id"] != "report:" + created.json()["report_id"] for item in listing)


def test_docx_export_is_real_ooxml_with_headings_and_tables(tmp_path):
    markdown = "# 标题\n\n段落文字\n\n| 名称 | 值 |\n| --- | --- |\n| A | 1 |\n"
    data = markdown_to_docx(markdown)
    assert data[:2] == b"PK"  # real OOXML zip, not HTML
    document = DocxDocument(io.BytesIO(data))
    assert any(paragraph.text == "标题" for paragraph in document.paragraphs)
    assert len(document.tables) == 1 and document.tables[0].rows[0].cells[0].text == "名称"

    app, _ = ready_app(tmp_path)
    with TestClient(app) as client:
        app.state.artifacts.create("art-docx", type="report", title="导出", markdown=markdown)
        exported = client.get("/api/artifacts/art-docx/export?format=docx")
    assert exported.status_code == 200 and exported.content[:2] == b"PK"
    assert "wordprocessingml" in exported.headers["content-type"]


def test_saving_an_artifact_for_an_unknown_run_is_rejected(tmp_path):
    app, _ = ready_app(tmp_path)
    with TestClient(app) as client:
        response = client.post("/api/artifacts", json={
            "type": "answer_snapshot", "run_id": "never-persisted", "markdown": "# x"})
    assert response.status_code == 422
