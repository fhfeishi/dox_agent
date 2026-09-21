"""Offline U0 UI-shell acceptance: rail convergence, drawer a11y/unmount, session list, health.

Runs against the built `frontend/dist` with mocked APIs. No model or backend needed.
"""

import asyncio
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect


def session(sid: str, title: str, *, updated: str | None = None, archived: bool = False):
    return {"id": sid, "revision": 1, "title": title, "updated_at": updated,
            "data": {"turns": [], "options": {"allowed_doc_ids": None}, "archived": archived}}


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root / "frontend/dist")))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    sessions = [
        session("s1", "今天的会话", updated="2026-09-21T08:00:00Z"),
        session("s2", "昨天的会话", updated="2026-09-20T08:00:00Z"),
        session("s3", "归档的会话", archived=True),
    ]
    official = {"count": 0}
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 950})
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            async def official_status(route):
                official["count"] += 1
                await route.fulfill(json={"status": "idle", "errors": []})

            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route("**/api/documents", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions", lambda r: r.fulfill(json=sessions))
            await page.route("**/api/workspace/sessions/*", lambda r: r.fulfill(json={**r.request.post_data_json, "id": r.request.url.rsplit("/", 1)[-1]}))
            await page.route("**/api/official-docs", official_status)

            await page.goto(origin)

            # rail convergence: ingest tools exist only inside the drawer
            await page.get_by_role("button", name="＋ 新的问答").wait_for()
            assert await page.get_by_role("button", name="导入 / 更新本地文本与 PDF").count() == 0, "ingest leaked into the rail"
            assert await page.get_by_text("LLM / 服务状态").count() == 0, "old health box still present"

            # compact bottom-left LLM status (U8)
            status = page.get_by_role("status").filter(has_text="LLM")
            await expect(status.get_by_text("offline")).to_be_visible()
            await expect(status.get_by_text("正常")).to_be_visible()

            # session list: grouping, search, archive
            await expect(page.get_by_text("今天的会话")).to_be_visible()
            await expect(page.get_by_text("昨天的会话")).to_be_visible()
            await expect(page.get_by_text("已归档会话 · 1")).to_be_visible()
            await page.get_by_role("textbox", name="搜索会话").fill("昨天")
            await expect(page.get_by_text("今天的会话")).to_have_count(0)
            await expect(page.get_by_text("昨天的会话")).to_be_visible()
            await page.get_by_role("textbox", name="搜索会话").fill("")

            # a newly created (unpersisted) session stays visible in the list
            await page.get_by_role("button", name="＋ 新的问答").click()
            await expect(page.get_by_text("当前新会话")).to_be_visible()

            # drawer: a11y dialog, Esc closes, focus returns, polling unmounts
            trigger = page.get_by_role("button", name="设置与运维")
            await trigger.click()
            dialog = page.get_by_role("dialog", name="设置与运维")
            await expect(dialog).to_be_visible()
            await expect(page.get_by_role("button", name="导入 / 更新本地文本与 PDF")).to_be_visible()
            await page.wait_for_timeout(2500)
            await page.keyboard.press("Escape")
            await expect(dialog).to_have_count(0)
            assert await page.evaluate("document.activeElement && document.activeElement.textContent") == "设置与运维"
            await page.wait_for_timeout(500)
            before = official["count"]
            await page.wait_for_timeout(3000)
            assert official["count"] == before, f"official-docs polling continued after close: {before} -> {official['count']}"

            assert not errors, errors
            print("PASS: rail convergence, compact health, session grouping/search/unsaved, drawer a11y+unmount")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
