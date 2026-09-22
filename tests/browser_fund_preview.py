"""Live browser acceptance: fund corpus selection, inline PDF preview, citation jump.

Requires a running server (TEST_BASE_URL, default http://127.0.0.1:8000) that has a
corpus of local PDFs (the fund corpus). `/api/chat` is mocked so no model call is spent.
"""

import asyncio
import json
import os
import re

import httpx
from playwright.async_api import async_playwright, expect


async def main():
    base = os.getenv("TEST_BASE_URL", "http://127.0.0.1:8000")
    client = httpx.Client(base_url=base, timeout=30, trust_env=False)
    fund = next(c for c in client.get("/api/corpora").json() if c["kind"] == "fund")
    pdf = next(d for d in client.get("/api/documents", params={"corpus": fund["id"]}).json() if d["kind"] == "pdf")
    source = {"title": pdf["title"], "url": "", "snippet": "证据片段", "doc_id": pdf["doc_id"],
              "version": pdf["version"], "page": 3, "citation": 1}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1400, "height": 1000})
        errors: list[str] = []
        responses: list[tuple[str, int, str]] = []
        chat_bodies: list[dict] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("response", lambda r: responses.append((r.url, r.status, r.headers.get("content-disposition", ""))) if "/file" in r.url else None)

        async def chat(route):
            chat_bodies.append(route.request.post_data_json)
            await route.fulfill(
                status=200, content_type="text/event-stream",
                body='event: sources\ndata: ' + json.dumps([source]) + '\n\nevent: token\ndata: {"text":"结论 [1]"}\n\nevent: done\ndata: {"ok":true}\n\n')

        await page.route("**/api/chat", chat)

        await page.goto(base)
        # wait for the registry and session restore, then select the fund corpus
        await expect(page.get_by_role("button", name=re.compile(re.escape(fund["name"]))).first).to_be_visible()
        await expect(page.get_by_role("button", name="＋ 新的问答")).to_be_enabled()
        await page.get_by_role("button", name=re.compile(re.escape(fund["name"]))).first.click()
        await expect(page.get_by_text(re.compile("库：" + re.escape(fund["name"])))).to_be_visible()
        # the document list must re-scope before we browse it
        await expect(page.get_by_role("button", name=re.compile(f"文献库 · {len(client.get('/api/documents', params={'corpus': fund['id']}).json())} 份"))).to_be_visible()

        # open the library, the fund corpus detail, then a PDF document
        await page.get_by_role("button", name=re.compile("文献库")).first.click()
        await page.get_by_role("button", name=re.compile(re.escape(fund["name"]))).first.click()
        detail = page.get_by_role("dialog", name=re.compile(re.escape(fund["name"])))
        await expect(detail).to_be_visible()
        await detail.get_by_role("button", name=re.compile(re.escape(pdf["title"]))).first.click()
        dialog = page.get_by_role("dialog", name=re.compile("文档预览"))
        await expect(dialog).to_be_visible()
        frame = dialog.locator("iframe")
        await expect(frame).to_be_visible()
        src = await frame.get_attribute("src")
        assert "/api/documents/" in src and "/file" in src and "corpus=" in src, src
        # wait for the /file response captured above
        for _ in range(50):
            if responses:
                break
            await page.wait_for_timeout(100)
        assert responses, "no /file response captured"
        url, status, disposition = responses[-1]
        assert status == 200, (url, status)
        assert disposition.startswith("inline"), disposition
        await dialog.get_by_role("button", name="关闭 ✕").click()

        # citation [1] opens the same PDF at page 3
        await page.get_by_role("button", name="返回对话").click()
        await page.get_by_role("textbox", name="问题", exact=True).fill("这个项目的结论是什么？")
        await page.get_by_role("button", name="发送 ↑").click()
        citation = page.get_by_role("button", name="[1]", exact=True).first
        await citation.click()
        await expect(page.get_by_role("dialog", name=re.compile("文档预览"))).to_be_visible()
        page3 = await page.get_by_role("dialog", name=re.compile("文档预览")).locator("iframe").get_attribute("src")
        assert "#page=3" in page3, page3

        assert not errors, errors
        assert chat_bodies and chat_bodies[-1].get("corpus_id") == fund["id"], chat_bodies[-1] if chat_bodies else None
        print("PASS: fund corpus select -> library PDF preview (inline) -> citation [1] jumps to page 3; chat carries corpus_id")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
