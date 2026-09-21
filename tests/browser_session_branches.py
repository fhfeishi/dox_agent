"""Offline U5 acceptance: edit-and-reask stays in one session, branches persist, restore, legacy nesting.

Serves the built `frontend/dist` and a stateful in-memory workspace mock. No backend/model needed.
"""

import asyncio
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root / "frontend/dist")))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    store: dict[str, dict] = {}
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 950})
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            async def chat(route):
                payload = route.request.post_data_json
                question = payload["messages"][-1]["content"]
                answer = json.dumps({"text": "回答:" + question})
                body = f'event: sources\ndata: []\n\nevent: token\ndata: {answer}\n\nevent: done\ndata: {{"ok":true}}\n\n'
                await route.fulfill(status=200, content_type="text/event-stream", body=body)

            async def sessions(route):
                if route.request.method == "PUT":
                    data = route.request.post_data_json
                    sid = route.request.url.rsplit("/", 1)[-1]
                    record = {"id": sid, "revision": store.get(sid, {}).get("revision", 0) + 1, "title": data["title"], "data": data["data"]}
                    store[sid] = record
                    await route.fulfill(json=record)
                else:
                    await route.fulfill(json=list(store.values()))

            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route("**/api/documents", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions", sessions)
            await page.route("**/api/workspace/sessions/*", sessions)
            await page.route("**/api/chat", chat)

            async def ask(question: str):
                await page.get_by_role("textbox", name="问题", exact=True).fill(question)
                await page.get_by_role("button", name="发送 ↑").click()
                await expect(page.get_by_text("回答:" + question, exact=False)).to_be_visible()

            await page.goto(origin)
            await ask("第一问")
            await ask("第二问")
            assert len(store) == 1, f"expected one session, got {len(store)}"
            only = next(iter(store.values()))
            title = only["title"]

            # edit the first turn and re-ask: same session, divergence marker appears
            await page.locator("article").first.get_by_role("button", name="编辑并重问").click()
            await page.get_by_role("textbox", name="编辑历史问题").fill("第一问改")
            await page.get_by_role("button", name="确认修改并重新询问").click()
            await expect(page.get_by_text("回答:第一问改", exact=False)).to_be_visible()
            await expect(page.get_by_text(re.compile(r"分支 \(1\)"))).to_be_visible()
            assert len(store) == 1, "editing must not create a new session"
            assert next(iter(store.values()))["title"] == title, "session title must not change"

            # branch survives an autosave + reload
            await page.wait_for_timeout(900)
            await page.reload()
            await expect(page.get_by_text(re.compile(r"分支 \(1\)"))).to_be_visible()
            assert len(store) == 1

            # restore: branch becomes the main timeline again
            await page.get_by_text(re.compile(r"分支 \(1\)")).click()
            await page.get_by_role("button", name="设为主时间线").click()
            await expect(page.get_by_role("region", name="分支查看")).to_have_count(0)
            conversation = page.get_by_role("region", name="对话")
            await expect(conversation.get_by_text("第一问", exact=True)).to_be_visible()
            await expect(conversation.get_by_text("第二问", exact=True)).to_be_visible()
            assert await conversation.get_by_text("第一问改", exact=True).count() == 0

            # legacy branch sessions nest under their source instead of two peer histories
            source_id = next(iter(store))
            store["legacy"] = {"id": "legacy", "revision": 1, "title": "编辑后的分支",
                               "data": {"turns": [], "options": {"allowed_doc_ids": None}, "source_session_id": source_id, "source_turn_index": 0}}
            await page.reload()
            await expect(page.get_by_text("历史分支").first).to_be_visible()

            assert not errors, errors
            print("PASS: U5 edit-in-place, persistence, restore, legacy nesting")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
