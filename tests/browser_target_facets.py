"""Offline browser acceptance: the four-facet (target) flow.

Serves the built `frontend/dist` with mocked APIs. Verifies:
- the four facet labels keep 有内容 / 未提及 / 提取异常 / 未处理 apart, and stale reports say 待更新;
- a `pdf_page` citation opens the full preview on that page and closing it returns to the report's
  facet section;
- a `parsed_text` citation opens the normalized body with the quote highlighted and scrolled into
  view, and closing it returns to the same facet section;
- deep links, deduplicated filters, read-only comparison and new scoped research sessions;
- stopping progress viewing leaves the job running and a manual query remains available.

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
ERROR_DOC = "d5"
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
        "version": VERSION_TEXT if doc_id == TEXT_DOC else VERSION_PDF,
        "schema_version": 1, "prompt_version": 1,
        "process": {"status": status, "coverage": coverage},
        "facets": {key: {"state": state, "items": (
            [{"id": "s1", "name": "临床诊疗", "desc": "诊疗场景"},
             {"id": "s2", "name": "临床诊疗", "desc": "不同限定的同名条目"}]
            if key == "场景" and state == "has" else
            [{"id": "o1", "name": "原型系统", "desc": "形成原型", "status": "已取得"}]
            if key == "成果" and state == "has" else [])} for key, state in facets.items()},
        "stale": stale, "message": "",
    }


REPORTS = [
    report(ERROR_DOC, "未完成资料.md", "未完成", {"processed": 1, "total": 2},
           {"场景": "has", "问题": "未提及", "技术": "异常", "成果": "未提及"}),
    report(PDF_DOC, "示例报告.pdf", "已完成", {"processed": 3, "total": 3},
           {"场景": "has", "问题": "未提及", "技术": "has", "成果": "has"}),
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
        "process": {"status": "已完成", "coverage": {"processed": 3, "total": 3}},
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
            {"key": "技术", "state": "has", "items": [{"id": "t1", "name": "深度学习", "desc": "诊疗方法", "evidence": []}]},
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


for item in REPORTS:
    if item["doc_id"] in (PDF_DOC, TEXT_DOC):
        detail = detail_pdf() if item["doc_id"] == PDF_DOC else detail_text()
        for facet in detail["facets"]:
            item["facets"][facet["key"]]["items"] = [
                {key: value for key, value in entry.items() if key != "evidence"}
                for entry in facet["items"]]
        # Repeated names within one document still count as one document.
        item["facets"]["场景"]["items"].append({"id": "s2", "name": "临床诊疗", "desc": "另一个条件"})


class AppHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith(("/library", "/chat", "/tasks", "/artifacts", "/prompts")):
            self.path = "/index.html"
        super().do_GET()


async def main():
    root = Path(__file__).resolve().parents[1]
    dist = Path(os.environ.get("DOX_WEB_DIST") or root / "frontend/dist")
    server = ThreadingHTTPServer(("127.0.0.1", 0),
                                 partial(AppHandler, directory=str(dist)))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"

    saved_sessions = {}
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
                await r.fulfill(json=REPORTS if "/c1/" in r.request.url else [])

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
                session_id = r.request.url.rsplit("/", 1)[-1]
                saved_sessions[session_id] = {**body, "id": session_id, "revision": 1}
                await r.fulfill(json=saved_sessions[session_id])

            await page.route("**/api/health", lambda r: r.fulfill(
                json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route("**/api/tasks**", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions**", lambda r: r.fulfill(json=[]))
            await page.route(re.compile(r".*/api/workspace/sessions/[^/]+$"), save_session)
            await page.route("**/api/official-docs", lambda r: r.fulfill(
                json={"status": "idle", "errors": []}))
            await page.route(re.compile(r".*/api/corpora(\?.*)?$"), lambda r: r.fulfill(json=corpora + [{**corpora[0], "id": "c2", "name": "空库", "rel_path": "c2"}]))
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
            await page.get_by_role("button", name="四维浏览", exact=True).first.click()
            await expect(page.get_by_text("四维浏览 · 报告单元 5 份")).to_be_visible()

            # ---- ① 四种状态必须彼此分开 -------------------------------------------
            await expect(page.get_by_text("场景：有内容").first).to_be_visible()
            await expect(page.get_by_text("技术：提取异常").first).to_be_visible()
            await expect(page.get_by_text("问题：未提及").first).to_be_visible()
            await expect(page.get_by_text("场景：未处理").first).to_be_visible()
            await expect(page.get_by_label("四维资料列表").get_by_text("待更新", exact=True)).to_be_visible()
            await expect(page.get_by_text("处理覆盖 3/3 段")).to_be_visible()

            # ---- ② pdf_page 证据：跳到第 3 页，关闭后回到该报告的四维分区 -----------
            await page.get_by_role("listitem").filter(
                has_text="示例报告.pdf").get_by_role("button", name="场景：有内容").click()
            await expect(page.get_by_text("提取记录的原文关联（场景）")).to_be_visible()
            await page.get_by_role("button", name=re.compile("第 3 页")).click()
            panel = page.get_by_label(re.compile("文档预览：示例报告.pdf"))
            await expect(panel).to_be_visible()
            await expect(panel.get_by_text(re.compile("第 3 页"))).to_be_visible()
            assert "#page=3" in await panel.locator("iframe").get_attribute("src"), "PDF 未跳到第 3 页"
            await page.get_by_label("关闭 ✕").click()
            await expect(panel).to_be_hidden()
            await expect(page.get_by_text("提取记录的原文关联（场景）")).to_be_visible()

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
            await expect(page.get_by_text("四维浏览 · 报告单元 5 份")).to_be_visible()

            # Deep-link refresh retains the selected document, facet and filter.
            await page.get_by_label("场景筛选").select_option("临床诊疗")
            await expect(page.get_by_text(re.compile("筛选命中 2 份 · 已选 0 份"))).to_be_visible()
            assert await page.get_by_label("场景筛选").locator("option[value='临床诊疗']").inner_text() == "临床诊疗（2 份）"
            await page.reload()
            await expect(page.get_by_label("场景筛选")).to_have_value("临床诊疗")
            await expect(page.get_by_role("button", name=re.compile("解析正文位置"))).to_be_visible()
            await page.get_by_role("button", name="选中筛选结果").click()
            await page.get_by_role("button", name="只读对照", exact=True).click()
            comparison = page.get_by_label("四维只读对照")
            await expect(comparison).to_be_visible()
            await expect(comparison.get_by_text("原型系统 · 已取得")).to_be_visible()
            await expect(comparison.get_by_text("原文未提及").first).to_be_visible()
            # The task is a separate session with exactly these documents, never the whole corpus.
            await page.get_by_label("研究问题", exact=True).fill("比较临床诊疗技术的条件与成果")
            await page.get_by_role("button", name="生成对比分析", exact=True).click()
            await expect(page).to_have_url(re.compile(r"/chat$"))
            scoped = [value for value in saved_sessions.values() if value.get("data", {}).get("task_id") == "task2"]
            assert scoped and sorted(scoped[-1]["data"]["options"]["allowed_doc_ids"]) == [PDF_DOC, TEXT_DOC]
            assert scoped[-1]["data"]["corpus_ids"] == [CORPUS_ID]
            assert scoped[-1]["data"]["turns"] == []
            await page.go_back()
            await expect(page.get_by_label("场景筛选")).to_have_value("临床诊疗")

            # Polling is visible-view scoped. Stop watching is not cancellation.
            row = page.get_by_label("四维资料列表").get_by_role("listitem").filter(has_text="示例报告.pdf")
            await row.get_by_role("checkbox").check()
            await page.get_by_role("button", name=re.compile("生成四维信息")).click()
            await expect(page.get_by_text(re.compile("提取中 · 已完成"))).to_be_visible()
            await page.get_by_role("button", name="停止查看进度").click()
            await expect(page.get_by_text("仍在处理：已停止自动刷新，可点击“继续查看状态”查看最新进度")).to_be_visible()
            await page.get_by_role("button", name="对话", exact=True).click()
            await page.go_back()
            await expect(page.get_by_role("button", name="继续查看状态")).to_be_visible()
            job.update(status="done", completed=1)
            before = len(reports_calls)
            await page.get_by_role("button", name="继续查看状态").click()
            await expect(page.get_by_text(re.compile("提取已结束 · 已完成 1 / 共 1"))).to_be_visible()
            assert len(reports_calls) > before

            # A late response from the old corpus cannot replace the new corpus query.
            async def delayed_reports(r):
                await asyncio.sleep(0.25)
                try:
                    await r.fulfill(json=REPORTS)
                except Exception:
                    pass  # An aborted GET is expected when its view unmounts.
            await page.route(re.compile(r".*/api/corpora/c1/reports$"), delayed_reports)
            await page.get_by_role("button", name="刷新四维列表").click()
            await page.get_by_role("button", name="返回知识库列表").click()
            await page.get_by_role("button", name="四维浏览", exact=True).nth(1).click()
            await expect(page.get_by_text("四维浏览 · 报告单元 0 份")).to_be_visible()
            await page.wait_for_timeout(400)
            await expect(page.get_by_text("四维浏览 · 报告单元 0 份")).to_be_visible()

            assert not page_errors, page_errors
            await browser.close()
    finally:
        server.shutdown()

    print("browser acceptance: target facets OK")


if __name__ == "__main__":
    asyncio.run(main())
