"""W4-B: custom output templates — draft/publish, variable validation and report binding."""

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.agent.corpora import corpus_id_for
from src.knowledge import Document, Knowledge, Page
from src.main import create_app


class QuietGraph:
    async def astream(self, state, **kwargs):
        yield {"event": "done", "data": {"ok": True}}


def ready_app(tmp_path):
    root = tmp_path / ".knowledge"
    corpus = root / "fixture"
    corpus.mkdir(parents=True)
    settings = Settings(_env_file=None, corpora_root=root, state_dir=tmp_path)
    store = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings)
    store.put(Document(title="seed", origin="seed", kind="text", parser="text",
                       pages=[Page(number=1, text="正文")]))
    return create_app(settings, store, lambda *_: QuietGraph()), corpus_id_for("fixture")


def copy_template(client, source="comprehensive"):
    created = client.post("/api/templates/custom", json={"source_template_id": source})
    assert created.status_code == 201
    return created.json()["id"]


def test_custom_template_draft_publish_and_report_binding(tmp_path, monkeypatch):
    captured: dict = {}

    async def fake_generate(knowledge, settings, params, *, llm=None, template_content=None):
        captured["template_content"] = template_content
        captured["params"] = params
        return "# 自定义报告"

    monkeypatch.setattr("src.main.generate_markdown", fake_generate)
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        template_id = copy_template(client)
        draft = client.put(f"/api/templates/custom/{template_id}/draft", json={
            "revision": 1, "name": "我的报告模板",
            "content": "# 报告\n\n领域：{{domain}}\n\n## 一、背景\n", "variables": ["domain"]})
        assert draft.status_code == 200
        published = client.post(f"/api/templates/custom/{template_id}/publish",
                                json={"revision": draft.json()["revision"]})
        assert published.status_code == 200 and published.json()["version"] == 1

        response = client.post("/api/reports", json={
            "domain": "医疗", "year_from": 2024, "year_to": 2025,
            "template_id": template_id, "template_version": 1,
            "corpus_id": cid, "session_key": "s1", "run_id": "report-custom-0001"})
        assert response.status_code == 201
        artifact = client.get("/api/artifacts?session_key=s1").json()[0]
        listed = client.get("/api/templates").json()

    assert captured["template_content"].startswith("# 报告")
    assert "医疗" in captured["template_content"]  # declared variable substituted from report params
    assert captured["params"]["template_version"] == 1
    assert artifact["template_id"] == template_id and artifact["template_version"] == 1
    assert any(item["id"] == template_id and item["kind"] == "custom" for item in listed)


def test_custom_template_rejects_undeclared_or_unused_variables(tmp_path):
    app, _ = ready_app(tmp_path)
    with TestClient(app) as client:
        template_id = copy_template(client)
        undeclared = client.put(f"/api/templates/custom/{template_id}/draft", json={
            "revision": 1, "content": "# 报告\n\n{{secret}}\n", "variables": []})
        unused = client.put(f"/api/templates/custom/{template_id}/draft", json={
            "revision": 1, "content": "# 报告\n\n## 一、背景\n", "variables": ["domain"]})
        no_heading = client.put(f"/api/templates/custom/{template_id}/draft", json={
            "revision": 1, "content": "只有段落，没有章节", "variables": []})
    assert undeclared.status_code == 422 and "未声明" in undeclared.json()["detail"]
    assert unused.status_code == 422 and "未使用" in unused.json()["detail"]
    assert no_heading.status_code == 422


def test_report_rejects_unpublished_custom_template(tmp_path):
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        template_id = copy_template(client)  # copied but never published
        response = client.post("/api/reports", json={
            "domain": "医疗", "year_from": 2024, "year_to": 2025, "template_id": template_id,
            "corpus_id": cid, "run_id": "report-unpublished-1"})
    assert response.status_code == 422


def test_custom_template_versions_are_immutable(tmp_path):
    app, _ = ready_app(tmp_path)
    with TestClient(app):
        store = app.state.custom_templates
        template_id = store.copy_builtin("achievements")["id"]
        store.save_draft(template_id, 1, {"content": "# A\n\n## 一、背景\n", "name": "v1"})
        assert store.publish(template_id, 2)["version"] == 1
        store.save_draft(template_id, 2, {"content": "# B\n\n## 一、背景\n", "name": "v2"})
        assert store.publish(template_id, 3)["version"] == 2
        first = store.version(template_id, 1)
        latest = store.version(template_id)
    assert first["content"].startswith("# A") and first["name"] == "v1"
    assert latest["content"].startswith("# B") and latest["version"] == 2
