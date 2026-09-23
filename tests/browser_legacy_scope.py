"""User can restore old single- and multi-corpus sessions without changing their retrieval scope."""

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
    store = {
        "single": {"id": "single", "revision": 1, "title": "旧单库会话", "data": {
            "turns": [], "options": {"allowed_doc_ids": None}, "corpus_id": "c1"}},
        "multi": {"id": "multi", "revision": 1, "title": "旧多库会话", "data": {
            "turns": [], "options": {"allowed_doc_ids": None}, "corpus_id": "c1", "corpus_ids": ["c1", "c2"]}},
    }
    requests = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1300, "height": 900})
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            async def sessions(route):
                if route.request.method == "PUT":
                    data = route.request.post_data_json
                    sid = route.request.url.rsplit("/", 1)[-1]
                    store[sid] = {"id": sid, "revision": store.get(sid, {}).get("revision", 0) + 1,
                                  "title": data["title"], "data": data["data"]}
                    await route.fulfill(json=store[sid])
                else:
                    await route.fulfill(json=list(store.values()))

            async def chat(route):
                requests.append(route.request.post_data_json)
                body = ('event: sources\ndata: []\n\n'
                        'event: token\ndata: ' + json.dumps({"text": "已回答"}) + '\n\n'
                        'event: done\ndata: {"ok":true}\n\n')
                await route.fulfill(status=200, content_type="text/event-stream", body=body)

            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route(re.compile(r".*/api/corpora(?:\?.*)?$"), lambda r: r.fulfill(json=[
                {"id": cid, "name": name, "kind": "demo", "domain": "x", "rel_path": cid,
                 "docs_count": 1, "preparation": "ready", "is_default": cid == "c1", "job": None}
                for cid, name in (("c1", "甲库"), ("c2", "乙库"))]))
            await page.route(re.compile(r".*/api/documents(?:\?.*)?$"), lambda r: r.fulfill(json=[]))
            await page.route("**/api/tasks", lambda r: r.fulfill(json=[]))
            await page.route("**/api/official-docs", lambda r: r.fulfill(json={"status": "idle", "errors": []}))
            await page.route("**/api/workspace/sessions", sessions)
            await page.route("**/api/workspace/sessions/*", sessions)
            await page.route("**/api/chat", chat)

            await page.goto(f"http://127.0.0.1:{server.server_port}")
            # Given the old single-corpus record, when it is used, then only c1 is sent.
            await expect(page.get_by_text("旧单库会话").first).to_be_visible()
            await page.get_by_role("textbox", name="问题", exact=True).fill("单库核对")
            await page.get_by_role("button", name="发送 ↑").click()
            await expect(page.get_by_text("已回答").first).to_be_visible()
            assert requests[-1].get("corpus_ids") == ["c1"], requests[-1]

            # Given the old multi-corpus record, switching and reloading keeps both ids.
            await page.get_by_text("旧多库会话").first.click()
            await expect(page.get_by_text(re.compile("甲库.*乙库|乙库.*甲库")).first).to_be_visible()
            await page.reload()
            await page.get_by_role("textbox", name="问题", exact=True).fill("多库核对")
            await page.get_by_role("button", name="发送 ↑").click()
            await expect(page.get_by_text("已回答").first).to_be_visible()
            assert requests[-1].get("corpus_ids") == ["c1", "c2"], requests[-1]
            assert not errors, errors
            print("PASS: legacy single/multi corpus scope survives restore, switch, reload and send")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
