"""Focused probe for the 技术谱系 click-to-engage change (2026-11-06).

Asserts only the behaviour the owner asked for:
  1. click on blank canvas enters 图谱操作, click again leaves it;
  2. clicking a node never enters 图谱操作 (nodes keep click-to-expand);
  3. the hint text says 单击, not 双击.
"""
import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.async_api import async_playwright, expect

import tests.browser_domain_lens as lens
from src.agent.config import Settings
from src.main import create_app
from tests.browser_artifacts_live import start_server
from tests.browser_support import login


async def main():
    overview, atlas = lens.records()
    with TemporaryDirectory(prefix="dox-roads-click-") as folder:
        root = Path(folder)
        settings = Settings(_env_file=None, corpora_root=root / "corpora", state_dir=root / "state", user_dir=root / "users")
        origin, server, thread, listener = start_server(create_app(settings))
        try:
            async with async_playwright() as pw:
                browser = await pw.chromium.launch()
                page = await browser.new_page(viewport={"width": 1440, "height": 900})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                await login(page, origin)
                await lens.mock_domain_routes(page, overview, atlas)
                await page.goto(origin + "/overview/domains?screen=lineage")
                road = page.locator(".roads:not(.roads-large-content) > .roads-svg")
                await road.wait_for(state="visible", timeout=15000)
                frame = page.locator(".roads:not(.roads-large-content)")
                await expect(frame).to_have_attribute("data-engaged", "false")
                hint = frame.locator(".roads-interaction-hint")
                await expect(hint).to_contain_text("单击图内空白可操作")

                # 1. click blank -> engaged, click blank -> back to browsing
                box = await road.bounding_box()
                await page.mouse.click(box["x"] + 24, box["y"] + 24)
                await expect(frame).to_have_attribute("data-engaged", "true")
                await expect(hint).to_contain_text("单击图内空白 / Esc 退出")
                await page.mouse.click(box["x"] + 24, box["y"] + 24)
                await expect(frame).to_have_attribute("data-engaged", "false")

                # 2. clicking a node must not engage (it expands / selects instead)
                await road.locator(".roads-node.is-root .roads-hit").click()
                await expect(frame).to_have_attribute("data-engaged", "false")

                assert not errors, errors
                await browser.close()
                print("PASS 单击空白进入/退出图谱操作；点节点不误触；提示文案已改为单击")
        finally:
            server.should_exit = True
            thread.join(timeout=15)
            listener.close()


if __name__ == "__main__":
    asyncio.run(main())
