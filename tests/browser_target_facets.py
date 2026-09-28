"""Offline browser acceptance: the four-facet (target) flow.

Serves the built `frontend/dist` with mocked APIs. Verifies:
- the four facet labels keep 有内容 / 未提及 / 提取异常 / 未处理 apart, and stale reports say 待更新;
- a `pdf_page` citation opens the full preview on that page and closing it returns to the report's
  facet section;
- a `parsed_text` citation opens the normalized body with the quote highlighted and scrolled into
  view, and closing it returns to the same facet section;
- a polling window that ends while the job is still running reports "仍在处理" and offers a manual
  status check instead of claiming success or failure.

`uiFlags.docPanel` is a build-time switch (`VITE_UI_DOC_PANEL`), so the two document-panel
variants are two builds. Point `DOX_WEB_DIST` at another build to run the same acceptance against
it; evidence clicks must behave identically in both because the facet evidence path never branches
to the document explorer.
"""

import asyncio
import os
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect

# Playwright needs a local working directory on Windows/WSL interop; the browser cache and the
# driver refuse a UNC cwd. Nothing else in this file depends on it.
CORPUS_ID = "c1"
PDF_DOC = "d1"
TEXT_DOC = "d3"
STALE_DOC = "d2"
UNTREATED_DOC = "d4"
JOB_ID = "job-1"

# 正文：引文必须逐字出现在这里，否则定位组件会如实报告“找不到”。
PDF_QUOTE = "临床诊疗场景"
TEXT_BODY = "# 示例综述\n\n一、概述\n\n临床诊疗场景存在病灶识别困难，项目采用深度学习并形成原型系统。\n"

# 浏览器可执行文件：默认用 Playwright 自带的 revision；本机缓存版本不一致时用它指向已有
# Chromium，不必重新下载浏览器。
BROWSER = os.environ.get("DOX_BROWSER_EXECUTABLE") or None

VERSION_PDF = "pdfv0001aaaaaaaa"
VERSION_TEXT = "txtv0001bbbbbbbb"


def report(doc_id, title, status, coverage, facets, *, stale=False):
    return {
        "doc_id": doc_id, "title": title, "source_name": f"source/{title}", "index_status": "indexed",
        "process": {"status": status, "coverage": coverage},
        "facets": {key: {"state": state} for key, state in facets.items()},
        "stale": stale, "message": "",
    }


REPORTS = [
    report(PDF_DOC, "示例报告.pdf", "已完成", {"processed": 3, "total": 4},
           {"场景": "has", "问题": "未提及", "技术": "异常", "成果": "has"}),
    report(TEXT_DOC, "示例综述.md", "已完成", {"processed": 2, "total": 2},
           {"场景": "has", "问题": "未提及", "技术": "未提及", "成果": "未提及"}),
    report(STALE_DOC, "旧报告.md", "已完成", {"processed": 1, "total": 1},
           {"场景": "has", "问题": "未提及", "技术": "未提及", "成果": "未提及"}, stale=True),
    report(UNTREATED_DOC, "未处理资料.md", "未处理", {"processed": 0, "total": 2},
           {"场景": "未提及", "问题": "未提及", "技术": "未提及", "成果": "未提及"}),
]


def detail_pdf():
    return {
        "doc_id": PDF_DOC, "version": VERSION_PDF, "source_hash": "h1", "schema_version": 1,
        "prompt_version": 1, "model": "offline", "generated_at": "2026-09-28T00:00:00Z",
        "process": {"status": "已完成", "coverage": {"processed": 3, "total": 4}},
        "facets": [
            {"key": "场景", "state": "has", "items": [{
                "id": "s1", "name": "临床诊疗", "desc": "用于临床诊疗流程。",
                "evidence": [
                    {"version": VERSION_PDF, "locator": {"basis": "pdf_page", "page": 3},
                     "quote": PDF_QUOTE},
                    {"version": VERSION_PDF,
                     "locator": {"basis": "parsed_text", "start_char": 12, "end_char": 20,
                                 "heading": "一、概述"},
                     "quote": "病灶识别困难"},
                ]}]},
            {"key": "问题", "state": "未提及", "items": []},
            {"key": "技术", "state": "异常", "items": []},
            {"key": "成果", "state": "has", "items": [{
                "id": "o1", "name": "原型系统", "desc": "已形成原型。", "status": "已取得",
                "evidence": [{"version": VERSION_PDF,
                              "locator": {"basis": "pdf_page", "page": 5},
                              "quote": "形成原型系统"}]}]},
        ],
        "relations": [{"from": {"dimension": "场景", "item_id": "s1"},
                       "to": {"dimension": "成果", "item_id": "o1"}, "basis": "原文明示"}],
        "title": "示例报告", "source_name": "source/示例报告.pdf",
        "document": {"doc_id": PDF_DOC, "title": "示例报告.pdf", "origin": "示例报告.pdf",
                     "version": VERSION_PDF, "captured_at": "2026-09-28T00:00:00Z",
                     "kind": "pdf", "parser": "mineru", "pages": 8},
    }


def detail_text():
    payload = detail_pdf()
    payload.update(doc_id=TEXT_DOC, version=VERSION_TEXT, title="示例综述",
                   source_name="source/示例综述.md",
                   document={"doc_id": TEXT_DOC, "title": "示例综述.md", "origin": "示例综述.md",
                             "version": VERSION_TEXT, "captured_at": "2026-09-28T00:00:00Z",
                             "kind": "text", "parser": "markdown", "pages": 1})
    payload["facets"] = [
        {"key": "场景", "state": "has", "items": [{
            "id": "s1", "name": "临床诊疗", "desc": "用于临床诊疗流程。",
            "evidence": [{"version": VERSION_TEXT,
                          "locator": {"basis": "parsed_text", "start_char": 12, "end_char": 20,
                                      "heading": "一、概述"},
                          "quote": PDF_QUOTE}]}]},
        {"key": "问题", "state": "未提及", "items": []},
        {"key": "技术", "state": "未提及", "items": []},
        {"key": "成果", "state": "未提及", "items": []},
    ]
    payload["relations"] = []
    return payload


async def main():
    root = Path(__file__).resolve().parents[1]
    dist = Path(os.environ.get("DOX_WEB_DIST") or root / "frontend/dist")
    server = ThreadingHTTPServer(("127.0.0.1", 0),
                                 partial(SimpleHTTPRequestHandler, directory=str(dist)))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"

    job_polls: list[str] = []
    reports_calls: list[int] = []
    job = {"job_id": JOB_ID, "corpus_id": CORPUS_ID, "status": "running",
           "completed": 0, "total": 1, "errors": []}

    corpora = [{"id": CORPUS_ID, "name": "演示库", "kind": "demo", "domain": "x",
                "rel_path": CORPUS_ID, "docs_count": len(REPORTS), "preparation": "ready",
                "is_default": True, "index_progress": None, "job": None, "source_count": 4,
                "indexed_count": 4, "pending_count": 0, "failed_count": 0}]

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, executable_path=BROWSER)
            page = await browser.new_page(viewport={"width": 1440, "height": 950})
            page_errors: list[str] = []
            page.on("pageerror", lambda error: page_errors.append(str(error)))

            async def reports(r):
                reports_calls.append(1)
                await r.fulfill(json=REPORTS)

            async def detail(r):
                doc_id = r.request.url.split("/reports/", 1)[1].split("/", 1)[0]
                await r.fulfill(json=detail_text() if doc_id == TEXT_DOC else detail_pdf())

            async def start_extraction(r):
                job_polls.clear()
                await r.fulfill(status=202, json=job)

            async def job_status(r):
                job_polls.append(job["status"])
                await r.fulfill(json=job)

            async def markdown(r):
                await r.fulfill(json={"text": TEXT_BODY, "version": VERSION_TEXT})

            async def pdf_file(r):
                await r.fulfill(status=200, content_type="application/pdf",
                                headers={"Content-Disposition": "inline; filename=x.pdf"},
                                body=b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF")

            async def save_session(r):
                # 启动时会保存一个空会话记录；这里必须回显请求体，否则会话列表里会出现没有
                # `.data` 的元素，侧栏渲染直接崩。
                body = r.request.post_data_json or {}
                await r.fulfill(json={**body, "id": r.request.url.rsplit("/", 1)[-1]})

            await page.route("**/api/health", lambda r: r.fulfill(
                json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route("**/api/tasks**", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions**", lambda r: r.fulfill(json=[]))
            await page.route(re.compile(r".*/api/workspace/sessions/[^/]+$"), save_session)
            await page.route("**/api/official-docs", lambda r: r.fulfill(
                json={"status": "idle", "errors": []}))
            await page.route(re.compile(r".*/api/corpora(\?.*)?$"), lambda r: r.fulfill(json=corpora))
            await page.route(re.compile(r".*/api/corpora/[^/]+/files.*$"),
                             lambda r: r.fulfill(json={"source_dir": "/tmp", "files": [],
                                                       "misplaced_files": []}))
            await page.route(re.compile(r".*/api/corpora/[^/]+/reports$"), reports)
            await page.route(re.compile(r".*/api/corpora/[^/]+/reports/[^/]+/target$"), detail)
            await page.route(re.compile(r".*/api/corpora/[^/]+/target$"), start_extraction)
            await page.route(re.compile(r".*/api/corpora/[^/]+/target/jobs/[^/]+$"), job_status)
            await page.route(re.compile(r".*/api/documents(\?.*)?$"), lambda r: r.fulfill(json=[]))
            await page.route(re.compile(r".*/api/documents/[^/]+/markdown.*$"), markdown)
            await page.route(re.compile(r".*/api/documents/[^/]+/file.*$"), pdf_file)

            await page.goto(origin)
            await expect(page.get_by_text("当前对话：演示库")).to_be_visible()

            # ---- 进入库内的四维浏览 ------------------------------------------------
            await page.get_by_role("button", name="知识库", exact=True).click()
            await page.get_by_role("button", name="四维浏览", exact=True).click()
            await page.get_by_role("button", name="四维浏览", exact=True).click()
            await expect(page.get_by_text("四维浏览 · 报告单元 4 份")).to_be_visible()

            # ---- ① 四种状态必须彼此分开 -------------------------------------------
            await expect(page.get_by_text("场景：有内容").first).to_be_visible()
            await expect(page.get_by_text("技术：提取异常").first).to_be_visible()
            await expect(page.get_by_text("问题：未提及").first).to_be_visible()
            await expect(page.get_by_text("场景：未处理").first).to_be_visible()
            await expect(page.get_by_text("待更新")).to_be_visible()
            await expect(page.get_by_text("处理覆盖 3/4 段")).to_be_visible()

            # ---- ② pdf_page 证据：跳到第 3 页，关闭后回到该报告的四维分区 -----------
            await page.get_by_role("listitem").filter(
                has_text="示例报告.pdf").get_by_role("button", name="场景：有内容").click()
            await expect(page.get_by_text("原文明示关联（场景）")).to_be_visible()
            await page.get_by_role("button", name=re.compile("第 3 页")).click()
            panel = page.get_by_label(re.compile("文档预览：示例报告.pdf"))
            await expect(panel).to_be_visible()
            await expect(panel.get_by_text(re.compile("第 3 页"))).to_be_visible()
            assert "#page=3" in await panel.locator("iframe").get_attribute("src"), "PDF 未跳到第 3 页"
            await page.get_by_label("关闭 ✕").click()
            await expect(panel).to_be_hidden()
            await expect(page.get_by_text("原文明示关联（场景）")).to_be_visible()

            # ---- ③ parsed_text 证据：正文高亮 + 滚动，关闭后回到同一分区 -----------
            await page.get_by_role("listitem").filter(
                has_text="示例综述.md").get_by_role("button", name="场景：有内容").click()
            await page.get_by_role("button", name=re.compile("解析正文位置")).click()
            body = page.get_by_label(re.compile("文档预览：示例综述.md"))
            await expect(body).to_be_visible()
            mark = body.locator("mark")
            await expect(mark).to_have_text(PDF_QUOTE)
            await expect(mark).to_be_in_viewport()
            await expect(body.get_by_text(re.compile("未能在当前正文中找到该引文"))).to_have_count(0)
            await page.get_by_label("关闭 ✕").click()
            await expect(body).to_be_hidden()
            await expect(page.get_by_text("四维浏览 · 报告单元 4 份")).to_be_visible()

            # ---- ④ 轮询窗口结束但任务仍在运行 -------------------------------------
            await page.clock.install()
            row = page.get_by_role("listitem").filter(has_text="示例报告.pdf")
            await row.get_by_role("checkbox").check()
            await page.get_by_role("button", name=re.compile("生成四维信息")).click()
            await expect(page.get_by_text(re.compile("提取中 · 已完成"))).to_be_visible()

            for _ in range(260):
                if await page.get_by_text(re.compile("仍在处理")).count():
                    break
                await page.clock.fast_forward(1000)
                await asyncio.sleep(0.01)

            await expect(page.get_by_text(
                "仍在处理：已停止自动刷新，可点击“继续查看状态”查看最新进度")).to_be_visible()
            assert job_polls and set(job_polls) == {"running"}, job_polls[:5]

            job.update(status="done", completed=1)
            before = len(reports_calls)
            await page.get_by_role("button", name="继续查看状态").click()
            await expect(page.get_by_text("四维提取已结束，列表已刷新")).to_be_visible()
            assert len(reports_calls) > before, "继续查看状态后没有重新读取列表"

            assert not page_errors, page_errors
            await browser.close()
    finally:
        server.shutdown()

    print("browser acceptance: target facets OK")


if __name__ == "__main__":
    asyncio.run(main())
