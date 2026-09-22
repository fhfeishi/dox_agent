"""E MVP: report storage, generation and export (R1, markdown only)."""

import asyncio
from types import SimpleNamespace

from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.knowledge import Document, Knowledge, Page
from src.reports import generate_markdown
from tests.test_app import setup


class FakeModel:
    def __init__(self):
        self.seen = ""

    async def ainvoke(self, messages):
        self.seen = "\n".join(message.content for message in messages)
        return SimpleNamespace(content="# 报告\n\n## 一、总体成果概述\n成果 [1]")


def add_report_doc(store):
    store.put(Document(title="报告", origin="/docs/2021_2025_82030037_赵国光_癫痫.pdf",
                       kind="pdf", parser="mineru", pages=[Page(number=1, text="癫痫致痫网络")],
                       markdown="# 癫痫致痫网络\n正文"))


def test_report_generation_uses_template_and_selected_reports(tmp_path):
    model = FakeModel()
    markdown = asyncio.run(generate_markdown(
        _store(tmp_path), Settings(_env_file=None),
        {"domain": "癫痫", "year_from": 2021, "year_to": 2025, "template_id": "achievements"},
        llm=model))
    assert markdown.startswith("# 报告")
    assert "模板章节" in model.seen and "总体成果概述" in model.seen  # section structure injected
    assert "癫痫致痫网络" in model.seen  # selected report markdown injected


def _store(tmp_path):
    store = Knowledge(tmp_path / "db")
    add_report_doc(store)
    return store


def test_api_report_create_get_and_export(tmp_path, monkeypatch):
    monkeypatch.setattr("src.reports.model_for", lambda settings: FakeModel())
    app, store = setup(tmp_path)
    add_report_doc(store)
    with TestClient(app) as client:
        created = client.post("/api/reports", json={
            "domain": "癫痫", "year_from": 2021, "year_to": 2025, "template_id": "achievements"})
        assert created.status_code == 201
        report_id = created.json()["report_id"]
        assert client.get(f"/api/reports/{report_id}").json()["markdown"].startswith("# 报告")
        exported = client.get(f"/api/reports/{report_id}/export?format=md")
        assert exported.status_code == 200 and exported.text.startswith("# 报告")
        assert client.get(f"/api/reports/{report_id}/export?format=docx").status_code == 422
        assert client.get("/api/reports/missing").status_code == 404
        assert client.post("/api/reports", json={"domain": "x", "year_from": 2025, "year_to": 2020,
                                                 "template_id": "achievements"}).status_code == 422
