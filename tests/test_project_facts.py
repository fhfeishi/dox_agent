"""Project identity and funding facts (2026-11-09): evidence-backed, no computation."""

import asyncio
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from src import project_facts
from src.agent.config import Settings
from src.knowledge import Document, Page
from src.main import create_app
from tests.helpers import put_listed

BODY = """---
ratifyNo: 62173001
projectName: 示例项目
supportNum: 200
---

# 国家自然科学基金

项目名称：示例项目
批准号：62173001
负责人：张三
依托单位：示例大学
执行年限：2021.01-2025.12
项目总经费：297.0000（万元）
批准资助金额：200（万元）
直接费用：150（万元）
"""


class FactModel:
    def __init__(self, payload=None):
        self.payload = payload or {
            "project": {
                "name": {"value": "示例项目", "quote": "项目名称：示例项目", "confidence": "high"},
                "number": {"value": "62173001", "quote": "批准号：62173001", "confidence": "high"},
                "scheme": {"value": "NSFC", "quote": "国家自然科学基金", "confidence": "high"},
                "lead_unit": {"value": "示例大学", "quote": "依托单位：示例大学", "confidence": "high"},
                "pi": {"value": "张三", "quote": "负责人：张三", "confidence": "high"},
                "start": {"value": "2021-01", "quote": "执行年限：2021.01-2025.12", "confidence": "high"},
                "end": {"value": "2025-12", "quote": "执行年限：2021.01-2025.12", "confidence": "high"},
            },
            "funding": [
                {"term": "total", "term_raw": "项目总经费", "amount": "297.0000", "unit": "万元",
                 "currency": "CNY", "quote": "项目总经费：297.0000（万元）", "confidence": "high"},
                {"term": "awarded", "term_raw": "批准资助金额", "amount": "200", "unit": "万元",
                 "quote": "批准资助金额：200（万元）", "confidence": "high"},
                {"term": "direct", "term_raw": "直接费用", "amount": "150", "unit": "万元",
                 "quote": "直接费用：150（万元）", "confidence": "high"},
            ],
        }

    async def ainvoke(self, messages):
        return SimpleNamespace(content=json.dumps(self.payload, ensure_ascii=False))


def ready(tmp_path):
    app = create_app(Settings(_env_file=None, state_dir=tmp_path / "state", corpora_root=tmp_path / "corpora",
                              user_dir=tmp_path / "usr"))
    client = TestClient(app)
    client.__enter__()
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"username": "admin", "password": "123456"}).status_code == 200
    corpus = client.post("/api/corpora", json={"name": "自然科学基金-测试"}).json()
    info = app.state.corpus_ctx.find_corpus(corpus["id"])
    store = app.state.corpus_ctx.knowledge_for(info)
    saved = put_listed(store, Document(title="示例报告", origin="2021_2024_62173001_张三_示例报告.md",
                                       kind="text", parser="markdown", pages=[Page(number=1, text=BODY)],
                                       markdown=BODY))
    return app, client, info, store, saved


def test_facts_are_written_into_the_archive_record(tmp_path):
    app, client, info, store, saved = ready(tmp_path)
    try:
        metadata = asyncio.run(project_facts.extract_facts(info, store, app.state.settings, saved["doc_id"],
                                                           llm=FactModel()))
        assert metadata["status"] == "completed"
        assert metadata["project"]["identity"] == "NSFC:62173001"
        assert metadata["project"]["project_name"]["value"] == "示例项目"
        assert metadata["project"]["start_date"]["precision"] == "month"
        assert [item["term"] for item in metadata["funding"]] == ["total", "awarded", "direct"]
        record = json.loads((info.root / "archive" / f"{saved['doc_id']}.json").read_text(encoding="utf-8"))
        assert record["metadata"]["status"] == "completed"
        assert record["metadata"]["funding"][0]["amount"] == "297.0000"
        # A fixture document is published through a virtual rel, so the record keeps that rel as-is.
        assert record["source"]["rel"] and record["source"]["kind"] == "text"
        assert record["parse"]["text_sha256"]
        assert record["versions"]["metadata_dictionary"] == 1
        # No four-dim extraction was written by this stage.
        assert not record.get("extraction") or not record["extraction"].get("facets")
    finally:
        client.__exit__(None, None, None)


def test_facts_endpoint_runs_as_a_job_and_refuses_bad_quotes(tmp_path, monkeypatch):
    app, client, info, store, saved = ready(tmp_path)
    monkeypatch.setattr(project_facts, "model_for", lambda settings: FactModel())
    try:
        response = client.post(f"/api/corpora/{info.id}/facts", json={"doc_ids": [saved["doc_id"]]})
        assert response.status_code == 202, response.text
        job_id = response.json()["job_id"]
        for _ in range(100):
            job = client.get(f"/api/corpora/{info.id}/facts/jobs/{job_id}").json()
            if job["status"] != "running":
                break
            import time
            time.sleep(0.05)
        assert job["status"] == "done" and job["completed"] == 1, job
        detail = client.get(f"/api/corpora/{info.id}/reports/{saved['doc_id']}/target")
        # Facts exist even before four-dim extraction; the detail returns them with an empty facets list.
        assert detail.status_code == 200, detail.text
        body = detail.json()
        assert body["facets"] == [] and body["metadata"]["status"] == "completed"
        assert body["lifecycle"]["state"] == "待核对"

        bad = FactModel({"project": {"name": {"value": "示例项目", "quote": "不存在的引文"}}, "funding": []})
        monkeypatch.setattr(project_facts, "model_for", lambda settings: bad)
        result = asyncio.run(project_facts.extract_facts(info, store, app.state.settings, saved["doc_id"],
                                                         force=True, llm=bad))
        assert result["status"] in ("partial", "failed")
        assert result["rejected"][0]["field"] == "project_name"
    finally:
        client.__exit__(None, None, None)
