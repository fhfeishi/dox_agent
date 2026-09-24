"""User saves, revises and restores artifacts through a real local API and built UI.

Only the model graph/report generator are deterministic test doubles. HTTP, SQLite,
session persistence, artifact APIs, and the browser are real. All data is temporary.
"""

import asyncio
import re
import shutil
import socket
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

import uvicorn
from playwright.async_api import async_playwright, expect
from pydantic import SecretStr

import src.main as main_module
from src.agent.config import Settings
from src.agent.corpora import corpus_id_for
from src.knowledge import Document, Knowledge, Page


class OfflineGraph:
    def __init__(self, corpus_id: str, doc_id: str):
        self.corpus_id = corpus_id
        self.doc_id = doc_id

    async def astream(self, state, **kwargs):
        yield {"event": "sources", "data": [{"doc_id": self.doc_id, "corpus_id": self.corpus_id,
                                             "version": "v1", "title": "样本", "page": 1}]}
        yield {"event": "token", "data": {"text": "离线回答 [1]"}}
        yield {"event": "done", "data": {"ok": True}}


async def offline_report(knowledge, settings, params, *, llm=None, template_content=None, task_definition=None):
    return "# 实测报告\n\n| 结论 | 来源 |\n| --- | --- |\n| 已验证 | [1] 样本 |\n"


def start_server(app):
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port,
                                           log_level="error", lifespan="on"))
    thread = Thread(target=lambda: asyncio.run(server.serve(sockets=[listener])), daemon=True)
    thread.start()
    return f"http://127.0.0.1:{port}", server, thread, listener


async def main():
    with TemporaryDirectory(prefix="dox-artifacts-live-") as directory:
        root = Path(directory)
        corpus_root = root / ".knowledge"
        corpus_dir = corpus_root / "fixture"
        corpus_dir.mkdir(parents=True)
        state_dir = root / "state"
        settings = Settings(_env_file=None, corpora_root=corpus_root, state_dir=state_dir,
                            model_api_key=SecretStr("offline-test"), auto_import_official=False)
        knowledge = Knowledge(corpus_dir / "datadb" / "knowledge.sqlite3", settings=settings)
        doc = knowledge.put(Document(title="样本", origin="sample", kind="text", parser="text",
                                     pages=[Page(number=1, text="证据正文")]))
        corpus_id = corpus_id_for("fixture")
        main_module.generate_markdown = offline_report

        def application():
            return main_module.create_app(settings, knowledge,
                                          lambda *_: OfflineGraph(corpus_id, doc["doc_id"]))

        origin, server, thread, listener = start_server(application())
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 950})
                await page.goto(origin)
                await expect(page.get_by_text(re.compile(r"当前对话：fixture（1/6）"))).to_be_visible()
                await page.get_by_role("textbox", name="问题", exact=True).fill("查询样本")
                await page.get_by_role("button", name="发送 ↑").click()
                await expect(page.get_by_role("button", name="保存为成果")).to_be_visible()
                await page.get_by_role("button", name="保存为成果").click()
                await expect(page.get_by_text(re.compile("已保存为成果"))).to_be_visible()

                session_key = await page.evaluate("localStorage.getItem('dox-agent-session')")
                template = await (await page.request.post(
                    f"{origin}/api/templates/custom",
                    data={"source_template_id": "comprehensive"})).json()
                template_draft = await (await page.request.put(
                    f"{origin}/api/templates/custom/{template['id']}/draft",
                    data={"revision": template["revision"], "name": "实测模板",
                          "content": "# 实测模板\n\n## 章节\n"})).json()
                template_publish = await page.request.post(
                    f"{origin}/api/templates/custom/{template['id']}/publish",
                    data={"revision": template_draft["revision"]})
                assert template_publish.status == 200
                task = await (await page.request.post(
                    f"{origin}/api/tasks/custom", data={"source_task_id": "task4"})).json()
                task_draft = await (await page.request.put(
                    f"{origin}/api/tasks/custom/{task['id']}/draft",
                    data={"revision": task["revision"], "name": "实测报告任务", "goal": "生成实测报告",
                          "background": "只依据样本", "report_template_id": template["id"],
                          "report_template_version": 1})).json()
                task_publish = await page.request.post(
                    f"{origin}/api/tasks/custom/{task['id']}/publish",
                    data={"revision": task_draft["revision"]})
                assert task_publish.status == 200
                custom_chat = await page.request.post(f"{origin}/api/chat", data={
                    "task_id": task["id"], "task_version": 1, "run_id": "live-custom-task-run-1",
                    "session_key": session_key, "corpus_ids": [corpus_id],
                    "messages": [{"role": "user", "content": "查询样本"}]})
                assert custom_chat.status == 200
                report = await page.request.post(f"{origin}/api/reports", data={
                    "domain": "实测领域", "year_from": 2024, "year_to": 2025,
                    "template_id": template["id"], "template_version": 1,
                    "corpus_id": corpus_id, "session_key": session_key,
                    "run_id": "live-report-run-1", "task_id": task["id"], "task_version": 1})
                assert report.status == 201, await report.text()


                await page.get_by_role("button", name="成果", exact=True).click()
                await expect(page.get_by_role("button", name=re.compile("离线回答.*回答快照"))).to_be_visible()
                await expect(page.get_by_role("button", name=re.compile("实测领域.*报告"))).to_be_visible()
                await page.get_by_role("button", name=re.compile("离线回答.*回答快照")).click()
                await expect(page.get_by_text("原始回答已核验").last).to_be_visible()
                await page.get_by_role("button", name="编辑新版本").click()
                await page.get_by_role("textbox", name="成果 Markdown").fill("# 人工修订\n\n保留来源 [1]")
                await page.get_by_role("button", name="保存草稿").click()
                await expect(page.get_by_role("heading", name="人工修订")).to_be_visible()
                await expect(page.get_by_text("用户修订版本").last).to_be_visible()
                await page.get_by_role("combobox", name="成果版本").select_option("1")
                await expect(page.get_by_text("原始回答已核验").last).to_be_visible()
                await page.get_by_role("button", name="新建对话").click()
                await page.get_by_role("button", name="成果", exact=True).click()
                await expect(page.get_by_role("button", name=re.compile("离线回答.*回答快照"))).to_be_visible()
                await browser.close()
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            listener.close()
            assert not thread.is_alive(), "test server did not stop"

        # A7: restore the state databases as one set and prove the artifact/run links survive.
        backup = root / "backup"
        backup.mkdir()
        assert {"workspace.sqlite3", "reports.sqlite3", "runs.sqlite3", "artifacts.sqlite3",
                "custom_tasks.sqlite3", "custom_templates.sqlite3"} <= {
            path.name for path in state_dir.glob("*.sqlite3")}

        for source in state_dir.glob("*.sqlite3"):
            shutil.copy2(source, backup / source.name)
            source.unlink()
        for source in backup.glob("*.sqlite3"):
            shutil.copy2(source, state_dir / source.name)
        origin, server, thread, listener = start_server(application())
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 950})
                await page.goto(origin)
                await page.get_by_role("button", name="成果", exact=True).click()
                await expect(page.get_by_role("button", name=re.compile("离线回答.*回答快照"))).to_be_visible()
                await expect(page.get_by_role("button", name=re.compile("实测领域.*报告"))).to_be_visible()
                items = await (await page.request.get(f"{origin}/api/artifacts")).json()
                answer = next(item for item in items if item["type"] == "answer_snapshot")
                report = next(item for item in items if item["type"] == "report")
                assert answer["run_available"] and report["run_available"]
                old = await (await page.request.get(
                    f"{origin}/api/artifacts/{answer['artifact_id']}?version=1")).json()
                latest = await (await page.request.get(
                    f"{origin}/api/artifacts/{answer['artifact_id']}")).json()
                run = await (await page.request.get(f"{origin}/api/runs/{answer['run_id']}")).json()
                assert old["source_verification"] == "verified" and latest["version"] == 2
                assert run["status"] == "completed" and run["answer_sha256"]
                custom_task_version = await (await page.request.get(
                    f"{origin}/api/tasks/custom/{task['id']}/versions/1")).json()
                custom_template_version = await (await page.request.get(
                    f"{origin}/api/templates/custom/{template['id']}/versions/1")).json()
                custom_run = await (await page.request.get(
                    f"{origin}/api/runs/live-custom-task-run-1")).json()
                custom_report_artifact = await (await page.request.get(
                    f"{origin}/api/artifacts?session_key={session_key}&type=report")).json()
                assert custom_task_version["goal"] == "生成实测报告"
                assert custom_template_version["version"] == 1
                assert custom_run["task_version"] == 1 and custom_run["status"] == "completed"
                assert any(item["task_id"] == task["id"] and item["template_version"] == 1
                           for item in custom_report_artifact)

                await browser.close()
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            listener.close()
            assert not thread.is_alive(), "restored test server did not stop"
    print("PASS: real service browser artifact/report/version flow and paired SQLite restore")


if __name__ == "__main__":
    asyncio.run(main())
