"""Offline U6/U8 acceptance: drawer power button and bottom-left LLM status."""

import asyncio
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
            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline-test"}))
            await page.route("**/api/documents", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions", lambda r: r.fulfill(json=sessions))
            await page.route("**/api/official-docs", lambda r: r.fulfill(json={"status": "idle", "errors": []}))

            await page.goto(origin)
            status = page.get_by_role("status").filter(has_text="LLM")
            await expect(status.get_by_text("offline-test")).to_be_visible()
            await expect(status.get_by_text("正常")).to_be_visible()

            # long session list must not push the status footer away
            await page.get_by_role("textbox", name="搜索会话").scroll_into_view_if_needed()
            await expect(status.get_by_text("正常")).to_be_visible()

            # power button disconnects and closes the drawer
            await page.get_by_role("button", name="设置", exact=True).click()
            power = page.get_by_role("button", name="断开连接")
            await expect(power).to_be_enabled()
            await power.click()
            await expect(page.get_by_role("dialog", name="设置与运维")).to_have_count(0)
            await expect(page.get_by_text("已断开连接", exact=False)).to_be_visible()
            await expect(page.get_by_role("button", name="重新连接")).to_be_visible()
            await expect(status.get_by_text("已断开")).to_be_visible()

            # power button is disabled while disconnected
            await page.get_by_role("button", name="设置", exact=True).click()
            await expect(page.get_by_role("button", name="断开连接")).to_be_disabled()
            await page.keyboard.press("Escape")

            # reconnect from the main banner
            await page.get_by_role("button", name="重新连接").click()
            await expect(page.get_by_text("已断开连接", exact=False)).to_have_count(0)
            await expect(status.get_by_text("正常")).to_be_visible()

            assert not errors, errors
            print("PASS: U6 power button (disconnect/disabled) + U8 sticky status footer")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
