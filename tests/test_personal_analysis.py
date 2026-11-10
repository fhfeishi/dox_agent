"""Personal-library scope analysis (2026-11-06): stored records only, no model, no system writes."""

import json

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.knowledge import Document, Page
from src.main import create_app
from tests.helpers import put_listed


def login(client, name):
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"username": name, "password": "123456"}).status_code == 200


def target_record(doc_id: str, version: str) -> dict:
    """A completed four-dimension record; evidence carries the document version it belongs to."""
    def item(item_id, name, quote, **extra):
        return {"id": item_id, "name": name, "desc": "", "evidence": [
            {"quote": quote, "page": 1, "locator": {"page": 1}, "version": version}], **extra}

    return {
        "doc_id": doc_id,
        "version": version,
        "schema_version": 2,
        "prompt_version": 2,
        "process": {"status": "已完成", "coverage": {"processed": 1, "total": 1}},
        "facets": [
            {"key": "场景", "state": "has", "items": [item("s1", "临床诊疗", "临床诊疗场景")]},
            {"key": "问题", "state": "has", "items": [item("p1", "识别困难", "病灶识别困难")]},
            {"key": "技术", "state": "has", "items": [item("t1", "深度学习", "采用深度学习")]},
            {"key": "成果", "state": "has", "items": [item("o1", "原型系统", "形成原型系统", status="已取得")]},
        ],
        "relations": [],
        "outputs": [],
        "events": [],
    }


def test_analysis_reads_existing_records_within_the_library_scope(tmp_path):
    app = create_app(Settings(_env_file=None, state_dir=tmp_path / "state", corpora_root=tmp_path / "corpora",
                              user_dir=tmp_path / "usr"))
    body = ("---\nratifyNo: 62173001\nprojectName: 示例项目\nsupportNum: 50\n---\n\n"
            "# 国家自然科学基金报告\n\n总经费：50（万元）\n\n"
            "临床诊疗场景存在病灶识别困难，项目采用深度学习并形成原型系统。")
    with TestClient(app) as client:
        login(client, "admin")
        corpus = client.post("/api/corpora", json={"name": "自然科学基金-测试"}).json()
        store = app.state.corpus_ctx.knowledge_for(app.state.corpus_ctx.find_corpus(corpus["id"]))
        saved = put_listed(store, Document(
            title="示例报告", origin="2021_2024_62173001_张三_示例报告.md", kind="text", parser="markdown",
            pages=[Page(number=1, text=body)], markdown=body))
        info = app.state.corpus_ctx.find_corpus(corpus["id"])
        (info.root / "target").mkdir(parents=True, exist_ok=True)
        (info.root / "target" / f"{saved['doc_id']}.json").write_text(
            json.dumps(target_record(saved["doc_id"], saved["version"]), ensure_ascii=False), encoding="utf-8")

        login(client, "user")
        created = client.post("/api/personal-libraries", json={
            "name": "课题资料", "task_id": "task3",
            "refs": [{"corpus_id": corpus["id"], "doc_id": saved["doc_id"], "title": "示例报告"}]})
        assert created.status_code == 201, created.text
        library = created.json()
        assert library["task_id"] == "task3" and library["task_version"] == 0

        response = client.get(f"/api/personal-libraries/{library['id']}/analysis")
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["task_id"] == "task3"
        assert result["counts"] == {"projects": 1, "pending_identity": 0, "documents": 1, "corpora": 1,
                                    "cross_library_projects": 0, "unreadable": 0}
        assert result["extraction"]["current"] == 1 and result["extraction"]["missing"] == 0
        assert result["sources"] == [{"corpus_id": corpus["id"], "kind": "system", "name": "自然科学基金-测试",
                                      "state": "ready", "documents": 1, "readable": 1}]
        assert result["projects"][0]["number"] == "62173001"
        assert result["projects"][0]["start_year"] == 2021
        assert result["projects"][0]["extracted_files"] == 1
        # The task binding is reusable and versioned: switching to a task with a version that does
        # not exist is refused, and a valid switch is stored and shown by the analysis.
        assert client.patch(f"/api/personal-libraries/{library['id']}", json={
            "revision": library["revision"], "task_id": "task2", "task_version": 3}).status_code == 422
        switched = client.patch(f"/api/personal-libraries/{library['id']}", json={
            "revision": library["revision"], "task_id": "task1", "task_version": 0})
        assert switched.status_code == 200 and switched.json()["task_id"] == "task1"
        assert client.get(f"/api/personal-libraries/{library['id']}/analysis").json()["task_id"] == "task1"
        assert result["years"]["labels"] == [2021] and result["years"]["by_year"] == {"2021": 1}
        assert result["funding"]["total_yuan"] == "500000"
        assert result["dimensions"]["技术"]["items"][0] == {
            "name": "深度学习", "project_ids": ["NSFC:62173001"], "count": 1}
        assert result["relations"]["reason"].startswith("范围内只有 1 个项目")
        # The analysis is the owner's only; another account (even an administrator) cannot read it.
        login(client, "admin")
        assert client.get(f"/api/personal-libraries/{library['id']}/analysis").status_code == 404

        # An unknown or unpublished task is refused before anything is saved.
        login(client, "user")
        assert client.post("/api/personal-libraries", json={"name": "坏任务", "task_id": "nope"}).status_code == 422
        assert client.patch(f"/api/personal-libraries/{library['id']}", json={
            "revision": library["revision"], "task_id": "nope"}).status_code == 422


def test_analysis_keeps_a_missing_reference_as_a_gap(tmp_path):
    app = create_app(Settings(_env_file=None, state_dir=tmp_path / "state", corpora_root=tmp_path / "corpora",
                              user_dir=tmp_path / "usr"))
    with TestClient(app) as client:
        login(client, "admin")
        corpus = client.post("/api/corpora", json={"name": "甲库"}).json()
        login(client, "user")
        library = client.post("/api/personal-libraries", json={
            "name": "任务", "refs": [{"corpus_id": corpus["id"], "doc_id": "gone", "title": "已删报告"}]}).json()
        result = client.get(f"/api/personal-libraries/{library['id']}/analysis").json()
        # A reference whose document is gone is not silently dropped; the scope is empty and says so.
        assert result["counts"]["documents"] == 0 and result["counts"]["projects"] == 0
        assert result["sources"][0]["state"] == "partial" and result["sources"][0]["readable"] == 0
        assert result["extraction"]["documents"] == 0
        assert result["years"]["reason"] and result["funding"]["reason"]
