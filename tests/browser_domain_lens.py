"""01/02 gesture acceptance against built UI and controlled domain records.

Extends the planner's ux.cjs with assertions: pan must not navigate, comparison must
survive, zoom must not alter statistics, and annual controls must not capture hover.
The real HTTP app/session runs in temporary storage; only domain data is a fixture.
"""
import asyncio
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from playwright.async_api import async_playwright, expect

from src.agent.config import Settings
from src.api.domains import atlas_domain, domain_payload
from src.main import create_app
from tests.browser_artifacts_live import start_server
from tests.browser_support import login
from tests.test_domains_overview import library, project


def records():
    domains, atlas = [], []
    for i in range(11):
        info = SimpleNamespace(id=f"domain-{i}", name=f"AI与研究领域{i}")
        projects = [project(f"p{j}", 2020 + j % 3, amount=20+i*3, achievements=2+i) for j in range(9)]
        # A large outlier and a dense small-domain cluster reproduce F5.
        items = {f"t{j}": {"project_id": f"p{j % 9}", "maturity": 1 + (j+i) % 5}
                 for j in range(600 if i == 0 else 10+i*2)}
        tree = {"items": items, "categories": [{"name": "技术体系", "children": [
            {"name": "研究方向", "themes": [{"items": list(items)}]}]}]}
        lib = library(*projects)
        if i == 10:
            for p in projects:
                p["funding"] = []
        domains.append(domain_payload(info, lib, tree, {}, {}, "awarded"))
        outputs = {"projects": {f"p{j}": {"counts": {"专利": 2+i}} for j in range(9)} if i != 10 else {}}
        atlas.append(atlas_domain(info, lib, tree, outputs))
    overview = {"funding_label": "批准资助金额", "years": [2020, 2021, 2022], "domains": domains,
                "maturity_levels": [], "totals": {"domains": 11, "projects": 99,
                "items": sum(d["items"] for d in domains), "funding": 1000, "funded_projects": 99,
                "high": 20, "open_issues": 0, "blanks": 0, "combos": 0}}
    return overview, {"funding_label": "批准资助金额", "years": [2019, 2020, 2021, 2022], "domains": atlas}


async def geometry(page):
    return await page.locator(".lens-dot").evaluate_all("cs=>cs.map(c=>[+c.getAttribute('cx'),+c.getAttribute('cy')])")


async def run_checks(page, origin, shots):
    await page.goto(origin + "/overview/domains")
    plot = page.locator(".lens-plot")
    await expect(page.locator(".lens-node")).to_have_count(11)
    for width in (1366, 1440, 1920, 2560, 3840):
        await page.set_viewport_size({"width": width, "height": round(width * 9 / 16)})
        await plot.scroll_into_view_if_needed()
        await page.wait_for_timeout(500)
        overlap = await page.locator(".lens-node-name:visible").evaluate_all("""ts=>{
          const r=ts.map(t=>t.getBoundingClientRect());let n=0;
          for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++){
            const a=r[i],b=r[j];if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom)n++;
          }return n;}""")
        assert overlap == 0, (width, overlap)
        await page.locator(".domain-lens").screenshot(path=str(shots / f"{width}-overview.png"))
    await page.set_viewport_size({"width": 1440, "height": 1000})
    first = page.locator(".lens-node").first
    await first.click()
    await page.wait_for_timeout(300)
    why = await page.locator(".lens-why").inner_text()
    before = await geometry(page)
    box = await plot.bounding_box()
    x, y = box["x"] + box["width"] * .65, box["y"] + box["height"] * .6
    await page.mouse.move(x, y)
    scroll = await page.locator("main").evaluate("e=>e.scrollTop")
    await page.mouse.wheel(0, -400)
    await page.wait_for_timeout(100)
    assert before != await geometry(page), "wheel did not zoom"
    await expect(page.locator(".lens-zoom")).to_contain_text("%")
    assert await page.locator("main").evaluate("e=>e.scrollTop") == scroll
    assert await page.locator(".lens-why").inner_text() == why
    after = await geometry(page)
    url = page.url
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x+45, y+30, steps=8)
    await page.mouse.up()
    await page.wait_for_timeout(300)
    assert after != await geometry(page), "blank drag did not pan"
    assert page.url == url, "pan triggered blank return"
    await plot.dblclick(position={"x": box["width"]*.65, "y": box["height"]*.65})
    await expect(page.locator(".lens-zoom")).to_contain_text("全景")
    assert page.url == url, "double click reset navigated back"
    nodes = page.locator(".lens-node")
    await nodes.nth(0).drag_to(nodes.nth(1))
    await expect(page.locator(".lens-pair-names")).to_be_visible()
    await page.locator(".domain-lens").screenshot(path=str(shots / "compare.png"))
    await page.locator(".lens-zoom").get_by_role("button", name="放大", exact=True).click()
    await expect(page.locator(".lens-zoom")).to_contain_text("%")
    await page.locator(".lens-zoom button").nth(1).click()
    await expect(page.locator(".lens-zoom")).to_contain_text("全景")
    await plot.focus()
    await page.keyboard.press("+")
    await expect(page.locator(".lens-zoom")).to_contain_text("%")
    await page.keyboard.press("0")
    await expect(page.locator(".lens-zoom")).to_contain_text("全景")
    # Blank single click exits comparison; double click does not.
    await plot.click(position={"x": box["width"]*.7, "y": box["height"]*.7})
    await expect(page.locator(".lens-pair-names")).to_have_count(0)
    if os.environ.get("LENS_PHASE") == "u1":
        return
    await page.locator(".lens-node").nth(2).hover()
    node_before = await page.evaluate("new URL(location.href).searchParams.get('node')")
    money = page.get_by_role("radio", name="资金（万元）", exact=True)
    await money.click()
    await expect(money).to_have_attribute("aria-checked", "true")
    await expect(page.locator(".lens-year-legend")).to_contain_text("批准资助金额")
    await money.press("ArrowRight")
    await expect(page.get_by_role("radio", name="技术（条）", exact=True)).to_have_attribute("aria-checked", "true")
    await page.locator(".lens-zoom").get_by_role("button", name="放大", exact=True).click()
    await page.locator(".domain-lens").evaluate("""el=>{
        el.dataset.sawMotion='0';
        const observer=new MutationObserver(()=>{
            if(el.dataset.moving==='true')el.dataset.sawMotion='1';
        });
        observer.observe(el,{attributes:true,attributeFilter:['data-moving']});
    }""")
    await page.locator(".lens-views").get_by_role("button", name="投入与产出").click()
    await expect(money).to_have_attribute("aria-checked", "true")
    await page.wait_for_timeout(500)
    await expect(page.locator(".domain-lens")).to_have_attribute("data-saw-motion", "1")
    await expect(page.locator(".lens-zoom")).to_contain_text("全景")
    await page.locator('.lens-band-svg [data-year="2021"]').click()
    assert await page.evaluate("new URL(location.href).searchParams.get('node')") == node_before
    await page.locator(".lens-pull").click()
    await expect(page.locator(".lens-matrix")).to_be_visible()
    assert "—" not in await page.locator(".lens-matrix tbody td:last-child").all_text_contents()
    await expect(page.locator(".lens-matrix tbody tr").filter(has_text="AI与研究领域10").locator("td").last).to_have_text("未记录")
    await expect(page.locator('.lens-band-svg [data-year="2019"] .lens-year-total')).to_have_text("0")
    await page.locator(".lens-year-band").screenshot(path=str(shots / "annual-expanded.png"))
    await page.reload()
    await expect(money).to_have_attribute("aria-checked", "true")
    await expect(page.locator(".lens-matrix")).to_be_visible()
    await page.locator(".lens-node").first.dblclick()
    await expect(page.locator(".lens-head nav")).to_contain_text("研究领域")
    await page.wait_for_timeout(500)
    await page.locator(".lens-node").first.dblclick()
    await expect(page.locator(".lens-head nav")).to_contain_text("技术体系")
    await page.emulate_media(reduced_motion="reduce")
    await page.wait_for_timeout(50)
    await page.locator(".lens-views").get_by_role("button", name="成果与落地").click()
    await expect(page.locator(".domain-lens")).to_have_attribute("data-moving", "false")
    # At 1x an outward wheel gesture belongs to page scrolling.
    await plot.scroll_into_view_if_needed()
    box = await plot.bounding_box()
    await page.mouse.move(box["x"]+box["width"]*.7, box["y"]+box["height"]*.6)
    before_scroll = await page.locator("main").evaluate("e=>e.scrollTop")
    await page.mouse.wheel(0, 400)
    await page.wait_for_timeout(200)
    assert await page.locator("main").evaluate("e=>e.scrollTop") > before_scroll
    # 02 uses the extracted hook too: zoom/pan must retain click-to-expand and glide.
    road = page.locator(".roads-svg")
    await road.scroll_into_view_if_needed()
    box = await road.bounding_box()
    group = road.locator(":scope > g")
    before_view = await group.get_attribute("transform")
    await page.mouse.move(box["x"]+box["width"]*.6, box["y"]+box["height"]*.6)
    await page.mouse.wheel(0, -300)
    await page.wait_for_timeout(100)
    assert await group.get_attribute("transform") != before_view
    tools = page.locator(".roads-tools .roads-zoom")
    await tools.locator("button").nth(1).click()
    await expect(tools).to_contain_text("全景")
    await road.scroll_into_view_if_needed()
    box = await road.bounding_box()
    await page.mouse.move(box["x"]+box["width"]*.7, box["y"]+box["height"]*.7)
    await page.mouse.down()
    await page.mouse.move(box["x"]+box["width"]*.7+40, box["y"]+box["height"]*.7+25, steps=7)
    await page.mouse.up()
    await expect(tools).to_contain_text("100% · 复位")
    await tools.locator("button").nth(1).click()
    library_node = road.locator(".roads-node.is-library").first
    await library_node.click()
    await expect(library_node).to_have_attribute("aria-expanded", "true")
    await expect(tools).to_contain_text("125%")
    await road.screenshot(path=str(shots / "02-shared-gestures.png"))


async def main():
    shots = Path(os.environ.get("LENS_SHOTS", ".logsdev/verification/W1-收尾-20261024/browser"))
    shots.mkdir(parents=True, exist_ok=True)
    overview, atlas = records()
    with TemporaryDirectory(prefix="dox-lens-") as folder:
        root = Path(folder)
        settings = Settings(_env_file=None, corpora_root=root/"corpora", state_dir=root/"state", user_dir=root/"users")
        origin, server, thread, listener = start_server(create_app(settings))
        try:
            async with async_playwright() as pw:
                browser = await pw.chromium.launch()
                page = await browser.new_page(viewport={"width": 1440, "height": 1000})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                await login(page, origin)
                await page.route("**/api/corpora", lambda r: r.fulfill(json=[{
                    "id": "domain-0", "name": "AI与研究领域0", "indexed_count": 9,
                    "docs_count": 9, "missing": False, "kind": "fund", "job": None}]))
                await page.route("**/api/domains/overview", lambda r: r.fulfill(json=overview))
                await page.route("**/api/domains/atlas", lambda r: r.fulfill(json=atlas))
                await run_checks(page, origin, shots)
                assert not errors, errors
                await browser.close()
                print("PASS 01 pan/zoom, comparison, stable statistics and 1366–4K labels" +
                      ("" if os.environ.get("LENS_PHASE") == "u1" else "; annual controls, missing records and URL restoration"))
        finally:
            server.should_exit = True
            thread.join(timeout=15)
            listener.close()


if __name__ == "__main__":
    asyncio.run(main())
