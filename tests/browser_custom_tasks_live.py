"""User flow for a custom task against the real local API and an offline graph."""

import asyncio
import re
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.async_api import async_playwright, expect
from pydantic import SecretStr

from src.agent.config import Settings
from src.agent.corpora import corpus_id_for
from src.knowledge import Document, Knowledge, Page
from src.main import create_app
from tests.browser_artifacts_live import OfflineGraph, start_server


async def main():
    # Given a local document and a deterministic graph with a real citation
    with TemporaryDirectory(prefix="dox-custom-task-") as directory:
        root = Path(directory)
        corpus = root / ".knowledge" / "fixture"
        corpus.mkdir(parents=True)
        settings = Settings(_env_file=None, corpora_root=corpus.parent, state_dir=root / "state",
                            model_api_key=SecretStr("offline-test"), auto_import_official=False)
        knowledge = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings)
        doc = knowledge.put(Document(title="样本", origin="sample", kind="text", parser="text",
                                     pages=[Page(number=1, text="基金项目方法证据")]))
        cid = corpus_id_for("fixture")
        app = create_app(settings, knowledge, lambda *_: OfflineGraph(cid, doc["doc_id"]))
        origin, server, thread, listener = start_server(app)
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 950})
                await page.goto(origin)
                await page.get_by_role("button", name="任务", exact=True).click()
                # When the user copies, edits and publishes a task in the inspector
                await page.get_by_role("button", name="复制问答任务").click()
                await expect(page.get_by_text("未发布草稿")).to_be_visible()
                await page.get_by_role("textbox", name="名称").fill("基金项目方法问答")
                await page.get_by_role("textbox", name="背景").fill("基金项目资料")
                await page.get_by_role("textbox", name="目标").fill("比较方法")
                await page.get_by_role("textbox", name="具体要求").fill("逐项引用")
                await page.get_by_role("textbox", name="默认关注点").fill("技术路线")
                await page.get_by_role("button", name="添加参数").click()
                await page.get_by_role("textbox", name="参数1名称").fill("topic")
                await page.get_by_role("textbox", name="参数1标签").fill("研究主题")
                await page.get_by_role("checkbox", name="必填").check()
                await page.get_by_role("button", name="保存并发布").click()
                await expect(page.get_by_text("已发布 v1").first).to_be_visible()
                await page.get_by_role("button", name="使用此任务").click()
                await expect(page.get_by_role("textbox", name="研究主题")).to_be_visible()
                await page.get_by_role("textbox", name="研究主题").fill("研究方法")
                await page.get_by_role("textbox", name="问题", exact=True).fill("有哪些方法？")
                await page.get_by_role("button", name="发送 ↑").click()
                await expect(page.get_by_role("button", name="保存为成果")).to_be_visible()
                await page.get_by_role("button", name="保存为成果").click()
                await expect(page.get_by_text(re.compile("已保存为成果"))).to_be_visible()

                # Then the persisted session, run and artifact resolve the same version.
                tasks = await (await page.request.get(f"{origin}/api/tasks")).json()
                task = next(item for item in tasks if item["name"] == "基金项目方法问答")
                sessions = await (await page.request.get(f"{origin}/api/workspace/sessions")).json()
                session = next(item for item in sessions if item["data"].get("task_id") == task["id"])
                assert session["data"]["task_version"] == 1
                artifacts = await (await page.request.get(f"{origin}/api/artifacts")).json()
                answer = next(item for item in artifacts if item["type"] == "answer_snapshot")
                run = await (await page.request.get(f"{origin}/api/runs/{answer['run_id']}")).json()
                assert run["task_id"] == task["id"] and run["task_version"] == 1
                assert run["params"]["focus"] == "技术路线"
                assert run["param_sources"]["focus"] == "task_default"
                assert run["params"]["topic"] == "研究方法" and run["param_sources"]["topic"] == "user"
                assert run["citations"][0]["doc_id"] == doc["doc_id"]
                await browser.close()
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            listener.close()
            assert not thread.is_alive()
    print("PASS: browser copy/edit/publish/chat/artifact task provenance")


if __name__ == "__main__":
    asyncio.run(main())
