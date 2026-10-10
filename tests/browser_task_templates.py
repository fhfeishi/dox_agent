"""query 2026-1009 1541: 存量分析 task cards and the report template library, offline.

Preview and modify open the same outline view; a built-in is copied only when an edit is
saved; unpublished drafts can be deleted, published ones archived and restored; report
templates are edited as a section outline in the library.
"""

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
from tests.browser_custom_tasks_live import OfflineGraph, start_server


async def main():
    with TemporaryDirectory(prefix="dox-task-templates-") as directory:
        root = Path(directory)
        corpus = root / ".knowledge" / "fixture"
        corpus.mkdir(parents=True)
        settings = Settings(_env_file=None, corpora_root=corpus.parent, state_dir=root / "state",
                            model_api_key=SecretStr("offline-test"))
        knowledge = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings)
        doc = knowledge.put(Document(title="样本", origin="2021_2025_P1_张三_sample.md", kind="text", parser="text",
                                     pages=[Page(number=1, text="方法证据")], markdown="填表日期：2025年\n方法证据"))
        corpus_id = corpus_id_for("fixture")
        app = create_app(settings, knowledge, lambda *_: OfflineGraph(corpus_id, doc["doc_id"]))
        origin, server, thread, listener = start_server(app)
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 950})
                errors: list[str] = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("dialog", lambda dialog: asyncio.ensure_future(dialog.accept()))
                # Two leftover drafts, as repeated "修改" clicks used to create.
                for _ in range(2):
                    assert (await page.request.post(f"{origin}/api/tasks/custom", data={"source_task_id": "task1"})).status == 201
                await page.goto(f"{origin}/tasks")
                cards = page.locator("article").filter(has=page.get_by_role("button", name="开始分析"))
                inspector = page.get_by_role("complementary", name="检查器")
                await expect(cards).to_have_count(6)

                # Preview is the outline itself; modify opens the same view as an editor.
                await cards.filter(has_text="技术研判").first.get_by_role("button", name="预览").click()
                await expect(inspector.get_by_text("任务大纲").first).to_be_visible()
                await expect(inspector.locator("textarea")).to_have_count(0)
                await inspector.get_by_role("button", name="编辑（保存为我的任务）").click()
                outline = inspector.get_by_label("任务大纲")
                await expect(outline).to_have_value(re.compile(r"^## 目标\n研判技术路线"))
                await expect(cards).to_have_count(6)  # browsing and opening the editor copy nothing
                await outline.fill("## 目标\n研判视觉导航\n\n## 输出结构\n- 已实现工作\n- 可继续工作")
                await inspector.get_by_role("button", name="保存并发布").click()
                await expect(inspector.get_by_text("已发布 v1")).to_be_visible()
                mine = cards.filter(has_text="技术研判（我的）")
                await expect(mine).to_have_count(1)
                tasks = await (await page.request.get(f"{origin}/api/tasks")).json()
                assert next(t for t in tasks if t["name"] == "技术研判（我的）")["outline"].endswith("- 可继续工作")

                # Cleanup: drafts are deleted, a published task is archived and can come back.
                while await cards.filter(has_text="未发布草稿").count():
                    before = await cards.count()
                    await cards.filter(has_text="未发布草稿").first.get_by_role("button", name="删除").click()
                    await expect(cards).to_have_count(before - 1)
                await expect(cards).to_have_count(5)
                await mine.get_by_role("button", name="归档").click()
                await expect(mine).to_have_count(0)
                await page.get_by_role("button", name="已归档", exact=True).click()
                archived = page.get_by_role("region", name="已归档")
                await archived.get_by_role("button", name="恢复").click()
                await expect(mine).to_have_count(1)

                # Template library: edit a built-in outline, preview it, save as my draft, delete it.
                library = page.get_by_role("region", name="报告模板库")
                await expect(library.locator("article")).to_have_count(5)
                await library.locator("article").filter(has_text="热点报告").get_by_role("button", name="修改").click()
                sections = inspector.get_by_label("章节大纲")
                await sections.fill(await sections.input_value() + "\n\n## 区域分布\n按地区统计。")
                await inspector.get_by_role("button", name="预览效果").click()
                await expect(inspector.get_by_role("heading", name="区域分布")).to_be_visible()
                await inspector.get_by_role("button", name="保存草稿").click()
                drafted = library.locator("article").filter(has_text="热点报告（我的）")
                await expect(drafted).to_have_count(1)
                await drafted.get_by_role("button", name="删除").click()
                await expect(drafted).to_have_count(0)

                # A report task picks its template from the library while editing.
                await cards.filter(has_text="专项报告").get_by_role("button", name="修改").click()
                await expect(inspector.get_by_label("报告模板").locator("option")).to_have_count(6)
                assert not errors, errors
                await browser.close()
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            listener.close()
    print("PASS: task cards and template library preview, outline editing, cleanup and archive")


if __name__ == "__main__":
    asyncio.run(main())
