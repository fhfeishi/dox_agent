"""W7 contract: published task keeps an immutable declarative Skill after later edits."""

from fastapi.testclient import TestClient

from tests.test_runs import chat_body, ready_app


def test_prompt_skill_task_version_and_validation(tmp_path):
    app, cid = ready_app(tmp_path)
    with TestClient(app) as client:
        builtin = client.get("/api/prompt-skills").json()[0]
        assert builtin["builtin"] and builtin["version"] == 0
        assert client.put(f"/api/prompt-skills/{builtin['id']}/draft", json={"revision": 0, "body": "override"}).status_code == 404

        prompt = client.post("/api/prompt-skills", json={"kind": "prompt", "source_id": builtin["id"]}).json()
        prompt = client.put(f"/api/prompt-skills/{prompt['id']}/draft", json={
            "revision": 1, "body": "研究主题：{{topic}}", "variables": ["other"]}).json()
        assert client.post(f"/api/prompt-skills/{prompt['id']}/publish", json={"revision": prompt["revision"]}).status_code == 422
        prompt = client.put(f"/api/prompt-skills/{prompt['id']}/draft", json={
            "revision": prompt["revision"], "variables": ["topic"]}).json()
        assert client.post(f"/api/prompt-skills/{prompt['id']}/publish", json={"revision": prompt["revision"]}).json()["version"] == 1
        assert client.get(f"/api/prompt-skills/{prompt['id']}/versions/1").json()["body"] == "研究主题：{{topic}}"

        skill = client.post("/api/prompt-skills", json={"kind": "skill"}).json()
        skill = client.put(f"/api/prompt-skills/{skill['id']}/draft", json={
            "revision": 1, "name": "主题分析", "purpose": "分析指定主题", "rules": "先检索后回答",
            "output_contract": "结论与引用", "inputs": ["topic"], "prompt_id": prompt["id"],
            "prompt_version": 1, "tools": ["shell"], "resource_policy": "local_only"}).json()
        assert client.post(f"/api/prompt-skills/{skill['id']}/publish", json={"revision": skill["revision"]}).status_code == 422
        skill = client.put(f"/api/prompt-skills/{skill['id']}/draft", json={
            "revision": skill["revision"], "tools": ["knowledge_search"]}).json()
        enabled = client.post(f"/api/prompt-skills/{skill['id']}/publish", json={"revision": skill["revision"]})
        assert enabled.status_code == 200 and enabled.json()["version"] == 1
        preview = client.post(f"/api/prompt-skills/{skill['id']}/test", json={"inputs": {"topic": "材料"}}).json()
        assert "研究主题：材料" in preview["rendered_prompt"] and preview["model_executed"] is False
        assert client.post(f"/api/prompt-skills/{skill['id']}/test", json={"inputs": {}}).status_code == 422

        task = client.post("/api/tasks/custom", json={"source_task_id": "task1"}).json()
        task = client.put(f"/api/tasks/custom/{task['id']}/draft", json={
            "revision": task["revision"], "skill_id": skill["id"], "skill_version": 1}).json()
        assert client.post(f"/api/tasks/custom/{task['id']}/publish", json={"revision": task["revision"]}).status_code == 422
        task = client.put(f"/api/tasks/custom/{task['id']}/draft", json={
            "revision": task["revision"], "parameter_defaults": {"topic": "材料"}}).json()
        published = client.post(f"/api/tasks/custom/{task['id']}/publish", json={"revision": task["revision"]}).json()
        assert published["version"] == 1
        assert published["skill_snapshot"]["prompt"]["body"] == "研究主题：{{topic}}"
        run = client.post("/api/chat", json=chat_body(cid, "skill-run-1") |
                          {"task_id": task["id"], "task_version": 1})
        assert run.status_code == 200
        run_snapshot = client.get("/api/runs/skill-run-1").json()
        assert run_snapshot["task_version"] == 1
        assert run_snapshot["skill_id"] == skill["id"] and run_snapshot["skill_version"] == 1
        assert task["id"] in next(item for item in client.get("/api/prompt-skills").json() if item["id"] == skill["id"])["referenced_by"]

        client.post(f"/api/prompt-skills/{skill['id']}/archive")
        assert client.get(f"/api/tasks/custom/{task['id']}/versions/1").json()["skill_snapshot"]["skill"]["version"] == 1
        assert client.post("/api/chat", json=chat_body(cid, "skill-run-2") |
                           {"task_id": task["id"], "task_version": 1}).status_code == 200
