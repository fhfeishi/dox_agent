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
        page = await b.new_page(viewport={"width": 1440, "height": 900})
        await login(page, origin, "admin")
        await page.goto(origin + "/intelligence"); await page.wait_for_timeout(2500); await dismiss(page)
        btn = page.get_by_role("button", name="生成分析报告")
        print("disabled:", await btn.is_disabled())
        print("status text:", (await page.get_by_role("status").all_inner_texts()))
        await b.close()
    server.should_exit = True; thread.join(5); listener.close()
asyncio.run(main())
