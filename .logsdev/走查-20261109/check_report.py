import asyncio, sys
sys.path.insert(0, "/home/mvr/wslcodespace/dox_agent")
from playwright.async_api import async_playwright
from src.agent.config import Settings
from src.main import create_app
from tests.browser_artifacts_live import start_server
from tests.browser_ui_shots import snapshot_corpora, SNAPSHOT
from tour import real_state, dismiss, login

async def main():
    snapshot_corpora(); st, us = real_state()
    app = create_app(Settings(_env_file=None, state_dir=st, corpora_root=SNAPSHOT, user_dir=us, embedding_path=""))
    origin, server, thread, listener = start_server(app)
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
        page = await ctx.new_page()
        await login(page, origin, "owner")
        arts = await (await page.request.get(origin + "/api/artifacts?type=report&limit=5")).json()
        await page.goto(origin + "/results/" + arts[0]["artifact_id"]); await page.wait_for_timeout(2500); await dismiss(page)
        await page.get_by_role("button", name="复制正文").click()
        await page.wait_for_timeout(600)
        print("after copy:", (await page.get_by_role("button").all_inner_texts())[:6])
        print("title:", await page.title())
        await page.screenshot(path="shots/i3-report-page.png")
        await b.close()
    server.should_exit = True; thread.join(5); listener.close()
asyncio.run(main())
