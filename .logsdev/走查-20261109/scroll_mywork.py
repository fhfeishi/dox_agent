import asyncio, sys
sys.path.insert(0, "/home/mvr/wslcodespace/dox_agent")
from playwright.async_api import async_playwright
from src.agent.config import Settings
from src.main import create_app
from tests.browser_artifacts_live import start_server
from tests.browser_ui_shots import snapshot_corpora, SNAPSHOT
from tour import real_state, dismiss, login

async def main(user):
    snapshot_corpora(); st, us = real_state()
    app = create_app(Settings(_env_file=None, state_dir=st, corpora_root=SNAPSHOT, user_dir=us, embedding_path=""))
    origin, server, thread, listener = start_server(app)
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        page = await b.new_page(viewport={"width": 1440, "height": 900})
        await login(page, origin, user)
        await page.goto(origin + "/home"); await page.wait_for_timeout(5000); await dismiss(page)
        await page.get_by_role("region", name="我的工作").scroll_into_view_if_needed()
        await page.wait_for_timeout(900)
        await page.screenshot(path=f"shots/i2-{user}-mywork.png")
        await b.close()
    server.should_exit = True; thread.join(5); listener.close()

asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "admin"))
