"""Offline browser acceptance: Markdown previews use the parsed body, not the windowed reader.

Serves `frontend/dist` with mocked APIs. Verifies:
- a `.md` document (legacy `parser="utf8"`) is recognized as Markdown via its extension;
- the preview renders `GET /api/documents/{id}/markdown` and keeps every GFM table intact;
- "新窗口打开" renders the same Markdown structure (real `<table>`), not raw text.
"""

import asyncio
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect

MARKDOWN = (
    "# 标题\n\n"
    "| Feature | Per-invocation | Per-thread |\n| --- | --- | --- |\n| `checkpointer=` | `None` | `True` |\n\n"
    "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n"
    "| C | D |\n| --- | --- |\n| 3 | 4 |\n"
)

DOCUMENT = {"doc_id": "d1", "title": "README", "origin": "README.md", "rel_path": "README.md",
            "version": "v1", "captured_at": "2026-09-21T00:00:00Z", "kind": "text",
            "parser": "utf8", "pages": 1}
CORPUS = {"id": "c1", "name": "默认库", "kind": "demo", "domain": "x", "rel_path": "c1",
          "docs_count": 1, "preparation": "ready", "is_default": True, "index_progress": None, "job": None}


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root / "frontend/dist")))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    markdown_reads = 0
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1280, "height": 950})
            page = await context.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            async def markdown_doc(r):
                nonlocal markdown_reads
                markdown_reads += 1
                await r.fulfill(json={"text": MARKDOWN, "version": "v1"})

            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route(re.compile(r".*/api/corpora/[^/]+/files.*$"), lambda r: r.fulfill(json={"source_dir": "/tmp/c1/source", "files": [], "misplaced_files": []}))
            await page.route(re.compile(r".*/api/corpora(\?.*)?$"), lambda r: r.fulfill(json=[CORPUS]))
            await page.route("**/api/documents/d1/markdown*", markdown_doc)
            await page.route(re.compile(r".*/api/documents(\?.*)?$"), lambda r: r.fulfill(json=[DOCUMENT]))
            await page.route("**/api/tasks**", lambda r: r.fulfill(json=[{"id": "task1", "name": "精准问答", "description": "x", "output_hint": "结论", "has_template": False}]))
            await page.route(re.compile(r".*/api/workspace/sessions.*$"), lambda r: r.fulfill(json=[] if r.request.method == "GET" else {**r.request.post_data_json, "id": r.request.url.rsplit("/", 1)[-1]}))
            await page.route("**/api/official-docs", lambda r: r.fulfill(json={"status": "idle", "errors": []}))

            await page.goto(origin)
            await page.get_by_role("button", name="知识库", exact=True).click()
            await page.get_by_role("button", name=re.compile("默认库")).first.click()
            await page.get_by_role("button", name="打开详情").click()
            detail = page.get_by_role("dialog", name=re.compile("默认库"))
            await expect(detail).to_be_visible()
            await detail.get_by_role("button", name="预览", exact=True).first.click()

            dialog = page.locator("aside[aria-hidden='false']")
            await expect(dialog.get_by_text("资料预览", exact=True)).to_be_visible()
            assert markdown_reads >= 1, "preview did not use the markdown channel"
            await expect(dialog.locator("table")).to_have_count(3)
            assert await dialog.locator("pre").count() == 0, "markdown rendered as raw pre"

            # new window renders the same Markdown structure
            async with context.expect_page() as new_page_info:
                await dialog.get_by_role("button", name="新窗口打开").click()
            new_page = await new_page_info.value
            await expect(new_page.locator("table")).to_have_count(3)

            assert not errors, errors
            print("PASS: .md extension recognized, markdown channel used, 3 tables intact, new window renders tables")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
