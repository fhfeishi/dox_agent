"""Second pass: the deep screens (a report, a review run, library files, 四维浏览). Read-only."""
import asyncio
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.agent.config import Settings            # noqa: E402
from src.main import create_app                   # noqa: E402
from tests.browser_artifacts_live import start_server  # noqa: E402
from tests.browser_ui_shots import snapshot_corpora  # noqa: E402
from tour import real_state, dismiss, login       # noqa: E402

SHOTS = Path(__file__).resolve().parent / "shots"


async def main():
    snapshot_corpora()
    state_dir, user_dir = real_state()
    settings = Settings(_env_file=None, state_dir=state_dir, corpora_root=__import__(
        "tests.browser_ui_shots", fromlist=["SNAPSHOT"]).SNAPSHOT, user_dir=user_dir, embedding_path="")
    app = create_app(settings)
    origin, server, thread, listener = start_server(app)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await login(page, origin, "owner")
        corpora = await (await page.request.get(origin + "/api/corpora")).json()
        arts = await (await page.request.get(origin + "/api/artifacts?type=report&limit=30")).json()
        runs = await (await page.request.get(origin + "/api/review/runs")).json()
        print("corpora", len(corpora), "artifacts", len(arts), "runs", len(runs))
        targets = []
        for a in arts[:3]:
            targets.append((f"report-{arts.index(a)}", f"/results/{a['artifact_id']}"))
        for r in runs[:2]:
            targets.append((f"run-{runs.index(r)}", f"/review/runs/{r['id']}"))
        cid = corpora[1]["id"] if len(corpora) > 1 else corpora[0]["id"]
        targets.append(("library-files", f"/library/{cid}/documents"))
        targets.append(("library-fourfacets", f"/library/{cid}/targets/four-facets"))
        for name, path in targets:
            await page.goto(origin + path)
            await page.wait_for_timeout(1500)
            await dismiss(page)
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(1500)
            await page.screenshot(path=str(SHOTS / f"deep-{name}-v.png"))
            print(name, "ok")
        if errors:
            print("ERRORS", errors[:8])
        await browser.close()
    server.should_exit = True
    thread.join(5)
    listener.close()


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent)
    asyncio.run(main())
