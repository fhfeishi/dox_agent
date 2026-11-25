"""Third pass: review run report, library home, and interaction states. Read-only."""
import asyncio
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.agent.config import Settings            # noqa: E402
from src.main import create_app                   # noqa: E402
from tests.browser_artifacts_live import start_server  # noqa: E402
from tests.browser_ui_shots import snapshot_corpora, SNAPSHOT  # noqa: E402
from tour import real_state, dismiss, login       # noqa: E402

SHOTS = Path(__file__).resolve().parent / "shots"


async def shot(page, name):
    await page.wait_for_timeout(400)
    await page.screenshot(path=str(SHOTS / f"i-{name}.png"))


async def main():
    snapshot_corpora()
    state_dir, user_dir = real_state()
    settings = Settings(_env_file=None, state_dir=state_dir, corpora_root=SNAPSHOT,
                        user_dir=user_dir, embedding_path="")
    app = create_app(settings)
    origin, server, thread, listener = start_server(app)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await login(page, origin, "admin")

        runs = await (await page.request.get(origin + "/api/review/runs?scope=all")).json()
        print("runs", len(runs))
        if runs:
            done = [r for r in runs if r["status"] == "completed"]
            r = (done or runs)[0]
            await page.goto(origin + "/review/runs/" + r["id"])
            await page.wait_for_timeout(2000)
            await dismiss(page)
            await shot(page, "review-run")

        gl = await (await page.request.get(origin + "/api/review/runs?scope=all")).json()

        # Library home -> first card -> files, and the new-library dialog.
        await page.goto(origin + "/library")
        await page.wait_for_timeout(2500)
        await dismiss(page)
        await shot(page, "library-home")
        card = page.get_by_role("button", name="新建资料库")
        if await card.count():
            await card.first.click()
            await shot(page, "library-new-dialog")
            await page.keyboard.press("Escape")

        # Corpus detail: 资料管理 with four-facet and a document row expanded.
        corpora = await (await page.request.get(origin + "/api/corpora")).json()
        cid = corpora[0]["id"]
        await page.goto(origin + f"/library/{cid}/documents")
        await page.wait_for_timeout(2000)
        await dismiss(page)
        await shot(page, "corpus-files")

        # Search in the library list, then the row hover state.
        field = page.get_by_placeholder("搜索项目名、批准号、负责人或文件名")
        if await field.count():
            await field.fill("肝癌")
            await page.wait_for_timeout(900)
            await shot(page, "corpus-search")
            await field.fill("")

        # Settings drawer from the model chip.
        await page.goto(origin + "/home")
        await page.wait_for_timeout(1200)
        await dismiss(page)
        chip = page.get_by_role("button", name="设置")
        if await chip.count():
            await chip.first.click()
            await shot(page, "settings-drawer")
            await page.keyboard.press("Escape")

        # Task menu open, then a task inspector.
        await page.get_by_role("button", name="存量分析 ▾").click()
        await shot(page, "menu-tasks")
        await page.keyboard.press("Escape")

        # Results: hover a row and open filters.
        await page.goto(origin + "/results")
        await page.wait_for_timeout(1500)
        await dismiss(page)
        rows = page.locator("li button")
        if await rows.count():
            await rows.first.hover()
            await shot(page, "results-hover")

        # 1280 laptop: the folded bar and a two-column library.
        await page.set_viewport_size({"width": 1280, "height": 800})
        for name, path in (("1280-home", "/home"), ("1280-results", "/results"),
                           ("1280-chat", "/chat"), ("1280-library", "/library")):
            await page.goto(origin + path)
            await page.wait_for_timeout(1600)
            await dismiss(page)
            await shot(page, name)

        if errors:
            print("ERRORS", errors[:8])
        await browser.close()
    server.should_exit = True
    thread.join(5)
    listener.close()


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent)
    asyncio.run(main())
