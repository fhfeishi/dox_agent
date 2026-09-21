"""Optional browser smoke check against an already-running local application."""

import asyncio
import os
from pathlib import Path

from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(os.getenv("TEST_BASE_URL", "http://127.0.0.1:8011"))
        await page.get_by_text("知识库 · 11 份").wait_for()
        await page.get_by_role("textbox", name="问题", exact=True).fill("测试流式展示")
        # Browser integration does not spend another model call.
        await page.route(
            "**/api/chat",
            lambda route: route.fulfill(
                status=200,
                content_type="text/event-stream",
                body='event: sources\ndata: []\n\nevent: token\ndata: {"text":"浏览器验证通过"}\n\nevent: done\ndata: {"ok":true}\n\n',
            ),
        )
        await page.get_by_role("button", name="发送 ↑").click()
        await page.get_by_text("浏览器验证通过", exact=True).wait_for()
        await page.get_by_role("button", name="＋ 新的问答").click()
        await page.get_by_role("heading", name="从一个好问题开始。").wait_for()
        output = Path("data/browser-smoke.png")
        output.parent.mkdir(exist_ok=True)
        await page.screenshot(path=str(output), full_page=True)
        await page.set_viewport_size({"width": 390, "height": 844})
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert errors == [], errors
        print("Browser smoke passed (desktop + mobile overflow, no page errors)")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
