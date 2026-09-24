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
                       pages=[Page(number=1, text="正文")], markdown="填表日期：2025年\n正文"))
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


def test_report_type_custom_task_records_task_and_template_versions(tmp_path, monkeypatch):
    async def fake_generate(knowledge, settings, params, *, llm=None, template_content=None, task_definition=None):
        return "# 报告"

    monkeypatch.setattr("src.main.generate_markdown", fake_generate)
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        template_id = copy_template(client)
        client.put(f"/api/templates/custom/{template_id}/draft", json={
            "revision": 1, "name": "报告模板", "content": "# 报告\n\n## 一、背景\n", "variables": []})
        client.post(f"/api/templates/custom/{template_id}/publish", json={"revision": 2})

        task = client.post("/api/tasks/custom", json={"source_task_id": "task4"}).json()
        assert task["engine_task_id"] == "task4"
        client.put(f"/api/tasks/custom/{task['id']}/draft", json={
            "revision": 1, "name": "我的报告任务", "goal": "生成报告",
            "report_template_id": template_id, "report_template_version": 1})
        published = client.post(f"/api/tasks/custom/{task['id']}/publish", json={"revision": 2})
        assert published.json()["version"] == 1

        response = client.post("/api/reports", json={
            "domain": "医疗", "year_from": 2024, "year_to": 2025,
            "template_id": template_id, "template_version": 1,
            "corpus_id": cid, "session_key": "s1", "run_id": "report-task-0001",
            "task_id": task["id"], "task_version": 1})
        assert response.status_code == 201
        run = client.get("/api/runs/report-task-0001").json()
        artifact = client.get("/api/artifacts?session_key=s1").json()[0]
    assert run["task_id"] == task["id"] and run["task_version"] == 1 and run["engine_task_id"] == "task4"
    assert artifact["task_id"] == task["id"] and artifact["task_version"] == 1
    assert artifact["template_version"] == 1


def test_user_report_task_bound_to_builtin_template_accepts_version_zero(tmp_path, monkeypatch):
    # Given a published report task bound to the built-in comprehensive template
    async def fake_generate(knowledge, settings, params, *, llm=None, template_content=None, task_definition=None):
        return "# 内置模板报告"

    monkeypatch.setattr("src.main.generate_markdown", fake_generate)
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        task = client.post("/api/tasks/custom", json={"source_task_id": "task4"}).json()
        saved = client.put(f"/api/tasks/custom/{task['id']}/draft", json={
            "revision": task["revision"], "report_template_id": "comprehensive",
            "report_template_version": 0}).json()
        assert client.post(f"/api/tasks/custom/{task['id']}/publish", json={"revision": saved["revision"]}).status_code == 200

        # When the report card sends its fixed built-in version
        response = client.post("/api/reports", json={
            "domain": "医疗", "year_from": 2024, "year_to": 2025,
            "template_id": "comprehensive", "template_version": 0,
            "corpus_id": cid, "session_key": "s1", "run_id": "builtin-bound-report",
            "task_id": task["id"], "task_version": 1})

        # Then the report succeeds and records that built-in version
        assert response.status_code == 201
        assert client.get("/api/runs/builtin-bound-report").json()["params"]["template_version"] == 0
        assert client.post("/api/reports", json={
            "domain": "医疗", "year_from": 2024, "year_to": 2025,
            "template_id": "comprehensive", "template_version": 1,
            "corpus_id": cid, "task_id": task["id"], "task_version": 1}).status_code == 422


def test_user_report_requires_explicit_task_version_and_rejects_parameter_bypass(tmp_path, monkeypatch):
    async def fake_generate(knowledge, settings, params, *, llm=None, template_content=None, task_definition=None):
        assert task_definition["background"] == "只依据资料"
        assert params["task_params"] == {"topic": "医疗"}
        return "# 报告"
    monkeypatch.setattr("src.main.generate_markdown", fake_generate)
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        template_id = copy_template(client)
        client.put(f"/api/templates/custom/{template_id}/draft", json={
            "revision": 1, "content": "# 报告\n\n## 章节\n"})
        client.post(f"/api/templates/custom/{template_id}/publish", json={"revision": 2})
        task = client.post("/api/tasks/custom", json={"source_task_id": "task4"}).json()
        saved = client.put(f"/api/tasks/custom/{task['id']}/draft", json={
            "revision": task["revision"], "goal": "生成", "background": "只依据资料",
            "parameters": [{"key": "topic", "label": "主题", "type": "text", "required": True}],
            "report_template_id": template_id, "report_template_version": 1})
        published = client.post(f"/api/tasks/custom/{task['id']}/publish", json={"revision": saved.json()["revision"]})
        assert published.status_code == 200
        base = {"domain": "医疗", "year_from": 2024, "year_to": 2025,
                "template_id": template_id, "template_version": 1, "corpus_id": cid,
                "session_key": "s1", "task_id": task["id"], "task_params": {"topic": "医疗"}}
        assert client.post("/api/reports", json={**base, "run_id": "report-no-version"}).status_code == 422
        assert client.post("/api/reports", json={**base, "task_version": 1, "run_id": "report-missing-param",
                                                  "task_params": {}}).status_code == 422
        response = client.post("/api/reports", json={**base, "task_version": 1, "run_id": "report-valid"})
        assert response.status_code == 201
        assert response.json()["params"]["task_params"] == {"topic": "医疗"}
        assert client.get("/api/runs/report-valid").json()["params"]["task_params"] == {"topic": "医疗"}
        assert client.get("/api/artifacts?session_key=s1").json()[0]["task_version"] == 1


def test_report_rejects_a_non_report_custom_task(tmp_path):
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        task = client.post("/api/tasks/custom", json={"source_task_id": "task1"}).json()
        client.put(f"/api/tasks/custom/{task['id']}/draft", json={"revision": 1, "name": "问答", "goal": "问答"})
        client.post(f"/api/tasks/custom/{task['id']}/publish", json={"revision": 2})
        response = client.post("/api/reports", json={
            "domain": "医疗", "year_from": 2024, "year_to": 2025, "template_id": "comprehensive",
            "corpus_id": cid, "run_id": "report-wrong-task-1",
            "task_id": task["id"], "task_version": 1})
    assert response.status_code == 422


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


def test_user_copies_custom_template_and_archives_without_changing_version(tmp_path):
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        source = client.post("/api/templates/custom", json={"source_template_id": "comprehensive"}).json()
        saved = client.put(f"/api/templates/custom/{source['id']}/draft", json={
            "revision": source["revision"], "content": "# 副本\n\n## 章节\n"})
        assert saved.status_code == 200
        published = client.post(f"/api/templates/custom/{source['id']}/publish", json={
            "revision": saved.json()["revision"]})
        assert published.status_code == 200

        copied = client.post("/api/templates/custom", json={"source_template_id": source["id"]})
        assert copied.status_code == 201
        assert copied.json()["id"] != source["id"] and copied.json()["version"] == 0
        assert copied.json()["revision"] == 1 and copied.json()["status"] == "draft"
        archived = client.post(f"/api/templates/custom/{source['id']}/archive")
        assert archived.status_code == 200 and archived.json()["archived"] is True
        assert archived.json()["status"] == "published"
        assert client.get(f"/api/templates/custom/{source['id']}/versions/1").status_code == 200
        assert client.put(f"/api/templates/custom/{source['id']}/draft", json={
            "revision": published.json()["revision"], "name": "禁止编辑"}).status_code == 409
        report_task = client.post("/api/tasks/custom", json={"source_task_id": "task4"}).json()
        client.put(f"/api/tasks/custom/{report_task['id']}/draft", json={
            "revision": report_task["revision"], "report_template_id": source["id"],
            "report_template_version": 1})
        assert client.post(f"/api/tasks/custom/{report_task['id']}/publish", json={
            "revision": report_task["revision"] + 1}).status_code == 422
        assert client.post("/api/reports", json={
            "domain": "医疗", "year_from": 2024, "year_to": 2025,
            "template_id": source["id"], "template_version": 1,
            "corpus_id": cid,
            "run_id": "archived-template-report-1"}).status_code == 422
        assert source["id"] not in {item["id"] for item in client.get("/api/templates").json()}
        assert source["id"] in {item["id"] for item in client.get("/api/templates?include_archived=true").json()}
        assert client.post(f"/api/templates/custom/{source['id']}/restore").json()["status"] == "published"


def test_user_archived_template_keeps_published_task_version_runnable(tmp_path, monkeypatch):
    async def fake_generate(knowledge, settings, params, *, llm=None, template_content=None,
                            task_definition=None):
        return "# 固定版本报告"

    monkeypatch.setattr("src.main.generate_markdown", fake_generate)
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        template = client.post("/api/templates/custom", json={"source_template_id": "comprehensive"}).json()
        client.put(f"/api/templates/custom/{template['id']}/draft", json={
            "revision": template["revision"], "content": "# 报告\n\n## 章节\n"})
        client.post(f"/api/templates/custom/{template['id']}/publish", json={"revision": 2})
        task = client.post("/api/tasks/custom", json={"source_task_id": "task4"}).json()
        client.put(f"/api/tasks/custom/{task['id']}/draft", json={
            "revision": task["revision"], "report_template_id": template["id"],
            "report_template_version": 1})
        client.post(f"/api/tasks/custom/{task['id']}/publish", json={"revision": 2})
        client.post(f"/api/templates/custom/{template['id']}/archive")
        response = client.post("/api/reports", json={
            "domain": "医疗", "year_from": 2024, "year_to": 2025,
            "template_id": template["id"], "template_version": 1, "corpus_id": cid,
            "task_id": task["id"], "task_version": 1, "run_id": "archived-fixed-run-1"})
    assert response.status_code == 201


def test_user_cannot_publish_report_task_without_authoritative_template_binding(tmp_path, monkeypatch):
    async def fake_generate(knowledge, settings, params, *, llm=None, template_content=None, task_definition=None):
        return "# 报告"
    monkeypatch.setattr("src.main.generate_markdown", fake_generate)
    app, _ = ready_app(tmp_path)
    with TestClient(app) as client:
        task = client.post("/api/tasks/custom", json={"source_task_id": "task4"}).json()
        missing = client.post(f"/api/tasks/custom/{task['id']}/publish", json={"revision": task["revision"]})
        assert missing.status_code == 422
        built_in = client.post(f"/api/tasks/custom/{task['id']}/publish", json={"revision": task["revision"]})
        assert built_in.status_code == 422

        template = client.post("/api/templates/custom", json={"source_template_id": "comprehensive"}).json()
        client.put(f"/api/templates/custom/{template['id']}/draft", json={
            "revision": template["revision"], "content": "# 报告\n\n## 章节\n"})
        assert client.post(f"/api/templates/custom/{task['id']}/publish", json={
            "revision": task["revision"], "report_template_id": template["id"],
            "report_template_version": 1}).status_code == 422
        client.post(f"/api/templates/custom/{template['id']}/publish", json={"revision": 2})
        saved = client.put(f"/api/tasks/custom/{task['id']}/draft", json={
            "revision": task["revision"], "report_template_id": template["id"],
            "report_template_version": 1})
        assert client.post(f"/api/tasks/custom/{task['id']}/publish", json={
            "revision": saved.json()["revision"]}).status_code == 200
