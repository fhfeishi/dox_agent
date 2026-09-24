"""Real API/browser flow for two isolated URL previews and a cited run snapshot."""

import asyncio
import re
import socket
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

import uvicorn
from playwright.async_api import async_playwright, expect

import src.main as main_module
from src.agent.config import Settings
from src.agent.corpora import corpus_id_for
from src.knowledge import Document, Knowledge, Page
from src.main import create_app


def start_server(app):
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=listener.getsockname()[1],
                                           log_level="error", lifespan="on"))
    thread = Thread(target=lambda: asyncio.run(server.serve(sockets=[listener])), daemon=True)
    thread.start()
    return f"http://127.0.0.1:{listener.getsockname()[1]}", server, thread, listener


class WebGraph:
    async def astream(self, state, **kwargs):
        web = state["web_snapshots"][0]
        yield {"event": "sources", "data": [{"citation": 1, "kind": "web",
            "snapshot_id": web["web_snapshot_id"], "url": web["url"],
            "fetched_at": web["fetched_at"], "version": web["version"],
            "title": web["title"], "snippet": web["markdown"][:100]}]}
        yield {"event": "token", "data": {"text": "网页结论 [1]"}}
        yield {"event": "done", "data": {"ok": True}}


async def main():
    with TemporaryDirectory(prefix="dox-web-") as directory:
        root = Path(directory)
        for name in ("alpha", "beta"):
            (root / ".knowledge" / name).mkdir(parents=True)
        settings = Settings(_env_file=None, corpora_root=root / ".knowledge", state_dir=root / "state",
                            auto_import_official=False)
        store = Knowledge(root / ".knowledge" / "alpha" / "datadb" / "knowledge.sqlite3", settings=settings)
        store.put(Document(title="本地资料", origin="local", kind="text", parser="text",
                           pages=[Page(number=1, text="本地资料")]))
        beta_id = corpus_id_for("beta")

        async def fake_page(url, settings):
            name = url.rsplit("/", 1)[-1]
            return Document(title=name, origin=url, kind="web", parser="offline",
                            pages=[Page(number=1, text="网页正文 " + name)], markdown="网页正文 " + name)

        main_module.parse_web = fake_page
        app = create_app(settings, store, lambda *_: WebGraph())
        origin, server, thread, listener = start_server(app)
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 950})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))

                # Given two URLs, when both are previewed, neither replaces the other.
                await page.goto(origin)
                await page.get_by_title("任务 / 附件").click()
                await page.get_by_role("button", name=re.compile("指定网址")).click()
                for name in ("one", "two"):
                    await page.get_by_role("textbox", name="指定网址").fill(f"https://example.com/{name}")
                    await page.get_by_role("button", name="预览网页").click()
                    await expect(page.get_by_text(f"{name} · https://example.com/{name}")).to_be_visible()
                first = page.get_by_text("one · https://example.com/one").locator("..")
                second = page.get_by_text("two · https://example.com/two").locator("..")

                # When the first goes to a non-first corpus, the second can still bind to this run.
                await first.get_by_role("combobox", name="网页目标知识库").select_option(beta_id)
                await first.get_by_role("button", name="加入所选知识库").click()
                await expect(second).to_be_visible()
                await second.get_by_role("button", name="仅用于本次运行").click()
                await expect(page.get_by_label("本次运行配置")).to_contain_text("1 个指定网址快照")
                docs = await page.request.get(f"{origin}/api/documents?corpus={beta_id}")
                assert len(await docs.json()) == 1

                # Then the answer cites the persisted snapshot and opens its saved body.
                await page.get_by_role("textbox", name="问题", exact=True).fill("网页说了什么？")
                await page.get_by_role("button", name="发送 ↑").click()
                await expect(page.get_by_text("网页结论", exact=True)).to_be_visible()
                await page.get_by_role("button", name=re.compile("two")).last.click()
                await expect(page.get_by_text("已确认网页快照")).to_be_visible()
                await expect(page.get_by_text("网页正文 two")).to_be_visible()
                assert not errors, errors
                await browser.close()
            print("PASS: two URL previews, non-first corpus import, run-bound snapshot and source preview")
        finally:
            server.should_exit = True
            thread.join(timeout=5)
            listener.close()


if __name__ == "__main__":
    asyncio.run(main())
