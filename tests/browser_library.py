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
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect


def corpus(cid: str, name: str, *, default: bool = False) -> dict:
    docs = 1 if cid == "c2" else 0
    entry = {"id": cid, "name": name, "kind": "demo", "domain": "x", "rel_path": cid,
             "docs_count": docs, "preparation": "ready",
             "is_default": default, "index_progress": None, "job": None,
             "source_count": docs, "indexed_count": docs, "pending_count": 0, "failed_count": 0}
    if cid == "c2":
        entry.update(source_count=2, pending_count=1, description="泌尿系统肿瘤研究")
    return entry


PDF = {"doc_id": "d2", "title": "对比报告.pdf", "origin": "对比报告.pdf", "version": "v2",
       "captured_at": "2026-09-21T00:00:00Z", "kind": "pdf", "parser": "mineru", "pages": 8}


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root / "frontend/dist")))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    corpora = [corpus("c1", "A库", default=True), corpus("c2", "B库")] + [
        corpus(f"c{i}", f"{i}库") for i in range(3, 8)
    ]
    corpus_file_entries = {"c1": [], "c2": [{"rel_path": "broken.pdf", "size": 0, "status": "error", "doc_id": None}]}
    upload_requests: list[str] = []
    upload_names: list[str] = []
    ingest_requests: list[str] = []
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

            async def corpus_files(r):
                corpus_id = r.request.url.split("/api/corpora/", 1)[1].split("/", 1)[0]
                if r.request.method == "POST":
                    upload_requests.append(corpus_id)
                    match = re.search(rb'filename="([^"]+)"', r.request.post_data_buffer or b"")
                    name = match.group(1).decode() if match else "unknown"
                    upload_names.append(name)
                    if name in {"broken.pdf", "same.pdf"}:
                        await r.fulfill(status=409, json={"detail": "同名文件已存在，请改名后上传"})
                    elif name == "bad.exe":
                        await r.fulfill(status=415, json={"detail": "仅支持 md/markdown/txt/pdf/docx"})
                    else:
                        corpus_file_data = corpus_files_data(corpus_id)
                        if not any(entry["rel_path"] == name for entry in corpus_file_data):
                            corpus_file_data.append({"rel_path": name, "size": 8, "status": "new", "doc_id": None})
                        await r.fulfill(status=201, json={"rel_path": name, "errors": []})
                else:
                    await r.fulfill(json={"source_dir": f"/tmp/.knowledge/{corpus_id}/source",
                                          "files": corpus_files_data(corpus_id), "misplaced_files": []})

            async def ingest(r):
                corpus_id = r.request.url.split("/api/corpora/", 1)[1].split("/", 1)[0]
                ingest_requests.append(corpus_id)
                corpus_files_data(corpus_id)[0]["status"] = "indexed"
                await r.fulfill(json={"status": "done", "total": 1, "completed": 1, "imported": 1,
                                      "changed": 1, "errors": []})

            async def corpus_description(r):
                corpus_id = r.request.url.split("/api/corpora/", 1)[1].split("/", 1)[0]
                entry = next(item for item in corpora if item["id"] == corpus_id)
                entry["description"] = r.request.post_data_json.get("description", "")
                await r.fulfill(json=entry)

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
            def corpus_files_data(corpus_id):
                return corpus_file_entries.get(corpus_id, [])

            await page.route(re.compile(r".*/api/corpora/[^/]+/files.*$"), corpus_files)
            await page.route(re.compile(r".*/api/corpora/[^/]+/description$"), corpus_description)
            await page.route(re.compile(r".*/api/corpora/[^/]+/ingest(?:\?.*)?$"), ingest)
            await page.route("**/api/documents/d2/file*", file_response)
            await page.route(re.compile(r".*/api/documents(\?.*)?$"), documents)
            await page.route("**/api/tasks", lambda r: r.fulfill(json=[{"id": "task1", "name": "精准问答", "description": "x", "output_hint": "结论", "has_template": False}]))
            await page.route("**/api/workspace/sessions", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions/*", lambda r: r.fulfill(json={**r.request.post_data_json, "id": r.request.url.rsplit("/", 1)[-1]}))
            await page.route("**/api/official-docs", lambda r: r.fulfill(json={"status": "idle", "errors": []}))
            await page.route("**/api/chat", chat)

            await page.goto(origin)
            await expect(page.get_by_text("当前对话：A库（1/6）")).to_be_visible()

            # The six-library bound is enforced in the visible selector; the seventh stays disabled.
            await page.get_by_role("button", name="管理知识库").click()
            for cid in ("c2", "c3", "c4", "c5", "c6"):
                await page.get_by_role("checkbox", name=f"当前对话使用 {next(c['name'] for c in corpora if c['id'] == cid)}").check()
            await expect(page.get_by_text(re.compile(r"当前对话：.*（6/6）"))).to_be_visible()
            seventh = page.get_by_role("checkbox", name="当前对话使用 7库")
            assert await seventh.is_disabled()
            for cid in ("c2", "c3", "c4", "c5", "c6"):
                await page.get_by_role("checkbox", name=f"当前对话使用 {next(c['name'] for c in corpora if c['id'] == cid)}").uncheck()
            await page.get_by_role("button", name="管理知识库").click()

            # 1) library main area is a corpus grid without default-library markers
            await page.get_by_role("button", name="知识库", exact=True).click()
            await expect(page.get_by_role("button", name=re.compile("A库")).first).to_be_visible()
            await expect(page.get_by_role("button", name=re.compile("B库")).first).to_be_visible()
            assert await page.get_by_text("默认", exact=True).count() == 0
            # KM-S2: the card explains the source/index gap instead of showing a bare document count.
            await expect(page.get_by_text("已入库 1 / 源文件 2")).to_be_visible()
            await expect(page.get_by_text("待处理 1 / 失败 0")).to_be_visible()
            # W2: a user note is shown on the card, separate from the directory name.
            await expect(page.get_by_text("泌尿系统肿瘤研究")).to_be_visible()

            # Given A is the chat scope, when adding material from B's card,
            # then the upload target is B and the chat scope remains A.
            b_card = page.locator("article").filter(has_text="B库").first
            await b_card.get_by_role("button", name="添加资料").click()
            await expect(page.get_by_role("dialog", name=re.compile("B库"))).to_be_visible()
            await expect(page.locator("article").filter(has_text="A库").first.get_by_text("当前对话")).to_be_visible()
            await page.get_by_role("dialog", name=re.compile("B库")).get_by_role("button", name="关闭 ✕").click()

            # 2) opening details does not change scope; the explicit join action does.
            await page.get_by_role("button", name=re.compile("B库")).first.click()
            await expect(page.get_by_text("知识库预览", exact=True)).to_be_visible()
            await page.get_by_role("button", name="打开详情").click()
            detail = page.get_by_role("dialog", name=re.compile("B库"))
            await expect(detail).to_be_visible()
            await detail.get_by_role("button", name="加入当前对话").click()
            await expect(detail.get_by_text("当前对话使用中 · 2/6")).to_be_visible()

            # W2: the note is editable in the detail and persists through a corpora refresh.
            await detail.get_by_role("button", name="编辑说明").click()
            await detail.get_by_label("知识库说明").fill("新的研究说明")
            await detail.get_by_role("button", name="保存").click()
            await expect(detail.get_by_text("新的研究说明")).to_be_visible()

            # 3) opening a document from that corpus previews the right corpus
            await detail.get_by_role("button", name="预览").click()
            dialog = page.get_by_role("dialog", name=re.compile("文档预览"))
            await expect(dialog).to_be_visible()
            src = await dialog.locator("iframe").get_attribute("src")
            assert "/api/documents/d2/file" in src and "corpus=c2" in src, src
            await dialog.get_by_role("button", name="关闭 ✕").click()

            # 4) browsing another corpus does not change the two-library scope
            await page.get_by_role("button", name=re.compile("A库")).first.click()
            await page.get_by_role("button", name="打开详情").click()
            other = page.get_by_role("dialog", name=re.compile("A库"))
            await expect(other).to_be_visible()
            await expect(other.get_by_text("当前对话使用中 · 2/6")).to_be_visible()
            assert await page.get_by_role("heading", name="在线文档源").count() == 0
            await other.get_by_role("button", name="关闭 ✕").click()

            # File management keeps failure state visible and retries the whole library truthfully.
            await page.get_by_role("button", name=re.compile("B库")).first.click()
            await page.get_by_role("button", name="打开详情").click()
            files_detail = page.get_by_role("dialog", name=re.compile("B库"))
            file_manager = files_detail
            await expect(file_manager.get_by_text("已保存，未入库 · 解析失败")).to_be_visible()
            # W2: the merged document list can be filtered by file name.
            await file_manager.get_by_label("搜索资料").fill("不存在")
            await expect(file_manager.get_by_text("没有匹配的资料。")).to_be_visible()
            await file_manager.get_by_label("搜索资料").fill("对比")
            await expect(file_manager.get_by_text("对比报告.pdf", exact=True).first).to_be_visible()
            await file_manager.get_by_label("搜索资料").fill("")
            await file_manager.get_by_label("上传源文件").set_input_files({"name": "broken.pdf", "mimeType": "application/pdf", "buffer": b"duplicate"})
            await expect(file_manager.get_by_role("alert")).to_contain_text("broken.pdf")
            await expect(file_manager.get_by_role("alert")).to_contain_text("同名文件已存在，请改名后上传")
            await expect(file_manager.get_by_text("broken.pdf", exact=True).first).to_be_visible()

            # A batch covers all supported formats; one duplicate must not stop later files.
            batch = [
                {"name": "notes.md", "mimeType": "text/markdown", "buffer": b"# notes"},
                {"name": "same.pdf", "mimeType": "application/pdf", "buffer": b"duplicate"},
                {"name": "bad.exe", "mimeType": "application/octet-stream", "buffer": b"invalid"},
                {"name": "memo.txt", "mimeType": "text/plain", "buffer": b"memo"},
                {"name": "report.docx", "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "buffer": b"docx"},
                {"name": "appendix.markdown", "mimeType": "text/markdown", "buffer": b"# appendix"},
            ]
            await file_manager.get_by_label("上传源文件").set_input_files(batch)
            await expect(file_manager.get_by_role("alert")).to_contain_text("部分文件未能入库，其余文件已继续处理")
            await expect(file_manager.get_by_role("alert")).to_contain_text("same.pdf")
            await expect(file_manager.get_by_role("alert")).to_contain_text("bad.exe")
            await expect(file_manager.get_by_role("alert")).to_contain_text("仅支持 md/markdown/txt/pdf/docx")
            for name in ("notes.md", "memo.txt", "report.docx", "appendix.markdown"):
                await expect(file_manager.get_by_text(name).first).to_be_visible()
            await file_manager.get_by_label("上传源文件").evaluate("""input => {
              const data = new DataTransfer();
              data.items.add(new File(['dragged'], 'dropped.txt', { type: 'text/plain' }));
              input.parentElement.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
            }""")
            await expect(file_manager.get_by_text("dropped.txt", exact=True).first).to_be_visible()
            assert upload_names == ["broken.pdf", "notes.md", "same.pdf", "bad.exe", "memo.txt", "report.docx", "appendix.markdown", "dropped.txt"], upload_names
            await page.reload()
            await expect(page.get_by_text("当前对话：A库（1/6）")).to_be_visible()
            await page.get_by_role("button", name="知识库", exact=True).click()
            await page.get_by_role("button", name=re.compile("B库")).first.click()
            await page.get_by_role("button", name="打开详情").click()
            files_detail = page.get_by_role("dialog", name=re.compile("B库"))
            await files_detail.get_by_role("button", name="加入当前对话").click()
            file_manager = files_detail
            for name in ("notes.md", "memo.txt", "report.docx", "appendix.markdown", "dropped.txt"):
                await expect(file_manager.get_by_text(name).first).to_be_visible()
            await file_manager.get_by_role("button", name="重试本库待处理项").click()
            await expect(file_manager.get_by_text("已入库", exact=True).first).to_be_visible(timeout=8000)
            assert upload_requests == ["c2"] * 8 and ingest_requests == ["c2"], (upload_requests, ingest_requests)
            await files_detail.get_by_role("button", name="关闭 ✕").click()

            # 5) settings drawer no longer owns knowledge-base CRUD or sources/export
            await page.get_by_role("button", name="设置", exact=True).click()
            settings = page.get_by_role("dialog", name="设置与运维")
            await expect(settings).to_be_visible()
            assert await settings.get_by_role("button", name="新建知识库").count() == 0
            assert await settings.get_by_text("知识库管理").count() == 0
            assert await settings.get_by_text("在线文档源").count() == 0
            assert await settings.get_by_role("button", name="导出诊断 JSON").count() == 0
            await settings.get_by_role("button", name="关闭 ✕").click()

            # 6) chat sends the explicit corpus set, including a single-library array.
            await page.get_by_role("button", name="对话").first.click()
            await page.get_by_role("textbox", name="问题", exact=True).fill("对比一下")
            await page.get_by_role("button", name="发送 ↑").click()
            await expect(page.get_by_text("回答", exact=False).first).to_be_visible()
            assert chat_bodies and chat_bodies[-1].get("corpus_ids") == ["c1", "c2"], chat_bodies[-1] if chat_bodies else None

            # Given an existing two-library conversation, when starting a chat from B's card,
            # then a new conversation uses only B without altering the old one.
            await page.get_by_role("button", name="知识库", exact=True).click()
            b_card = page.locator("article").filter(has_text="B库").first
            await expect(b_card.get_by_role("button", name="刷新")).to_be_visible()
            await b_card.get_by_role("button", name="与此库对话").click()
            await expect(page.get_by_text("当前对话：B库（1/6）")).to_be_visible()
            await page.get_by_role("textbox", name="问题", exact=True).fill("只查 B 库")
            await page.get_by_role("button", name="发送 ↑").click()
            await expect(page.get_by_text("回答", exact=False).first).to_be_visible()
            assert chat_bodies[-1].get("corpus_ids") == ["c2"], chat_bodies[-1]

            # Refresh from the card scans only that library and keeps the conversation scope.
            await page.get_by_role("button", name="知识库", exact=True).click()
            await page.locator("article").filter(has_text="B库").first.get_by_role("button", name="刷新").click()
            await expect(page.get_by_role("status").filter(has_text="本库刷新完成")).to_be_visible(timeout=8000)
            assert ingest_requests[-1] == "c2" and len(ingest_requests) == 2, ingest_requests

            assert not errors, errors
            print("PASS: corpus card actions, same-library scope, mixed-format batch upload, failed import retry")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
