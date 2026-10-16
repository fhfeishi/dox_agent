"""Real library files, local retrieval and same-page scoped chat; only the answer model is controlled."""
import asyncio
import re
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from urllib.parse import quote
from playwright.async_api import async_playwright, expect
from pydantic import SecretStr
from src.agent.config import Settings
from src.agent.corpora import scan_corpora
from src.agent.graph import build_graph
from src.knowledge import Knowledge
from src.main import create_app
from src.parsers import import_defaults
from tests.browser_artifacts_live import start_server


class Answer:
    async def astream(self, messages):
        yield SimpleNamespace(content="量子传感的光学方法见所选资料 [1]。")


async def main():
    with TemporaryDirectory(prefix="dox-library-list-") as directory:
        root = Path(directory)
        corpus = root/"corpora"/"自然科学基金-验收"
        source = corpus/"source"; source.mkdir(parents=True)
        for i in range(45):
            name = f"2021_2025_A{i:02d}_某人_量子报告.md" if i < 2 else f"其他资料{i:02d}.md"
            body = "# 国家自然科学基金\n量子传感的光学方法与噪声抑制" if i < 2 else "# 农业材料\n土壤与灌溉"
            if i < 2: body += f"\n批准资助金额：{100*(i+1)}万元\n直接费用：{10*(i+1)}万元"
            (source/name).write_text(body)
        settings = Settings(_env_file=None, state_dir=root/"state", corpora_root=root/"corpora",
                            user_dir=root/"usr", model_api_key=SecretStr("fixture"), embedding_path="")
        knowledge = Knowledge(corpus/"datadb"/"knowledge.sqlite3", settings=settings, source_root=source)
        import_defaults(knowledge, settings, root=source, parsed_root=corpus/"parsed")
        cid = scan_corpora(settings)[0].id
        app = create_app(settings, graph_factory=lambda k, s: build_graph(k, s, Answer()))
        origin, server, thread, listener = start_server(app)
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 1000})
                errors=[]; payloads=[]
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.on("request", lambda req: payloads.append(req.post_data_json) if req.url.endswith("/api/chat") and req.method=="POST" else None)
                await page.request.post(origin+"/api/auth/login", data={"username":"admin","password":"123456"})
                url=origin+"/library/"+quote(cid)+"/documents"
                await page.goto(url)
                await page.get_by_role("dialog", name="资料库 操作指南").get_by_role("button",name="知道了").click()
                listing=page.get_by_role("list",name="资料列表",exact=True)
                await expect(listing.get_by_role("listitem")).to_have_count(40)
                await page.get_by_role("button",name="下一页",exact=True).click()
                await expect(listing.get_by_role("listitem")).to_have_count(5)
                await page.get_by_label("搜索方式").select_option("content")
                await page.get_by_label("搜索资料",exact=True).fill("量子传感")
                await expect(listing.get_by_role("listitem")).to_have_count(2)
                await listing.get_by_role("checkbox").nth(0).check()
                await listing.get_by_role("checkbox").nth(1).check()
                await page.get_by_role("region",name="已选资料",exact=True).get_by_role("button",name="与这些资料对话").click()
                chat=page.get_by_role("region",name="与所选资料对话",exact=True)
                await expect(chat.get_by_role("button",name=re.compile("^移出范围"))).to_have_count(2)
                await page.get_by_label("向所选资料提问").fill("量子传感有什么光学方法？")
                await chat.get_by_role("button",name="发送",exact=True).click()
                await expect(chat).to_contain_text("量子传感的光学方法见所选资料")
                assert "/documents" in page.url and "/chat" not in page.url
                assert payloads[-1]["corpus_ids"] == [cid]
                assert len(payloads[-1]["allowed_doc_ids"]) == 2
                # With nothing ticked the chat asks the whole library; its starters carry their task (query 2026-1016 0919).
                await chat.get_by_role("button",name="新对话").click()
                await chat.get_by_role("button",name="清空",exact=True).click()
                await expect(chat).to_contain_text("范围 · 整个资料库")
                await chat.get_by_role("button",name="比较这些项目的数据、方法和已取得成果。").click()
                await expect(chat).to_contain_text("在整个资料库中")
                await expect(chat.get_by_text("量子传感的光学方法见所选资料")).to_have_count(1)
                assert payloads[-1]["allowed_doc_ids"] is None and payloads[-1]["task_id"] == "task2"
                shots=Path(".logsdev/verification/query-20261015-1142");shots.mkdir(parents=True,exist_ok=True)
                await page.screenshot(path=str(shots/"files-chat.png"),full_page=True)
                await page.set_viewport_size({"width":390,"height":844})
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
                await page.set_viewport_size({"width":1440,"height":1000})
                upload_dir = root/"新资料"
                (upload_dir/"甲").mkdir(parents=True); (upload_dir/"乙").mkdir()
                for folder in ("甲", "乙"):
                    (upload_dir/folder/"same.md").write_text("# 补充材料\n量子传感补充资料")
                await page.get_by_label("上传文件夹",exact=True).set_input_files(str(upload_dir))
                await expect(page.get_by_role("list",name="本次添加进度").get_by_text("已入库",exact=True)).to_have_count(2)
                files=(await (await page.request.get(origin+f"/api/corpora/{quote(cid)}/files")).json())["files"]
                assert {"新资料/甲/same.md", "新资料/乙/same.md"} <= {f["rel_path"] for f in files}
                # 年度分布与资料文件、技术研判、项目关系并列（query 2026-1015 1714）。
                await page.get_by_role("button",name="年度分布",exact=True).click()
                await expect(page.get_by_label("技术研判视角")).to_have_count(0)
                # Projects per year beside funding; the question block and related projects are gone.
                await expect(page.get_by_role("region",name="年度分布-项目数量")).to_be_visible()
                await expect(page.get_by_role("button",name="2021 年：2 个项目，查看清单",exact=True)).to_be_visible()
                await expect(page.get_by_text("选择一个问题",exact=False)).to_have_count(0)
                await expect(page.get_by_role("heading",name=re.compile("^关联项目"))).to_have_count(0)
                await page.get_by_role("button",name="2021 年：2 个项目，查看清单",exact=True).hover()
                await expect(page.get_by_role("status").filter(has_text="2021 年")).to_contain_text("2 个项目立项")
                await expect(page.get_by_role("button",name="2021 年已知批准资助金额合计 300 万元，2 个项目",exact=True)).to_be_visible()
                await page.get_by_label("金额口径").select_option("direct")
                await expect(page.get_by_role("button",name="2021 年已知直接经费合计 30 万元，2 个项目",exact=True)).to_be_visible()
                shots=Path(".logsdev/verification/query-20261015-1142");shots.mkdir(parents=True,exist_ok=True)
                await page.screenshot(path=str(shots/"funding.png"),full_page=True)
                await page.request.post(origin+"/api/auth/logout")
                await page.request.post(origin+"/api/auth/login",data={"username":"owner","password":"123456"})
                await page.goto(origin+"/home")
                # 领导首页与“概览·资料库建设”合并（query 2026-1016）。
                await expect(page.get_by_role("heading",name="从领域分布，看研究积累")).to_be_visible()
                guide=page.get_by_role("button",name="知道了")
                if await guide.count(): await guide.click()
                await expect(page.get_by_role("region",name="最近报告",exact=True)).to_have_count(0)
                await expect(page.get_by_role("button",name="概览 ▾",exact=True)).to_have_count(0)
                await expect(page.get_by_role("navigation",name="主导航").get_by_role("link",name="领域分析",exact=True)).to_be_visible()
                await page.get_by_role("button",name="资料库",exact=True).click()
                guide=page.get_by_role("button",name="知道了")
                if await guide.count(): await guide.click()
                await page.get_by_role("button",name="打开",exact=True).first.click()
                await expect(page.get_by_role("button",name="技术研判",exact=True)).to_have_attribute("aria-pressed","true")
                await page.set_viewport_size({"width":390,"height":844})
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
                # Overall design: role-specific pages, in-place exploration, readable narrow viewport.
                shots = Path(".logsdev/verification/design-20261015")
                shots.mkdir(parents=True, exist_ok=True)
                await page.set_viewport_size({"width":1440,"height":1000})
                await page.goto(origin+"/overview/build")
                await expect(page).to_have_url(re.compile(r"/home$"))
                await expect(page.get_by_role("heading",name="从领域分布，看研究积累")).to_be_visible()
                await expect(page.get_by_role("region",name="领域分布").get_by_role("button")).to_have_count(1)
                guide=page.get_by_role("button",name="知道了")
                if await guide.count(): await guide.click()
                await page.screenshot(path=str(shots/"leader.png"))
                await page.get_by_role("region",name="领域分布").get_by_role("button").click()
                await expect(page.get_by_label("分析视角")).to_be_visible()
                history = await page.evaluate("history.length")
                await page.get_by_label("分析视角").select_option("years")
                await page.get_by_label("分析视角").select_option("relations")
                assert await page.evaluate("history.length") == history
                await page.request.post(origin+"/api/auth/logout")
                await page.request.post(origin+"/api/auth/login",data={"username":"admin","password":"123456"})
                await page.goto(origin+"/overview/build")
                await expect(page.get_by_role("heading",name="资料建设与运行维护")).to_be_visible()
                await expect(page.get_by_role("table")).to_contain_text("场景 0")
                await expect(page.get_by_text("正在读取维护事项…",exact=True)).to_have_count(0)
                guide=page.get_by_role("button",name="知道了")
                if await guide.count(): await guide.click()
                await page.screenshot(path=str(shots/"admin.png"))
                # Failure must not masquerade as an empty maintenance list.
                await page.route("**/api/results/summary", lambda route: route.fulfill(status=503,json={"detail":"unavailable"}))
                await page.reload()
                await expect(page.get_by_role("alert").filter(has_text="部分数据读取失败")).to_be_visible(timeout=15000)
                await expect(page.get_by_text("暂无需要处理的事项。",exact=True)).to_have_count(0)
                await page.unroute("**/api/results/summary")
                await page.request.post(origin+"/api/auth/logout")
                await page.request.post(origin+"/api/auth/login",data={"username":"user","password":"123456"})
                await page.goto(origin+"/home")
                await expect(page.get_by_role("heading",name="今天，从哪项工作开始？")).to_be_visible()
                guide=page.get_by_role("button",name="知道了")
                if await guide.count(): await guide.click()
                await expect(page.get_by_role("region",name="开始工作").get_by_role("link")).to_have_count(4)
                # Users keep libraries too (query 2026-1016 0919); regenerating structure stays the administrator's.
                created = await page.request.post(origin+"/api/corpora",data={"name":"用户资料库"})
                assert created.status == 201, created.status
                assert (await page.request.post(origin+f"/api/corpora/{quote((await created.json())['id'])}/lineage",data={})).status == 403
                await page.goto(origin+"/library")
                await expect(page.get_by_role("button",name="新建资料库")).to_be_visible()
                await page.goto(origin+"/home")
                await page.screenshot(path=str(shots/"user.png"))
                await page.set_viewport_size({"width":390,"height":844})
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
                await page.screenshot(path=str(shots/"user-mobile.png"))
                assert not errors,errors
                await browser.close()
            print("PASS pagination, scoped body search, two-document in-place chat, funding totals, leader defaults and navigation")
        finally:
            server.should_exit=True;thread.join(timeout=10);listener.close()

asyncio.run(main())
