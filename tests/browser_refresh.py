"""Offline browser acceptance: overview refresh observability (KM-S4).

Three mocked corpora, one failing and one partially failing. Verifies that the refresh button
reports the corpus currently being processed, continues after a failure, and lists the failed
libraries with reasons. Reuses the built `frontend/dist` and mock APIs; no backend or model.
"""

import asyncio
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect


def corpus(cid: str, name: str) -> dict:
    return {"id": cid, "name": name, "kind": "demo", "domain": "x", "rel_path": cid,
            "docs_count": 0, "source_count": 1, "indexed_count": 0, "pending_count": 1,
            "failed_count": 0, "preparation": "empty", "is_default": False,
            "index_progress": None, "job": None}


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root / "frontend/dist")))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    corpora = {cid: corpus(cid, f"{cid.upper()}库") for cid in ("a", "b", "c", "d")}
    # D already has a server-side job running; refresh must attach instead of creating a new one.
    corpora["d"]["job"] = {"status": "running", "total": 1, "completed": 0, "imported": 0,
                           "changed": 0, "errors": []}
    ingest_requests: list[str] = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1440, "height": 950})
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            async def list_corpora(r):
                # Once any ingest started, the pre-existing D job finishes on its own.
                if ingest_requests:
                    corpora["d"]["job"]["status"] = "done"
                await r.fulfill(json=list(corpora.values()))

            async def ingest(r):
                cid = r.request.url.split("/api/corpora/", 1)[1].split("/", 1)[0]
                ingest_requests.append(cid)
                if cid == "b":
                    corpora[cid]["job"] = {"status": "error", "total": 1, "completed": 0, "imported": 0,
                                           "changed": 0, "errors": [{"error": "boom"}]}
                elif cid == "c":
                    corpora[cid]["job"] = {"status": "partial", "total": 2, "completed": 2, "imported": 1,
                                           "changed": 1, "errors": [{"rel_path": "broken.pdf", "error": "解析失败"}]}
                else:
                    corpora[cid]["job"] = {"status": "done", "total": 1, "completed": 1, "imported": 0,
                                           "changed": 0, "errors": []}
                await r.fulfill(json=corpora[cid]["job"])

            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route(re.compile(r".*/api/documents(\?.*)?$"), lambda r: r.fulfill(json=[]))
            await page.route(re.compile(r".*/api/corpora/[^/]+/ingest(?:\?.*)?$"), ingest)
            await page.route(re.compile(r".*/api/corpora(\?.*)?$"), list_corpora)
            await page.route("**/api/tasks**", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions/*", lambda r: r.fulfill(json={**r.request.post_data_json, "id": r.request.url.rsplit("/", 1)[-1]}))

            await page.goto(origin)
            await page.get_by_role("button", name="知识库", exact=True).click()
            await page.get_by_role("button", name="刷新并入库").click()
            # Progress is observable per corpus, not a single opaque "refreshing" state.
            await expect(page.get_by_text(re.compile(r"正在处理 .+（\d/4）"))).to_be_visible()
            # One failing corpus does not stop the later ones, and failures are named with reasons.
            await expect(page.get_by_text(re.compile(r"刷新完成：.*失败 2 项；.*B库（导入失败）.*C库（1 项解析失败）"))).to_be_visible(timeout=20000)
            # D's already-running job is attached, never re-created.
            assert ingest_requests == ["a", "b", "c"], ingest_requests
            assert not errors, errors
            print("PASS: refresh reports current corpus, continues after failure, lists failed libraries with reasons, attaches to a running job")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
