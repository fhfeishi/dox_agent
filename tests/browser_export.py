"""Offline browser acceptance: session export menu and per-answer MD/Word export.

Serves `frontend/dist` with mocked APIs. Verifies:
- the chat top bar has a session export menu (Markdown + diagnostics JSON);
- every completed answer has "导出 MD" / "导出 Word" beside copy/regenerate;
- the Markdown export contains question/answer/sources;
- the Word export is a `.doc` whose HTML keeps the rendered table.
"""

import asyncio
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect

SOURCE = {"title": "示例来源", "url": "", "snippet": "片段", "page": 3, "citation": 1,
          "doc_id": "d1", "version": "v1"}
ANSWER = "结论 [1]\n\n| A | B |\n| --- | --- |\n| 1 | 2 |"
CORPUS = {"id": "c1", "name": "默认库", "kind": "demo", "domain": "x", "rel_path": "c1",
          "docs_count": 0, "preparation": "ready", "is_default": True, "index_progress": None, "job": None}


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root / "frontend/dist")))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1400, "height": 950})
            page = await context.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            async def chat(r):
                body = ("event: sources\ndata: " + json.dumps([SOURCE]) + "\n\n"
                        "event: token\ndata: " + json.dumps({"text": ANSWER}) + "\n\n"
                        'event: done\ndata: {"ok":true}\n\n')
                await r.fulfill(status=200, content_type="text/event-stream", body=body)

            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route(re.compile(r".*/api/corpora(\?.*)?$"), lambda r: r.fulfill(json=[CORPUS]))
            await page.route(re.compile(r".*/api/documents(\?.*)?$"), lambda r: r.fulfill(json=[]))
            await page.route("**/api/tasks", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions/*", lambda r: r.fulfill(json={**r.request.post_data_json, "id": r.request.url.rsplit("/", 1)[-1]}))
            await page.route("**/api/official-docs", lambda r: r.fulfill(json={"status": "idle", "errors": []}))
            await page.route("**/api/chat", chat)

            await page.goto(origin)
            await page.get_by_role("textbox", name="问题", exact=True).fill("导出测试")
            await page.get_by_role("button", name="发送 ↑").click()

            # per-answer export buttons sit beside copy/regenerate (enabled once the answer is done)
            await expect(page.get_by_role("button", name="导出此回答为 Markdown")).to_be_enabled()
            await expect(page.get_by_role("button", name="导出此回答为 Word")).to_be_enabled()

            # session export menu -> Markdown
            await page.get_by_role("button", name="导出", exact=True).click()
            async with page.expect_download() as session_dl:
                await page.get_by_role("button", name="导出会话为 Markdown").click()
            session_path = await (await session_dl.value).path()
            session_md = Path(session_path).read_text(encoding="utf-8")
            assert "## 第 1 轮" in session_md and "**提问**" in session_md, session_md[:200]
            assert "导出测试" in session_md and "结论 [1]" in session_md
            assert "1. 示例来源 · 第3页" in session_md

            # per-answer Markdown
            async with page.expect_download() as md_dl:
                await page.get_by_role("button", name="导出此回答为 Markdown").click()
            md_path = await (await md_dl.value).path()
            md = Path(md_path).read_text(encoding="utf-8")
            assert "## 回答" in md and "结论 [1]" in md and "1. 示例来源 · 第3页" in md

            # per-answer Word (Word-compatible HTML .doc, table preserved)
            async with page.expect_download() as word_dl:
                await page.get_by_role("button", name="导出此回答为 Word").click()
            word = await word_dl.value
            assert word.suggested_filename.endswith(".doc"), word.suggested_filename
            doc = Path(await word.path()).read_text(encoding="utf-8")
            assert "urn:schemas-microsoft-com:office:word" in doc
            assert "<table" in doc

            # settings drawer has neither sources nor export
            await page.get_by_role("button", name="设置", exact=True).click()
            settings = page.get_by_role("dialog", name="设置与运维")
            await expect(settings).to_be_visible()
            assert await settings.get_by_text("在线文档源").count() == 0
            assert await settings.get_by_role("button", name="导出诊断 JSON").count() == 0
            await settings.get_by_role("button", name="关闭 ✕").click()

            assert not errors, errors
            print("PASS: session export menu, per-answer MD/Word export (table preserved), settings drawer has no sources/export")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
