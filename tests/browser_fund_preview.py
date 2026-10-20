"""Offline browser acceptance: selected-corpus PDF preview and citation page jump."""

import asyncio
import json
import re
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect

from tests.browser_support import FrontendHandler

CORPUS = {"id": "fund", "name": "基金演示库", "kind": "fund", "domain": "基金",
          "rel_path": "fund", "docs_count": 1, "preparation": "ready", "is_default": True,
          "index_progress": None, "job": None}
PDF = {"doc_id": "d-fund", "title": "2022_2025_U21A20383_林天歆_演示.pdf",
       "origin": "2022_2025_U21A20383_林天歆_演示.pdf",
       "rel_path": "2022_2025_U21A20383_林天歆_演示.pdf", "version": "v1",
       "captured_at": "2026-09-21T00:00:00Z", "kind": "pdf", "parser": "mineru", "pages": 8}
SOURCE = {"title": PDF["title"], "url": "", "snippet": "证据片段", "doc_id": PDF["doc_id"],
          "version": PDF["version"], "page": 3, "citation": 1}
STALE_SOURCE = {**SOURCE, "doc_id": "d-stale", "title": "已更新报告.pdf", "version": "old-version", "citation": 2}
MISSING_SOURCE = {**SOURCE, "doc_id": "missing-doc", "title": "已移除的报告.pdf", "citation": 3}


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(FrontendHandler, directory=str(root / "frontend/dist")))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    sessions: dict[str, dict] = {}
    chat_bodies: list[dict] = []
    preview_file_status = 200
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1400, "height": 1000})
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            async def corpora(route):
                await route.fulfill(json=[CORPUS])

            async def documents(route):
                await route.fulfill(json=[PDF, {**PDF, "doc_id": "d-stale", "title": "已更新报告.pdf"}] if "corpus=fund" in route.request.url else [])

            async def file_response(route):
                await route.fulfill(status=preview_file_status, content_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="基金报告.pdf"'} if preview_file_status == 200 else {},
                    body=b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF")

            async def workspace(route):
                if route.request.method == "PUT":
                    body = route.request.post_data_json
                    sid = route.request.url.rsplit("/", 1)[-1]
                    item = {"id": sid, "revision": sessions.get(sid, {}).get("revision", 0) + 1,
                            "title": body["title"], "data": body["data"]}
                    sessions[sid] = item
                    await route.fulfill(json=item)
                else:
                    await route.fulfill(json=list(sessions.values()))

            async def chat(route):
                chat_bodies.append(route.request.post_data_json)
                body = ('event: sources\ndata: ' + json.dumps([SOURCE, STALE_SOURCE, MISSING_SOURCE], ensure_ascii=False) + '\n\n'
                        'event: token\ndata: {"text":"结论 [1] [2] [3]"}\n\n'
                        'event: done\ndata: {"ok":true}\n\n')
                await route.fulfill(status=200, content_type="text/event-stream", body=body)

            # Login exists since query 2026-1013 1133; offline scripts run as a signed-in administrator.
            await page.route("**/api/auth/session", lambda r: r.fulfill(json={"authenticated": True, "username": "admin", "role": "admin", "guides_seen": ["home", "leader", "chat", "library", "tasks", "review", "intelligence"]}))
            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route(re.compile(r".*/api/corpora/[^/]+/files.*$"), lambda r: r.fulfill(json={"source_dir": "/tmp/.knowledge/fund/source", "files": [], "misplaced_files": []}))
            await page.route(re.compile(r".*/api/corpora(?:\?.*)?$"), corpora)
            await page.route(re.compile(r".*/api/documents(?:\?.*)?$"), documents)
            await page.route("**/api/documents/d-fund/file*", file_response)
            await page.route("**/api/workspace/sessions", workspace)
            await page.route("**/api/workspace/sessions/*", workspace)
            await page.route("**/api/tasks**", lambda r: r.fulfill(json=[]))
            await page.route("**/api/chat", chat)

            async with page.expect_response(lambda response: "/api/documents/d-fund/file?" in response.url) as file_response_info:
                await page.goto(origin + "/library/fund/documents/d-fund?version=v1")
            file_response = await file_response_info.value
            preview = page.get_by_role("dialog", name=re.compile("文档预览"))
            await expect(preview).to_be_visible()
            frame = preview.locator("iframe")
            await expect(frame).to_be_visible()
            src = await frame.get_attribute("src")
            assert "/api/documents/d-fund/file" in src and "corpus=fund" in src, src
            disposition = file_response.headers.get("content-disposition", "")
            assert file_response.status == 200 and disposition.startswith("inline"), (file_response.status, disposition)
            await preview.get_by_role("button", name="关闭 ✕").click()

            for status, expected in ((404, "原文件已缺失或已移动"), (422, "文档已更新")):
                preview_file_status = status
                await page.goto(origin + "/library/fund/documents/d-fund?version=v1")
                preview = page.get_by_role("dialog", name=re.compile("文档预览"))
                await expect(preview.get_by_role("alert")).to_contain_text(expected)
                await expect(preview.locator("iframe")).to_have_count(0)
                await preview.get_by_role("button", name="关闭 ✕").click()
            preview_file_status = 200

            await page.get_by_role("link", name="对话工作台", exact=True).click()
            await page.get_by_role("textbox", name="问题", exact=True).fill("这个项目的结论是什么？")
            await page.get_by_role("button", name="发送 ↑").click()
            stale_citation = page.get_by_role("button", name="[2]", exact=True).last
            await stale_citation.click()
            await expect(page.get_by_role("alert")).to_contain_text("引用文档已更新")
            await expect(page.get_by_role("dialog",name=re.compile("文档预览"))).to_have_count(0)
            await page.reload()
            await expect(page.get_by_role("button", name="[1]", exact=True).first).to_be_visible()
            citation = page.get_by_role("button", name="[1]", exact=True).first
            await citation.click()
            preview = page.get_by_role("dialog", name=re.compile("文档预览"))
            await expect(preview).to_be_visible()
            page3 = await preview.locator("iframe").get_attribute("src")
            assert "#page=3" in page3, page3
            assert chat_bodies and chat_bodies[-1].get("corpus_ids") == ["fund"], chat_bodies
            await preview.get_by_role("button", name="关闭 ✕").click()
            await page.get_by_role("button", name="[3]", exact=True).last.click()
            await expect(page.get_by_role("alert")).to_contain_text("引用文档已移除或尚未完成索引")
            await page.set_viewport_size({"width": 390, "height": 844})
            await page.keyboard.press("Escape")
            await expect(page.get_by_role("dialog", name=re.compile("文档预览"))).to_have_count(0)
            await expect(page.get_by_role("textbox", name="问题", exact=True)).to_be_visible()
            assert not errors, errors
            print("PASS: fund corpus select/confirm -> inline PDF preview in same corpus -> citation opens physical page 3")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
