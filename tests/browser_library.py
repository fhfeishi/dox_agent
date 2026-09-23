"""Offline browser acceptance: knowledge-base information architecture.

Serves the built `frontend/dist` with mocked APIs. Verifies:
- the library main area is a corpus card grid (not a document list);
- a card/row opens a corpus detail drawer;
- browsing a non-active corpus and opening its document does not change the active corpus,
  and the PDF `/file` request carries the browsed corpus;
- the settings drawer no longer owns knowledge-base CRUD;
- the active corpus is still what `POST /api/chat` carries.
"""

import asyncio
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect


def corpus(cid: str, name: str, *, default: bool = False) -> dict:
    return {"id": cid, "name": name, "kind": "demo", "domain": "x", "rel_path": cid,
            "docs_count": 1 if cid == "c2" else 0, "preparation": "ready",
            "is_default": default, "index_progress": None, "job": None}


PDF = {"doc_id": "d2", "title": "对比报告.pdf", "origin": "对比报告.pdf", "version": "v2",
       "captured_at": "2026-09-21T00:00:00Z", "kind": "pdf", "parser": "mineru", "pages": 8}


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root / "frontend/dist")))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    corpora = [corpus("c1", "默认库", default=True), corpus("c2", "对比库")]
    chat_bodies: list[dict] = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1440, "height": 950})
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            async def documents(r):
                url = r.request.url
                await r.fulfill(json=[PDF] if "corpus=c2" in url else [])

            async def file_response(r):
                await r.fulfill(status=200, content_type="application/pdf",
                                headers={"Content-Disposition": "inline; filename=x.pdf"},
                                body=b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF")

            async def chat(r):
                chat_bodies.append(r.request.post_data_json)
                body = ('event: sources\ndata: []\n\n'
                        'event: token\ndata: {"text":"回答"}\n\n'
                        'event: done\ndata: {"ok":true}\n\n')
                await r.fulfill(status=200, content_type="text/event-stream", body=body)

            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route(re.compile(r".*/api/corpora(\?.*)?$"), lambda r: r.fulfill(json=corpora))
            await page.route(re.compile(r".*/api/corpora/[^/]+/files.*$"), lambda r: r.fulfill(json={"files": []}))
            await page.route("**/api/documents/d2/file*", file_response)
            await page.route(re.compile(r".*/api/documents(\?.*)?$"), documents)
            await page.route("**/api/tasks", lambda r: r.fulfill(json=[{"id": "task1", "name": "精准问答", "description": "x", "output_hint": "结论", "has_template": False}]))
            await page.route("**/api/workspace/sessions", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions/*", lambda r: r.fulfill(json={**r.request.post_data_json, "id": r.request.url.rsplit("/", 1)[-1]}))
            await page.route("**/api/official-docs", lambda r: r.fulfill(json={"status": "idle", "errors": []}))
            await page.route("**/api/chat", chat)

            await page.goto(origin)

            # 1) library main area is a corpus grid with status/default markers
            await page.get_by_role("button", name=re.compile("文献库")).first.click()
            await expect(page.get_by_role("button", name=re.compile("默认库")).first).to_be_visible()
            await expect(page.get_by_role("button", name=re.compile("对比库")).first).to_be_visible()
            await expect(page.get_by_text("默认", exact=True).first).to_be_visible()

            # 2) opening the detail and explicitly switching the active corpus
            await page.get_by_role("button", name=re.compile("对比库")).first.click()
            detail = page.get_by_role("dialog", name=re.compile("对比库"))
            await expect(detail).to_be_visible()
            await detail.get_by_role("button", name="用于当前对话").click()
            await expect(detail.get_by_text("当前对话使用中")).to_be_visible()

            # 2b) non-default corpus: online document sources are not shown (default library only)
            await detail.get_by_role("button", name="导入").click()
            assert await detail.get_by_role("heading", name="在线文档源").count() == 0
            await detail.get_by_role("button", name=re.compile("文档")).first.click()

            # 3) opening a document from that corpus previews the right corpus
            await detail.get_by_role("button", name=re.compile("对比报告")).first.click()
            dialog = page.get_by_role("dialog", name=re.compile("文档预览"))
            await expect(dialog).to_be_visible()
            src = await dialog.locator("iframe").get_attribute("src")
            assert "/api/documents/d2/file" in src and "corpus=c2" in src, src
            await dialog.get_by_role("button", name="关闭 ✕").click()

            # 4) browsing another corpus does not change the active one
            await page.get_by_role("button", name=re.compile("默认库")).first.click()
            other = page.get_by_role("dialog", name=re.compile("默认库"))
            await expect(other).to_be_visible()
            await expect(other.get_by_role("button", name="用于当前对话")).to_be_visible()
            # default corpus: online document sources live in the import tab
            await other.get_by_role("button", name="导入").click()
            await expect(other.get_by_role("heading", name="在线文档源")).to_be_visible()
            await other.get_by_role("button", name="关闭 ✕").click()

            # 5) settings drawer no longer owns knowledge-base CRUD or sources/export
            await page.get_by_role("button", name="设置", exact=True).click()
            settings = page.get_by_role("dialog", name="设置与运维")
            await expect(settings).to_be_visible()
            assert await settings.get_by_role("button", name="新建知识库").count() == 0
            assert await settings.get_by_text("知识库管理").count() == 0
            assert await settings.get_by_text("在线文档源").count() == 0
            assert await settings.get_by_role("button", name="导出诊断 JSON").count() == 0
            await settings.get_by_role("button", name="关闭 ✕").click()

            # 6) chat still carries the explicitly activated corpus
            await page.get_by_role("button", name="对话").first.click()
            await page.get_by_role("textbox", name="问题", exact=True).fill("对比一下")
            await page.get_by_role("button", name="发送 ↑").click()
            await expect(page.get_by_text("回答", exact=False).first).to_be_visible()
            assert chat_bodies and chat_bodies[-1].get("corpus_id") == "c2", chat_bodies[-1] if chat_bodies else None

            assert not errors, errors
            print("PASS: corpus grid, detail drawer, browse-does-not-switch, per-corpus /file, settings has no KB CRUD, chat corpus_id")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
