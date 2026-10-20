"""Offline U6/U8 acceptance: drawer power button and bottom-left LLM status."""

import asyncio
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect


def session(index: int):
    return {"id": f"s{index}", "revision": 1, "title": f"会话 {index:02d}", "updated_at": "2026-09-21T08:00:00Z",
            "data": {"turns": [], "options": {"allowed_doc_ids": None}}}


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root / "frontend/dist")))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    sessions = [session(i) for i in range(30)]
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 950})
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            # Login exists since query 2026-1013 1133; offline scripts run as a signed-in administrator.
            await page.route("**/api/auth/session", lambda r: r.fulfill(json={"authenticated": True, "username": "admin", "role": "admin", "guides_seen": ["home", "leader", "chat", "library", "tasks", "review", "intelligence"]}))
            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline-test"}))
            await page.route("**/api/documents", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions", lambda r: r.fulfill(json=sessions))

            await page.goto(origin)
            await page.get_by_role("link", name="对话工作台", exact=True).click()
            # The model status sits in the rail (query 2026-1013 1520); its title names the model.
            status = page.get_by_role("button", name=re.compile("^模型状态"))
            await expect(status).to_have_attribute("title", re.compile("offline-test"))
            await expect(status).to_have_accessible_name("模型状态：正常")

            # long session list must not push the status footer away
            await page.get_by_role("textbox", name="搜索会话").scroll_into_view_if_needed()
            await expect(status).to_have_accessible_name("模型状态：正常")

            # 侧栏也有"设置"入口；运维抽屉由导航栏按钮打开。
            await page.get_by_role("banner").get_by_role("button", name="设置", exact=True).click()
            power = page.get_by_role("button", name="断开连接")
            await expect(power).to_be_enabled()
            await power.click()
            await expect(page.get_by_role("dialog", name="设置与运维")).to_have_count(0)
            await expect(page.get_by_text("已断开连接", exact=False)).to_be_visible()
            await expect(page.get_by_role("button", name="重新连接")).to_be_visible()
            await expect(status).to_have_accessible_name("模型状态：已断开")

            # power button is disabled while disconnected
            await page.get_by_role("banner").get_by_role("button", name="设置", exact=True).click()
            await expect(page.get_by_role("button", name="断开连接")).to_be_disabled()
            await page.keyboard.press("Escape")

            # reconnect from the main banner
            await page.get_by_role("button", name="重新连接").click()
            await expect(page.get_by_text("已断开连接", exact=False)).to_have_count(0)
            await expect(status).to_have_accessible_name("模型状态：正常")

            assert not errors, errors
            print("PASS: U6 power button (disconnect/disabled) + U8 sticky status footer")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
