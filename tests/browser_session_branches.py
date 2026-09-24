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
    chat_bodies: list[dict] = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 950})
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            async def chat(route):
                payload = route.request.post_data_json
                chat_bodies.append(payload)
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
            await page.route(re.compile(r".*/api/documents(?:\?.*)?$"), lambda r: r.fulfill(json=[]))
            await page.route("**/api/corpora", lambda r: r.fulfill(json=[
                {"id": "c1", "name": "演示库", "kind": "demo", "domain": "x", "rel_path": "c1", "docs_count": 1,
                 "preparation": "ready", "is_default": True, "index_progress": None, "job": None},
                {"id": "c2", "name": "新范围库", "kind": "demo", "domain": "y", "rel_path": "c2", "docs_count": 1,
                 "preparation": "ready", "is_default": False, "index_progress": None, "job": None},
            ]))
            await page.route("**/api/tasks**", lambda r: r.fulfill(json=[]))
            await page.route("**/api/official-docs", lambda r: r.fulfill(json={"status": "idle", "errors": []}))
            await page.route("**/api/workspace/sessions", sessions)
            await page.route("**/api/workspace/sessions/*", sessions)
            await page.route("**/api/chat", chat)

            async def ask(question: str):
                await page.get_by_role("textbox", name="问题", exact=True).fill(question)
                await page.get_by_role("button", name="发送 ↑").click()
                await expect(page.get_by_text("回答:" + question, exact=False)).to_be_visible()

            await page.goto(origin)
            # New sessions auto-select the first corpus directory; no confirmation gate.
            await expect(page.get_by_text(re.compile("当前对话：演示库（1/6）"))).to_be_visible()
            await ask("第一问")
            await ask("第二问")
            assert len(store) == 1, f"expected one session, got {len(store)}"
            only = next(iter(store.values()))
            title = only["title"]
            # Every send uses the explicit retrieval set; a single corpus is a one-element list.
            assert chat_bodies and all(body.get("corpus_ids") == ["c1"] and "corpus_id" not in body for body in chat_bodies), chat_bodies
            # W3-A: each chat run carries its session key for the persisted snapshot.
            assert all(body.get("session_key") for body in chat_bodies), chat_bodies

            # Given the session range changed after both answers, replay actions retain each turn's original range.
            await page.get_by_role("button", name="管理知识库").click()
            await page.get_by_role("button", name="仅使用此库").click()
            await expect(page.get_by_label("本次运行配置")).to_contain_text("新范围库")
            await page.get_by_role("button", name="管理知识库").click()
            await expect(page.get_by_role("region", name="对话").get_by_text("检索「演示库」", exact=False)).to_have_count(2)

            # regenerate the last turn: same session scope, new run id
            first_run = chat_bodies[-1]["run_id"]
            before = len(chat_bodies)
            await page.locator("article").last.get_by_role("button", name="重新生成").click()
            for _ in range(50):
                if len(chat_bodies) > before:
                    break
                await page.wait_for_timeout(50)
            assert len(chat_bodies) > before, "regenerate did not issue a request"
            assert chat_bodies[-1]["run_id"] != first_run, "regenerate must use a new run id"
            assert chat_bodies[-1].get("corpus_ids") == ["c1"], chat_bodies[-1]

            # edit the first turn and re-ask: same session, divergence marker appears
            await page.locator("article").first.get_by_role("button", name="编辑并重问").click()
            await page.get_by_role("textbox", name="编辑历史问题").fill("第一问改")
            await page.get_by_role("button", name="确认修改并重新询问").click()
            await expect(page.get_by_text("回答:第一问改", exact=False)).to_be_visible()
            assert chat_bodies[-1].get("corpus_ids") == ["c1"], chat_bodies[-1]
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

            # Given two regular sessions, when one is pinned and the list is filtered,
            # then the pinned session remains findable after a browser reload.
            store[source_id]["title"] = "历史主会话"
            title = "历史主会话"
            await page.reload()
            await page.get_by_role("button", name="新建对话").click()
            await ask("第三问")
            side = page.locator("aside").first
            await side.get_by_role("button", name=title, exact=True).hover()
            await side.get_by_role("button", name="置顶会话").click()
            assert store[source_id]["data"]["pinned"] is True
            await side.get_by_role("button", name="仅看置顶").click()
            await expect(side.get_by_role("button", name=re.compile(title))).to_be_visible()
            await expect(side.get_by_role("button", name="第三问", exact=True)).to_have_count(0)
            await page.reload()
            await expect(page.locator("aside").first.get_by_role("button", name=re.compile(title))).to_be_visible()

            assert not errors, errors
            print("PASS: U5 edit-in-place, persistence, restore, legacy nesting")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
