"""Offline U7 acceptance: preview stored document text, multi-page continuation, metadata, scope.

Serves built `frontend/dist` with mocked documents/read APIs.
"""

import asyncio
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
    document = {"doc_id": "d1", "title": "示例文档", "origin": "https://example.test/doc", "version": "v1",
                "captured_at": "2026-09-21T00:00:00Z", "kind": "official", "parser": "official-markdown", "pages": 2}
    corpus = {"id": "c1", "name": "示例库", "kind": "official", "domain": "test", "rel_path": "c1",
              "docs_count": 1, "preparation": "ready", "is_default": True, "index_progress": None, "job": None}
    reads: list[str] = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 950})
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            async def read_document(route):
                url = route.request.url
                # This corpus predates the markdown channel: 404 makes the preview fall back to
                # the windowed reader (the multi-page path under test here).
                if "/markdown" in url:
                    await route.fulfill(status=404, json={"detail": "markdown 不可用"})
                    return
                reads.append(url)
                params = {key: value for key, value in (part.split("=", 1) for part in url.split("?", 1)[1].split("&"))}
                page_no, start = int(params["page"]), int(params["start_line"])
                pages = {
                    (1, 1): ("# 第一页\n\n正文一", 3),
                    (1, 3): ("续读第一页", None),
                    (2, 1): ("第二页内容", None),
                }
                if (page_no, start) not in pages:
                    await route.fulfill(status=422, json={"detail": "页码不存在"})
                    return
                text, nxt = pages[(page_no, start)]
                await route.fulfill(json={"doc_id": "d1", "version": "v1", "title": "示例文档", "page": page_no,
                                          "start_line": start, "next_start_line": nxt, "text": text,
                                          "kind": "official", "parser": "official-markdown"})

            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route(re.compile(r".*/api/corpora(\?.*)?$"), lambda r: r.fulfill(json=[corpus]))
            await page.route("**/api/documents/d1*", read_document)
            await page.route(re.compile(r".*/api/documents(\?.*)?$"), lambda r: r.fulfill(json=[document]))
            await page.route("**/api/workspace/sessions", lambda r: r.fulfill(json=[]))
            await page.route("**/api/official-docs", lambda r: r.fulfill(json={"status": "idle", "errors": []}))

            await page.goto(origin)
            # library grid -> corpus detail -> document preview
            await page.get_by_role("button", name=re.compile("文献库")).first.click()
            await page.get_by_role("button", name=re.compile("示例库")).first.click()
            detail = page.get_by_role("dialog", name=re.compile("示例库"))
            await expect(detail).to_be_visible()
            await detail.get_by_role("button", name=re.compile("示例文档")).first.click()

            dialog = page.get_by_role("dialog", name=re.compile("文档预览"))
            await expect(dialog).to_be_visible()
            await expect(page.get_by_role("dialog", name=re.compile("示例库"))).to_have_count(0)  # detail closed, not occluding
            await expect(dialog.get_by_text("正文一")).to_be_visible()
            await expect(dialog.get_by_text("续读第一页")).to_be_visible()
            await expect(dialog.get_by_text("第二页内容")).to_be_visible()  # multi-page continuation
            await expect(dialog).to_contain_text("采集 2026-09-21T00:00:00Z")
            await dialog.get_by_role("heading", name="第一页").wait_for()  # Markdown rendered

            # raw view toggle
            await dialog.get_by_role("button", name="查看原文").click()
            await expect(dialog.get_by_text("# 第一页", exact=False)).to_be_visible()

            # closing the preview leaves the retrieval scope unchanged
            await dialog.get_by_role("button", name="关闭 ✕").click()
            await expect(page.get_by_role("dialog", name=re.compile("文档预览"))).to_have_count(0)
            await page.get_by_role("button", name="返回对话").click()
            await expect(page.get_by_text("资料范围：全部")).to_be_visible()

            assert not errors, errors
            print(f"PASS: U7 preview + multi-page continuation + metadata + raw toggle + scope unchanged ({len(reads)} reads)")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
