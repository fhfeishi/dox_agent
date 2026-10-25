"""01/02 gesture acceptance against built UI and controlled domain records.

Extends the planner's ux.cjs with assertions: pan must not navigate, comparison must
survive, zoom must not alter statistics, and annual controls must not capture hover.
The real HTTP app/session runs in temporary storage; only domain data is a fixture.
"""
import asyncio
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from urllib.parse import quote

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
        tree = {"items": items, "categories": [{"name": f"技术体系{k}", "children": [{"name": f"研究方向{k}", "themes": [{"items": keys}]}]} for k,keys in enumerate([list(items)[:len(items)//3],list(items)[len(items)//3:]])]}
        if i == 0:
            items['unplaced'] = {'project_id': 'p1', 'maturity': 0}
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


async def settle(page):
    layer=await page.evaluate("new URL(location.href).searchParams.get('layer')||''")
    await expect(page.locator(".domain-lens")).to_have_attribute("data-layer",layer)
    await expect(page.locator(".domain-lens")).to_have_attribute("data-moving", "false")

async def click_node(node):
    await node.locator(".lens-dot").click()

async def blank(page, jitter=False):
    plot=page.locator(".lens-plot")
    await plot.scroll_into_view_if_needed()
    box=await plot.bounding_box()
    await page.mouse.move(box["x"]+box["width"]*.7,box["y"]+8)
    await page.mouse.down()
    if jitter: await page.mouse.move(box["x"]+box["width"]*.7+3,box["y"]+8)
    await page.mouse.up()
    await page.wait_for_timeout(30)
    await settle(page)

async def check_simplified(page,origin,shots):
    reports=[]
    for width in (1366,1440,1920):
        await page.set_viewport_size({"width":width,"height":900 if width<1920 else 1080})
        await page.goto(origin+"/overview/domains")
        await page.locator(".lens-node").first.wait_for(timeout=60000)
        await settle(page)
        band=await page.locator('.lens-band-svg').bounding_box()
        assert band and band['y']+band['height']<=await page.evaluate('innerHeight'),band
        lens=page.locator(".domain-lens")
        await expect(lens.get_by_role('group',name='缩放',exact=True)).to_have_count(0)
        plot_box=await page.locator('.lens-plot').bounding_box()
        assert plot_box['width']>=790 and plot_box['height']>=460,plot_box
        await expect(page.locator('.lens-gesture-hint')).to_have_count(0)
        status=page.locator(".lens-inspector-status")
        await expect(status).to_contain_text("当前层")
        first=page.locator(".lens-node").first
        domain=await first.get_attribute("data-node")
        await lens.evaluate("""el=>{window.__motion=[];new MutationObserver(()=>window.__motion.push([el.dataset.moving,performance.now()])).observe(el,{attributes:true,attributeFilter:['data-moving']});}""")
        await click_node(first)
        await page.wait_for_function("id=>new URL(location.href).searchParams.get('node')===id",arg=domain)
        await expect(status).to_contain_text("已选中")
        await expect(page.locator(".lens-primary")).to_contain_text("预览资料库")
        href=await page.locator('.lens-preview-name .ui-page-link').get_attribute('href')
        assert href in [f'/library/{quote(domain,safe="")}/documents',f'/library/{quote(domain,safe="")}/targets/four-facets'],href
        term=page.locator('.lens-four').get_by_text('批准资助金额',exact=True)
        await term.hover()
        await expect(page.get_by_role('tooltip')).to_contain_text('项给出金额')
        await page.mouse.move(20,20)
        await expect(page.locator('.ui-help-tooltip')).to_have_count(0)
        await term.focus()
        await expect(page.locator('.ui-help-tooltip')).to_be_visible()
        await page.keyboard.press('Escape')
        await expect(page.locator('.ui-help-tooltip')).to_have_count(0)
        assert await page.evaluate("new URL(location.href).searchParams.get('node')")==domain
        assert len(await page.locator('.lens-why').inner_text())<=30
        heading=await page.locator(".lens-inspector h3").inner_text()
        await page.locator(".lens-node").last.locator(".lens-dot").hover()
        await expect(page.locator(".lens-node-tooltip")).to_be_visible()
        await expect(page.locator(".lens-axis-readout")).to_have_count(2)
        assert await page.locator(".lens-inspector h3").inner_text()==heading
        assert await first.locator(".lens-halo").evaluate("e=>+getComputedStyle(e).opacity")>0
        await click_node(first)
        await page.wait_for_function("id=>new URL(location.href).searchParams.get('layer')===id",arg=domain)
        await settle(page)
        duration=await page.evaluate("""()=>{const a=window.__motion.find(x=>x[0]==='true'),b=window.__motion.filter(x=>x[0]==='false').at(-1);return a&&b?b[1]-a[1]:0;}""")
        assert duration>=350,duration
        assert await page.evaluate("new URL(location.href).searchParams.get('node')") is None
        await expect(status).to_contain_text("当前层")
        await expect(page.locator(".lens-inspector h3")).to_have_text(heading)
        system_node=page.locator(".lens-node").first
        system=await system_node.get_attribute("data-node")
        await click_node(system_node)
        await click_node(system_node)
        await page.wait_for_function("id=>new URL(location.href).searchParams.get('layer')===id",arg=system)
        await settle(page)
        switch=page.get_by_label("切换当前层")
        options=await switch.locator("option:not([disabled])").evaluate_all("els=>els.map(e=>e.value)")
        if len(options)>1:
            peer=next(x for x in options if x!=system)
            await switch.select_option(peer)
            system=peer
            await settle(page)
            assert await page.evaluate("new URL(location.href).searchParams.get('layer')")==peer
        leaf=page.locator(".lens-node").first
        leaf_id=await leaf.get_attribute("data-node")
        await click_node(leaf)
        await click_node(leaf)
        assert await page.evaluate("new URL(location.href).searchParams.get('node')")==leaf_id
        back_durations=[]
        for layer,node in [(system,None),(domain,system),(domain,None),(None,domain),(None,None),(None,None)]:
            await page.evaluate("window.__motion=[]")
            await blank(page,jitter=True)
            await page.wait_for_function("v=>new URL(location.href).searchParams.get('layer')===v[0]&&new URL(location.href).searchParams.get('node')===v[1]",arg=[layer,node])
            await settle(page)
            if node and layer!=system:
                await expect(page.locator(".lens-return-notice")).to_contain_text("已返回")
                back_ms=await page.evaluate("""()=>{const a=window.__motion.find(x=>x[0]==='true'),b=window.__motion.filter(x=>x[0]==='false').at(-1);return a&&b?b[1]-a[1]:0;}""")
                assert back_ms>=350,back_ms
                back_durations.append(back_ms)
        # Six ordinary clicks during the 420ms return animation must not be lost.
        from urllib.parse import urlencode
        await page.goto(origin+'/overview/domains?'+urlencode({'layer':system,'node':leaf_id}))
        await page.locator('.lens-node').first.wait_for(timeout=60000)
        await settle(page)
        fast_box=await page.locator('.lens-plot').bounding_box()
        for _ in range(6):
            await page.mouse.click(fast_box['x']+fast_box['width']*.7,fast_box['y']+8)
            await page.wait_for_timeout(70)
        await page.wait_for_function("new URL(location.href).searchParams.get('layer')===null&&new URL(location.href).searchParams.get('node')===null",timeout=3000)
        await settle(page)
        a=page.locator('.lens-node').first
        b=page.locator('.lens-node').last
        a_id=await a.get_attribute('data-node');b_id=await b.get_attribute('data-node')
        a_box=await a.locator('.lens-dot').bounding_box();b_box=await b.locator('.lens-dot').bounding_box()
        ax=a_box['x']+a_box['width']/2;ay=a_box['y']+a_box['height']/2
        bx=b_box['x']+b_box['width']/2;by=b_box['y']+b_box['height']/2
        before_cx=await a.locator('.lens-dot').get_attribute('cx')
        await page.mouse.move(ax,ay);await page.mouse.down()
        await page.mouse.move((ax+bx)/2,(ay+by)/2,steps=5)
        await expect(page.locator('.lens-compare-draft')).to_be_visible()
        await page.mouse.move(bx,by,steps=5)
        await expect(page.locator('[data-drop-target=true]')).to_have_attribute('data-node',b_id)
        await page.screenshot(path=str(shots/f'{width}-drag-compare.png'))
        await page.mouse.up()
        await page.wait_for_function("v=>new URL(location.href).searchParams.get('compare')===v[0]&&new URL(location.href).searchParams.get('node')===v[1]",arg=[a_id,b_id])
        assert await a.locator('.lens-dot').get_attribute('cx')==before_cx
        assert await page.evaluate("new URL(location.href).searchParams.get('layer')") is None
        await expect(page.get_by_role('button',name='⇄ 对比',exact=True)).to_have_count(0)
        await expect(page.locator(".lens-pair-names")).to_be_visible()
        map_height=(await page.locator('.lens-plot').bounding_box())['height']
        await page.get_by_role('radio',name='资金（万元）',exact=True).click()
        await expect(page.get_by_role('radio',name='资金（万元）',exact=True)).to_have_attribute('aria-checked','true')
        colors=await page.locator('.lens-year-legend span').evaluate_all('es=>es.map(e=>getComputedStyle(e).color)')
        assert len(set(colors))==2,colors
        overlaps=await page.locator('.lens-band-svg [data-year]').evaluate_all("""gs=>gs.filter(g=>{
            const ts=[...g.children].filter(n=>n.tagName.toLowerCase()==='g').flatMap(n=>[...n.querySelectorAll('text')]).filter(t=>t.textContent.trim());
            if(ts.length<2)return false;const[a,b]=ts.map(t=>t.getBoundingClientRect());return a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
        }).length""")
        assert overlaps==0,overlaps
        assert abs((await page.locator('.lens-plot').bounding_box())['height']-map_height)<2
        await blank(page)
        await expect(page.locator(".lens-pair-names")).to_have_count(0)
        await blank(page)
        # A cancelled wire must not pan, select a circle, enter a layer or step back.
        box=await page.locator('.lens-plot').bounding_box()
        for end in [(box['x']+box['width']*.7,box['y']+8),(ax,ay)]:
            await page.mouse.move(ax,ay);await page.mouse.down()
            await page.mouse.move(ax-30,ay,steps=3)
            await page.mouse.move(*end,steps=5);await page.mouse.up()
            await expect(page.locator('.lens-compare-draft')).to_have_count(0)
            assert await page.evaluate("['node','compare','layer'].every(k=>!new URL(location.href).searchParams.has(k))")
            assert await a.locator('.lens-dot').get_attribute('cx')==before_cx
        await click_node(a)
        await page.mouse.move(ax,ay);await page.mouse.down()
        await page.mouse.move(ax-30,ay,steps=3)
        await page.keyboard.press('Escape');await page.mouse.up()
        await expect(page.locator('.lens-compare-draft')).to_have_count(0)
        assert await page.evaluate("new URL(location.href).searchParams.get('node')")==a_id
        await b.focus();await page.keyboard.press('Shift+Enter')
        await expect(page.locator('.lens-pair-names')).to_be_visible()
        await blank(page);await blank(page)
        await page.get_by_role("radio",name="资金（万元）",exact=True).click()
        await page.locator('.lens-band-svg [data-year="2021"]').click()
        await settle(page)
        await expect(page.get_by_role("button",name="清除年份范围")).to_be_visible()
        await page.get_by_role("button",name="清除年份范围").click()
        await settle(page)
        await page.get_by_role("button",name="展开各领域 ▾",exact=True).click()
        await expect(page.locator(".lens-matrix")).to_be_visible()
        await page.get_by_role("button",name="收起各领域 ▴",exact=True).click()
        inventory=await lens.evaluate("""root=>{
          const out=[];const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
          while(n=walker.nextNode()){
            const text=n.textContent.trim(),el=n.parentElement;if(!text||!el)continue;
            const c=getComputedStyle(el),r=el.getBoundingClientRect();
            if(!r.width||!r.height||c.visibility==='hidden'||c.display==='none'||el.closest('.lens-inspector-status'))continue;
            if(el.closest('svg')&&/^[0-9.,]+$/.test(text))continue;
            if(parseFloat(c.fontSize)<14)out.push(text);
          }return out;
        }""")
        assert len(inventory)<=15,inventory
        affordance=await lens.locator("button").evaluate_all("""bs=>bs.filter(b=>b.getBoundingClientRect().width&&!b.closest('.lens-views')&&!b.classList.contains('lens-icon-button')).map(b=>{
          const c=getComputedStyle(b),r=b.getBoundingClientRect();return{text:b.textContent.trim(),font:parseFloat(c.fontSize),height:r.height,visible:c.backgroundColor!=='rgba(0, 0, 0, 0)'||parseFloat(c.borderTopWidth)>0};
        })""")
        assert all(b['font']>=14 and b['height']>=32 and b['visible'] for b in affordance),affordance
        geometry=await page.locator(".lens-plot").evaluate("""svg=>{
          const nodes=[...svg.querySelectorAll('[data-node]')].map(g=>{const c=g.querySelector('.lens-dot').getBoundingClientRect();const t=g.querySelector('.lens-node-name');return{c,t,r:+g.querySelector('.lens-dot').getAttribute('r')}});
          let collisions=0,maxDistance=0;const names=nodes.filter(p=>p.t);
          for(let i=0;i<names.length;i++){
            const a=names[i].t.getBoundingClientRect(),c=names[i].c,cx=(c.left+c.right)/2,cy=(c.top+c.bottom)/2;
            maxDistance=Math.max(maxDistance,Math.hypot(cx-Math.max(a.left,Math.min(a.right,cx)),cy-Math.max(a.top,Math.min(a.bottom,cy)))-names[i].r);
            for(let j=i+1;j<names.length;j++){const b=names[j].t.getBoundingClientRect();if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom)collisions++;}
            for(const p of nodes){const x=(p.c.left+p.c.right)/2,y=(p.c.top+p.c.bottom)/2;if(Math.hypot(x-Math.max(a.left,Math.min(a.right,x)),y-Math.max(a.top,Math.min(a.bottom,y)))<p.r)collisions++;}
          }return{minRadius:Math.min(...nodes.map(p=>p.r)),maxRadius:Math.max(...nodes.map(p=>p.r)),maxDistance,collisions};
        }""")
        assert geometry['minRadius']>=8 and geometry['maxRadius']<=30 and geometry['maxDistance']<=40 and geometry['collisions']==0,geometry
        # A legacy pin link is migrated once; no old interaction mode remains.
        from urllib.parse import urlencode
        await page.goto(origin+'/overview/domains?'+urlencode({'pin':domain}))
        await page.locator('.lens-node').first.wait_for(timeout=60000)
        await expect(status).to_contain_text('已选中')
        assert await page.evaluate("new URL(location.href).searchParams.get('pin')") is None
        button=page.locator('.lens-primary');before=await button.bounding_box()
        assert before['y']>=0 and before['y']+before['height']<=await page.evaluate('innerHeight'),before
        await page.locator('.lens-detail-body').evaluate('e=>e.scrollTop=e.scrollHeight')
        after=await button.bounding_box();assert abs(after['y']-before['y'])<1
        await page.screenshot(path=str(shots/f'{width}-selected.png'))
        plot_width=await page.locator('.lens-plot').evaluate('e=>e.getBoundingClientRect().width')
        await page.get_by_role('button',name='收起详情',exact=True).click()
        await page.wait_for_function("w=>document.querySelector('.lens-plot').getBoundingClientRect().width>w*1.15",arg=plot_width)
        await expect(page.locator('.lens-inspector')).to_have_attribute('aria-hidden','true')
        await page.get_by_role('button',name='展开详情',exact=True).click()
        await expect(status).to_contain_text('已选中')
        await page.wait_for_function("w=>Math.abs(document.querySelector('.lens-plot').getBoundingClientRect().width-w)<2",arg=plot_width)
        assert await page.evaluate("new URL(location.href).searchParams.get('node')")==domain
        await page.emulate_media(reduced_motion='reduce')
        await click_node(page.locator('.lens-node').first)
        await expect(lens).to_have_attribute('data-moving','false')
        await page.emulate_media(reduced_motion='no-preference')
        reports.append({'width':width,'plot':plot_box,'small_text':len(inventory),'geometry':geometry,'enter_ms':duration,'back_ms':back_durations})
    return reports

async def check_retained(page,origin,shots):
    await page.goto(origin+'/overview/domains')
    await page.locator('.lens-node').first.wait_for(timeout=60000)
    await settle(page)
    await click_node(page.locator('.lens-node').first)
    await expect(page.locator('.lens-why')).to_be_visible()
    before=await page.locator('.lens-why').inner_text()
    plot=page.locator('.lens-plot');await plot.scroll_into_view_if_needed();box=await plot.bounding_box()
    positions=await plot.locator('.lens-dot').evaluate_all("es=>es.map(e=>[e.getAttribute('cx'),e.getAttribute('cy'),e.getAttribute('r')])")
    saved_url=page.url
    await page.mouse.move(box['x']+box['width']*.65,box['y']+8)
    await page.mouse.down();await page.mouse.move(box['x']+box['width']*.65+60,box['y']+8,steps=5);await page.mouse.move(box['x']+box['width']*.65,box['y']+8,steps=5);await page.mouse.up()
    assert page.url==saved_url
    await page.mouse.wheel(0,300)
    await page.wait_for_function("document.querySelector('main').scrollTop>0")
    assert await plot.locator('.lens-dot').evaluate_all("es=>es.map(e=>[e.getAttribute('cx'),e.getAttribute('cy'),e.getAttribute('r')])")==positions
    assert await page.locator('.lens-why').inner_text()==before
    await page.locator('main').evaluate('e=>e.scrollTop=0')
    await page.get_by_role('radio',name='资金（万元）',exact=True).click()
    await page.get_by_role('radio',name='资金（万元）',exact=True).press('ArrowRight')
    await expect(page.get_by_role('radio',name='技术（条）',exact=True)).to_have_attribute('aria-checked','true')
    await page.locator('.lens-views').first.get_by_role('button',name='投入与产出',exact=True).click()
    await expect(page.get_by_role('radio',name='资金（万元）',exact=True)).to_have_attribute('aria-checked','true')
    await settle(page)
    await page.locator('.lens-band-svg [data-year="2019"]').click()
    await page.wait_for_function("new URL(location.href).searchParams.get('from')==='2019'")
    await settle(page)
    await expect(page.locator('.lens-median-tag')).to_have_count(0)
    await expect(page.locator('.lens-empty')).to_be_visible()
    await page.get_by_role('button',name='清除年份范围').click()
    await page.wait_for_function("new URL(location.href).searchParams.get('from')===null")
    await settle(page)
    node=await page.evaluate("new URL(location.href).searchParams.get('node')")
    await page.locator('.lens-band-svg [data-year="2021"]').click()
    await page.wait_for_function("new URL(location.href).searchParams.get('from')==='2021'")
    await settle(page)
    assert await page.evaluate("new URL(location.href).searchParams.get('node')")==node
    await page.get_by_role('button',name='清除年份范围').click()
    await page.locator('.lens-band-svg [data-year="2020"]').drag_to(page.locator('.lens-band-svg [data-year="2022"]'))
    await page.wait_for_function("new URL(location.href).searchParams.get('from')==='2020'&&new URL(location.href).searchParams.get('to')==='2022'")
    await page.get_by_role('button',name='展开各领域 ▾',exact=True).click()
    await expect(page.locator('.lens-matrix')).to_be_visible()
    await expect(page.locator('.lens-matrix tbody tr').filter(has_text='AI与研究领域10').locator('td').last).to_have_text('未记录')
    await expect(page.locator('.lens-band-svg [data-year="2019"] .lens-year-total')).to_have_text('0')
    saved=page.url;await page.reload();await expect(page.locator('.lens-matrix')).to_be_visible();assert page.url==saved
    # 02 retains zoom/pan, click-to-expand and glide independently of 01.
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
    shots=Path(os.environ.get('LENS_SHOTS','.logsdev/verification/01-第三轮实施-20261024/browser'))
    shots.mkdir(parents=True,exist_ok=True)
    overview,atlas=records()
    with TemporaryDirectory(prefix='dox-lens-') as folder:
        root=Path(folder)
        settings=Settings(_env_file=None,corpora_root=root/'corpora',state_dir=root/'state',user_dir=root/'users')
        origin,server,thread,listener=start_server(create_app(settings))
        try:
            async with async_playwright() as pw:
                browser=await pw.chromium.launch()
                page=await browser.new_page(viewport={'width':1440,'height':900})
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                await login(page,origin)
                await page.route('**/api/corpora',lambda r:r.fulfill(json=[{'id':'domain-0','name':'AI与研究领域0','indexed_count':9,'docs_count':9,'missing':False,'kind':'fund','job':None}]))
                await page.route('**/api/domains/overview',lambda r:r.fulfill(json=overview))
                await page.route('**/api/domains/atlas',lambda r:r.fulfill(json=atlas))
                values=await check_simplified(page,origin,shots)
                await check_retained(page,origin,shots)
                (shots/'results.json').write_text(json.dumps(values,ensure_ascii=False,indent=2),encoding='utf-8')
                assert not errors,errors
                await browser.close()
                print('PASS 01 single-click state machine, back steps, siblings, hover isolation, comparison, visuals and legacy URLs')
        finally:
            server.should_exit=True;thread.join(timeout=15);listener.close()

if __name__=='__main__':asyncio.run(main())
