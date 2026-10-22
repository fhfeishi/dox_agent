"""Build the two overview demos from the dumped payload, then shoot them for review."""

import asyncio
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DESIGN = ROOT / ".logsdev/owner-首页-design"
TOOLS = DESIGN / "tools"
TMP = Path("/mnt/c/Users/User/AppData/Local/Temp/dox-quickask")
SHOTS = ROOT / ".logsdev/verification/query-20261021-overview-demos"


def build() -> list[Path]:
    rows = json.loads((TOOLS / "libraries.json").read_text(encoding="utf-8"))
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    made = []
    for template, name in (("tpl-legacy.html", "资料库概览-原版.html"),
                           ("tpl-terrain.html", "资料库概览-积累分布图.html")):
        text = (TMP / template).read_text(encoding="utf-8")
        assert "/*__DATA__*/[]" in text, template
        out = DESIGN / name
        out.write_text(text.replace("/*__DATA__*/[]", payload), encoding="utf-8")
        made.append(out)
        print(name, out.stat().st_size, "bytes")
    return made


async def shoot(files: list[Path]):
    from playwright.async_api import async_playwright

    SHOTS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(f"pageerror:{e}"))
        page.on("console", lambda m: errors.append(f"console:{m.text}") if m.type == "error" else None)

        # --- legacy ---
        await page.goto(files[0].as_uri())
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(SHOTS / "legacy-full.png"), full_page=True)
        await page.locator(".bar-row").nth(1).click()
        await page.wait_for_timeout(300)
        await page.locator(".card").screenshot(path=str(SHOTS / "legacy-second.png"))

        # --- terrain ---
        await page.goto(files[1].as_uri())
        await page.wait_for_timeout(900)
        await page.screenshot(path=str(SHOTS / "terrain-full.png"), full_page=True)
        await page.locator(".card").screenshot(path=str(SHOTS / "terrain-card.png"))

        await page.locator('.dot-hit[aria-label*="机器人"]').click()
        await page.wait_for_timeout(600)
        await page.locator(".card").screenshot(path=str(SHOTS / "terrain-robot.png"))

        await page.locator("#f-gap").click()
        await page.wait_for_timeout(500)
        await page.locator(".card").screenshot(path=str(SHOTS / "terrain-gap.png"))
        await page.locator("#f-all").click()
        await page.wait_for_timeout(300)

        await page.locator('[data-axis="x"]').click()
        await page.wait_for_timeout(500)
        await page.screenshot(path=str(SHOTS / "terrain-pop-axis.png"))
        await page.evaluate("window.demoClose && window.demoClose()")
        await page.wait_for_timeout(200)

        await page.locator('[data-pop="maturity"]').first.click()
        await page.wait_for_timeout(500)
        await page.screenshot(path=str(SHOTS / "terrain-pop-maturity.png"))
        await page.evaluate("window.demoClose && window.demoClose()")
        await page.wait_for_timeout(250)

        await page.locator("[data-preview]").click()
        await page.wait_for_timeout(900)
        await page.screenshot(path=str(SHOTS / "terrain-drawer.png"))
        more = page.locator(".drawer-body .more").first
        if await more.count():
            await more.click()
            await page.wait_for_timeout(500)
        await page.evaluate("const el = document.querySelector('.drawer-body'); if (el) el.scrollTop = 9999")
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(SHOTS / "terrain-drawer-bottom.png"))
        await page.evaluate("window.demoClose && window.demoClose()")
        await page.wait_for_timeout(400)

        # Narrow: the panel folds under the map.
        await page.set_viewport_size({"width": 1024, "height": 900})
        await page.wait_for_timeout(500)
        await page.locator(".card").screenshot(path=str(SHOTS / "terrain-1024.png"))

        print("page errors:", errors)
        await browser.close()


if __name__ == "__main__":
    files = build()
    asyncio.run(shoot(files))
