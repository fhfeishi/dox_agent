"""Login -> upload -> background queue -> return -> report filters, with real HTTP/storage/UI."""
import asyncio
import re
import threading
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.async_api import async_playwright, expect
from src.agent.config import Settings
from src.main import create_app
from src.review import routes, storage
from tests.browser_artifacts_live import start_server
from tests.test_review_flows import FixtureReviewClient


async def main():
    gate = threading.Event()
    class Model(FixtureReviewClient):
        def ask(self, phase, payload):
            if phase == "01_extract":
                if not gate.wait(30):
                    raise RuntimeError("browser did not release model")
            if phase == "05_verify":
                return {"summary": "fixture", "actions": [
                    {"target_id": ident, "decision": "retain", "reason": "原文与计量结果一致"}
                    for ident in payload["expected_ids"] if ident != "check-background"]}
            return super().ask(phase, payload)

    routes.Client = Model
    routes.model_configured = lambda: True
    routes.start_metadata = lambda ident: routes.public_doc(storage.get("document", ident))
    with TemporaryDirectory(prefix="dox-review-simple-") as directory:
        root = Path(directory)
        settings = Settings(_env_file=None, state_dir=root/"state", corpora_root=root/"corpora", user_dir=root/"usr")
        storage.DATA = root/"review"
        origin, server, thread, listener = start_server(create_app(settings))
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 1000})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                await page.goto(origin)
                await expect(page.get_by_role("heading", name="登录")).to_be_visible()
                await page.get_by_label("密码", exact=True).fill("123456")  # built-in admin / 123456
                await page.get_by_role("button", name="登录").click()
                await expect(page.get_by_role("heading", name="工作总览")).to_be_visible()
                # First visit to an area shows its three-step guide once per account.
                await page.get_by_role("dialog", name="首页 操作指南").get_by_role("button", name="知道了").click()
                await page.get_by_role("link", name="上传申请书 · 生成审查报告").click()
                await page.get_by_role("dialog", name="资料审查 操作指南").get_by_role("button", name="知道了").click()
                # Minimal workbench: template, application and start; details open on click.
                await page.get_by_role("button", name=re.compile("形式审查模板")).click()
                await expect(page.get_by_role("region", name="审查模板预览")).to_be_visible()
                await expect(page).to_have_url(origin + "/review/formal")
                await page.get_by_role("button", name="关闭检查器").click()
                body = "# 项目摘要\n" + "甲"*300 + "\n# 项目背景\n" + "乙"*201 + "\n# 项目方案\n" + "丙"*100
                await page.get_by_label("上传申请书文件", exact=True).set_input_files({
                    "name": "队列验收.md", "mimeType": "text/markdown", "buffer": body.encode()})
                await expect(page.get_by_role("button", name="开始审查", exact=True)).to_be_enabled()
                for _ in range(3):
                    await page.get_by_role("button", name="开始审查", exact=True).click()
                    await expect(page.get_by_role("button", name="开始审查", exact=True)).to_be_enabled()
                await expect(page.locator("details#records")).not_to_have_attribute("open", "")
                await expect(page.locator("#records a")).to_have_count(3)
                await expect(page.locator("#records")).to_contain_text("排队中")
                await page.get_by_role("button", name="首页", exact=True).click()
                await expect(page.get_by_role("heading", name="工作总览")).to_be_visible()
                gate.set()
                await page.get_by_role("button", name="资料审查", exact=True).click()
                await expect(page.get_by_role("button", name=re.compile("申请书.*队列验收.md"))).to_be_visible()
                await page.reload()
                await expect(page.locator("#records a")).to_have_count(3)
                await expect(page.locator("#records")).not_to_contain_text("排队中", timeout=15000)
                await expect(page.get_by_role("link", name=re.compile("审查完成.*打开报告"))).to_be_visible()
                await page.locator("#records summary").click()
                await page.locator("#records a").first.click()
                await expect(page.get_by_role("button", name="最终复核未完成 1", exact=True)).to_be_visible(timeout=15000)
                await expect(page.get_by_role("button", name="查看全部结果", exact=True)).to_have_count(0)
                await expect(page.get_by_role("button", name="优先查看待处理事项", exact=True)).to_have_count(0)
                await page.get_by_role("button", name="最终复核未完成 1", exact=True).click()
                panel = page.get_by_role("tabpanel")
                await expect(panel.locator("article")).to_have_count(1)
                await expect(panel).to_contain_text("项目背景")
                await page.get_by_role("button", name="最终复核未完成 1", exact=True).click()
                assert await panel.locator("article").count() > 1
                await page.get_by_role("tab", name="预算与进度", exact=True).click()
                await expect(panel).to_contain_text("预算")
                export_url = await page.get_by_role("link", name="下载 Word 报告", exact=True).get_attribute("href")
                assert (await page.request.get(origin + export_url)).status == 200
                await page.set_viewport_size({"width": 390, "height": 844})
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                screenshots = Path(".logsdev/verification/query-20261013-1133")
                screenshots.mkdir(parents=True, exist_ok=True)
                await page.screenshot(path=str(screenshots/"report-mobile.png"), full_page=True)
                await page.set_viewport_size({"width": 1440, "height": 1000})
                await page.get_by_role("button", name="首页", exact=True).click()
                await expect(page.get_by_role("heading", name="工作总览")).to_be_visible()
                await page.screenshot(path=str(screenshots/"home.png"), full_page=True)
                await page.get_by_role("button", name="退出登录", exact=True).click()
                await expect(page.get_by_role("heading", name="登录")).to_be_visible()
                assert (await page.request.get(origin + export_url)).status == 401
                assert not errors, errors
                await browser.close()
            print("PASS: default admin login/logout, protected export, template inspector, three queued reports, leave/reload/return, status feedback, homepage, mobile")
        finally:
            gate.set()
            server.should_exit = True
            thread.join(timeout=10)
            listener.close()

asyncio.run(main())
