"""Interaction states, viewport shots only (no CSS unclipping)."""
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
    await page.wait_for_timeout(350)
    await page.screenshot(path=str(SHOTS / f"s-{name}.png"))


async def main():
    snapshot_corpora()
    state_dir, user_dir = real_state()
    app = create_app(Settings(_env_file=None, state_dir=state_dir, corpora_root=SNAPSHOT,
                              user_dir=user_dir, embedding_path=""))
    origin, server, thread, listener = start_server(app)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await login(page, origin, "admin")

        # 1. 任务模版 → 开始分析 opens chat on that task.
        await page.goto(origin + "/tasks")
        await page.wait_for_timeout(1500)
        await dismiss(page)
        await page.get_by_role("button", name="开始分析").first.click()
        await page.wait_for_timeout(2500)
        await dismiss(page)
        await shot(page, "task-start-chat")

        # 2. 资料库 files: hover a row, then tick a checkbox to see the bulk bar.
        corpora = await (await page.request.get(origin + "/api/corpora")).json()
        cid = corpora[0]["id"]
        await page.goto(origin + f"/library/{cid}/documents")
        await page.wait_for_timeout(2500)
        await dismiss(page)
        rows = page.locator("li", has_text="2023-2025")
        if await rows.count():
            await rows.first.hover()
            await shot(page, "file-row-hover")
        boxes = page.get_by_role("checkbox")
        if await boxes.count():
            await boxes.nth(1).check()
            await shot(page, "file-selected")

        # 3. 报告中心: hover actions, then open a report in the panel.
        await page.goto(origin + "/results")
        await page.wait_for_timeout(2000)
        await dismiss(page)
        await page.get_by_role("button", name="打开").first.click()
        await page.wait_for_timeout(2500)
        await shot(page, "results-open-panel")

        # 4. 审查 run list on 形式审查 page: is there any recent-work surface?
        await page.goto(origin + "/review/formal")
        await page.wait_for_timeout(2000)
        await dismiss(page)
        await shot(page, "review-formal")
        await page.goto(origin + "/review/professional")
        await page.wait_for_timeout(2000)
        await dismiss(page)
        await shot(page, "review-professional")

        # 5. 情报分析 without a file: the disabled generate button.
        await page.goto(origin + "/intelligence")
        await page.wait_for_timeout(1800)
        await dismiss(page)
        btn = page.get_by_role("button", name="生成分析报告")
        print("intel generate disabled:", await btn.is_disabled() if await btn.count() else "absent")

        # 6. Chat: empty composer state and the scope picker.
        await page.goto(origin + "/chat")
        await page.wait_for_timeout(2000)
        await dismiss(page)
        scope = page.get_by_role("button", name="资料范围")
        if await scope.count():
            await scope.first.click()
            await shot(page, "chat-scope-menu")
            await page.keyboard.press("Escape")
        await page.get_by_role("button", name="点选提问").click()
        await shot(page, "chat-pick-ask")
        await page.keyboard.press("Escape")

        # 7. 首页 for a plain user (no admin sections).
        await login(page, origin, "user")
        await page.goto(origin + "/home")
        await page.wait_for_timeout(2500)
        await dismiss(page)
        await shot(page, "user-home")

        if errors:
            print("ERRORS", errors[:8])
        await browser.close()
    server.should_exit = True
    thread.join(5)
    listener.close()


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent)
    asyncio.run(main())
