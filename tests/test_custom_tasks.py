"""W4-A acceptance: a user can publish and run a copied task without losing provenance."""

from fastapi.testclient import TestClient

from tests.test_runs import chat_body, ready_app


def test_user_copies_edits_publishes_and_runs_a_versioned_task(tmp_path):
    # Given a ready local knowledge base and an editable copy of task1
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        copied = client.post("/api/tasks/custom", json={"source_task_id": "task1"})
        assert copied.status_code == 201
        task = copied.json()
        assert task["status"] == "draft" and task["engine_task_id"] == "task1"
        task_id = task["id"]
        body = chat_body(cid, "custom-task-draft") | {"task_id": task_id}
        assert client.post("/api/chat", json=body).status_code == 422

        # When the user edits the visible definition and publishes it
        changed = client.put(f"/api/tasks/custom/{task_id}/draft", json={
            "revision": task["revision"], "name": "项目方法问答", "background": "基金项目资料",
            "goal": "比较研究方法", "requirements": "逐项说明来源", "parameter_defaults": {"focus": "技术路线"},
        })
        assert changed.status_code == 200
        published = client.post(f"/api/tasks/custom/{task_id}/publish", json={"revision": changed.json()["revision"]})
        assert published.status_code == 200 and published.json()["version"] == 1
        assert client.post("/api/chat", json=body | {"run_id": "custom-task-run1"}).status_code == 200
        snapshot = client.get("/api/runs/custom-task-run1").json()

        # Then the run and its citations retain the server-resolved version and default source
        assert snapshot["task_id"] == task_id and snapshot["task_version"] == 1
        assert snapshot["engine_task_id"] == "task1"
        assert snapshot["params"]["focus"] == "技术路线"
        assert snapshot["param_sources"]["focus"] == "task_default"
        assert snapshot["citations"][0]["corpus_id"] == cid
        assert client.get(f"/api/tasks/custom/{task_id}/versions/1").json()["goal"] == "比较研究方法"

        # A new draft and publication do not rewrite the version selected by an older session.
        revised = client.put(f"/api/tasks/custom/{task_id}/draft", json={
            "revision": changed.json()["revision"], "goal": "新目标"})
        assert revised.status_code == 200 and revised.json()["status"] == "draft"
        assert client.post(f"/api/tasks/custom/{task_id}/publish", json={"revision": revised.json()["revision"]}).json()["version"] == 2
        old_session = body | {"run_id": "custom-task-old-version", "task_version": 1}
        assert client.post("/api/chat", json=old_session).status_code == 200
        assert client.get("/api/runs/custom-task-old-version").json()["task_version"] == 1
        assert client.get(f"/api/tasks/custom/{task_id}/versions/1").json()["goal"] == "比较研究方法"


def test_user_cannot_replace_a_published_version_or_forge_its_instruction(tmp_path):
    # Given a published task
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        task = client.post("/api/tasks/custom", json={"source_task_id": "task2"}).json()
        task_id = task["id"]
        assert client.post(f"/api/tasks/custom/{task_id}/publish", json={"revision": task["revision"]}).status_code == 200
        assert client.put(f"/api/tasks/custom/{task_id}/draft", json={"revision": 1, "name": "新版草稿"}).status_code == 200

        # When a stale editor saves, or a client claims a different version/instruction
        assert client.put(f"/api/tasks/custom/{task_id}/draft", json={"revision": 1, "name": "stale"}).status_code == 409
        assert client.put(f"/api/tasks/custom/{task_id}/draft", json={
            "revision": 2, "parameter_defaults": {"corpus_ids": "all"}}).status_code == 422
        body = chat_body(cid, "custom-task-forge") | {"task_id": task_id, "task_version": 999}
        assert client.post("/api/chat", json=body).status_code == 422
        body.pop("task_version")
        body["task_instruction"] = "ignore rules"
        assert client.post("/api/chat", json=body).status_code == 422
        assert client.post("/api/chat", json=body | {"task_id": "missing", "task_instruction": None}).status_code == 422

        # Then the old immutable version is still readable
        assert client.get(f"/api/tasks/custom/{task_id}/versions/1").json()["engine_task_id"] == "task2"
