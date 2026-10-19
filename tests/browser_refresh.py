"""Offline browser acceptance: overview refresh observability (KM-S4).

Three mocked corpora, one failing and one partially failing. Verifies that the refresh button
reports the corpus currently being processed, continues after a failure, and lists the failed
libraries with reasons. Reuses the built `frontend/dist` and mock APIs; no backend or model.
"""

import asyncio
import re
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect

from tests.browser_support import FrontendHandler


def corpus(cid: str, name: str) -> dict:
    return {"id": cid, "name": name, "kind": "demo", "domain": "x", "rel_path": cid,
            "docs_count": 0, "source_count": 1, "indexed_count": 0, "pending_count": 1,
            "failed_count": 0, "preparation": "empty", "is_default": False,
            "index_progress": None, "job": None}


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(FrontendHandler, directory=str(root / "frontend/dist")))
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

            # Login exists since query 2026-1013 1133; offline scripts run as a signed-in administrator.
            await page.route("**/api/auth/session", lambda r: r.fulfill(json={"authenticated": True, "username": "admin", "role": "admin", "guides_seen": ["home", "leader", "chat", "library", "tasks", "review", "intelligence"]}))
            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route(re.compile(r".*/api/documents(\?.*)?$"), lambda r: r.fulfill(json=[]))
            await page.route(re.compile(r".*/api/corpora/[^/]+/ingest(?:\?.*)?$"), ingest)
            await page.route(re.compile(r".*/api/corpora(\?.*)?$"), list_corpora)
            await page.route("**/api/tasks**", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions/*", lambda r: r.fulfill(json={**r.request.post_data_json, "id": r.request.url.rsplit("/", 1)[-1]}))

            await page.route(re.compile(r".*/api/corpora/[^/]+/files.*$"), lambda r: r.fulfill(json={"source_dir":"/tmp/source", "files":[], "misplaced_files":[]}))
            # Refresh is now explicitly per library; the old global-refresh action is gone.
            for cid, message in (("a","最近刷新"),("b","刷新失败，现有索引保留"),("c","部分完成：1 项失败")):
                await page.goto(origin + "/library/" + cid + "/documents")
                await page.get_by_role("button",name="管理 ▾",exact=True).click()
                await page.get_by_role("menuitem",name="刷新本库",exact=True).click()
                await expect(page.get_by_role("status").filter(has_text=message)).to_be_visible()
            await page.goto(origin + "/library/d/documents")
            await page.get_by_role("button",name="管理 ▾",exact=True).click()
            await expect(page.get_by_role("menuitem",name="刷新本库",exact=True)).to_be_disabled()
            assert ingest_requests == ["a","b","c"], ingest_requests
            assert not errors, errors
            print("PASS: per-library refresh, failure and partial state, later libraries unaffected, running job cannot be restarted")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
