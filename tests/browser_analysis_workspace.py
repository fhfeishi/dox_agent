"""The fixed task of query 2026-1016 1814, walked as an ordinary user: receive project files, see what
needs attention, pick two projects, compare them, save the answer and deliver a report for the same scope,
then reach 成果 — without choosing the material twice. Real service, storage, project index and browser;
only the answer model and the report writer are stand-ins."""
import asyncio
import re
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from playwright.async_api import async_playwright, expect
from pydantic import SecretStr

import src.api.reports as reports_api
from src.agent.config import Settings
from src.agent.corpora import scan_corpora
from src.agent.graph import build_graph
from src.knowledge import Knowledge
from src.main import create_app
from src.parsers import import_defaults
from tests.browser_artifacts_live import start_server

REPORT = "# 两种装配路线对比\n\n视觉力觉融合阻抗控制与示教强化学习各有侧重 [1]。\n"
PACK = {
    "2022_2025_62273001_张明_基于多模态感知的柔性装配机器人.md": "# 项目报告\n项目名称：基于多模态感知的柔性装配机器人\n批准号：62273001\n采用视觉与力觉融合的阻抗控制完成装配。",
    "2022_2025_62273001_张明_柔性装配机器人中期报告.md": "# 中期进展\n批准号：62273001\n装配插接成功率由 82% 提升到 94%。",
    "2022_2025_62273015_李华_面向精密装配的强化学习示教机器人.md": "# 项目报告\n项目名称：面向精密装配的强化学习示教机器人\n批准号：62273015\n示教学习与强化学习结合完成装配。",
    "柔性装配机器人-副本.md": "# 项目报告\n项目名称：基于多模态感知的柔性装配机器人\n批准号：62273001\n采用视觉与力觉融合的阻抗控制完成装配。",
    "扫描件_无正文.txt": b"\xff\xfe\x00broken",
}


class Answer:
    async def astream(self, messages):
        yield SimpleNamespace(content="两个项目的装配路线不同：阻抗控制与示教学习 [1]。")


async def fake_report(knowledge, settings, params, **kwargs):
    return REPORT


async def main():
    reports_api.generate_markdown = fake_report
    with TemporaryDirectory(prefix="dox-workspace-") as directory:
        root = Path(directory)
        corpus = root/"corpora"/"自然科学基金-机器人验收"
        source = corpus/"source"; source.mkdir(parents=True)
        (source/"2021_2024_62173009_王强_既有的巡检机器人项目.md").write_text("# 项目报告\n批准号：62173009\n巡检机器人。")
        settings = Settings(_env_file=None, state_dir=root/"state", corpora_root=root/"corpora", user_dir=root/"usr",
                            model_api_key=SecretStr("fixture"), embedding_path="")
        import_defaults(Knowledge(corpus/"datadb"/"knowledge.sqlite3", settings=settings, source_root=source), settings,
                        root=source, parsed_root=corpus/"parsed")
        scan_corpora(settings)
        pack = root/"新到资料"; pack.mkdir()
        for name, body in PACK.items():
            (pack/name).write_bytes(body if isinstance(body, bytes) else body.encode())
        app = create_app(settings, graph_factory=lambda k, s: build_graph(k, s, Answer()))
        origin, server, thread, listener = start_server(app)
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 900})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.on("dialog", lambda dialog: asyncio.ensure_future(dialog.accept()))
                reports = []
                page.on("request", lambda req: reports.append(req.post_data_json) if req.url.endswith("/api/reports") and req.method == "POST" else None)
                stages = {}
                actions = 0
                async def act(locator):
                    nonlocal actions; actions += 1; await locator.click()
                # Adding files to a system library is the administrator's (D-20261027-1); the journey after it
                # (compare, report) is the same for every role.
                await page.request.post(origin+"/api/auth/login", data={"username": "admin", "password": "123456"})
                await page.goto(origin+"/home")
                await page.evaluate("""async()=>{for(const k of ['home','overview','chat','library','tasks','review','intelligence','results']) await fetch('/api/auth/guides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k})})}""")
                # 1. Receive: a folder upload; only the unreadable file is reported as failed.
                await act(page.get_by_role("link", name="资料库", exact=True))
                await act(page.get_by_role("button", name=re.compile("^打开资料库")).first)
                guide = page.get_by_role("button", name="知道了")
                if await guide.count(): await guide.click()
                await page.get_by_label("上传文件夹", exact=True).set_input_files(str(pack)); actions += 1
                progress = page.get_by_role("list", name="本次添加进度")
                await expect(progress.get_by_text("已入库", exact=True)).to_have_count(4, timeout=30000)
                await expect(progress.get_by_text("已保存，解析失败", exact=True)).to_have_count(1)
                # 2. Organise: by project; the copy and the unreadable file are named on the list.
                projects = page.get_by_role("list", name="项目列表")
                zhang = projects.get_by_role("listitem").filter(has_text="62273001").first
                await expect(zhang).to_contain_text("含重复内容 1")
                await expect(page.get_by_role("list", name="未入库的文件")).to_contain_text("扫描件_无正文.txt")
                # The copy is removed where it is named; the project keeps its two real files.
                await act(zhang.get_by_role("button", name=re.compile("份文件")))
                await act(zhang.get_by_role("button", name="删除副本"))
                await expect(zhang).not_to_contain_text("含重复内容")
                await expect(zhang).to_contain_text("2 份文件")
                stages["接收与整理"] = actions
                # 3. Find and pick two projects: one tick per project.
                await page.get_by_label("搜索资料", exact=True).fill("装配"); actions += 1
                await act(zhang.get_by_role("checkbox").first)
                await act(projects.get_by_role("checkbox", name=re.compile("选择项目 面向精密装配")))
                # Opening a file and reloading the page keep what was ticked (upgrade plan F2).
                picked = page.get_by_role("region", name="已选资料")
                await expect(picked).to_contain_text("已选 3 份资料")
                await zhang.get_by_role("button", name="预览").first.click()
                await expect(page.locator("aside[aria-hidden='false']")).to_contain_text("62273001")
                await expect(picked).to_contain_text("已选 3 份资料")
                await page.reload()
                await expect(picked).to_contain_text("已选 3 份资料")
                await act(page.get_by_role("region", name="已选资料").get_by_role("button", name="与这些资料对话"))
                work = page.get_by_role("region", name="与资料对话")
                await expect(work.get_by_label("分析范围")).to_contain_text("2 个项目 · 3 份文件")
                await expect(work.get_by_role("button", name="比较这些项目的技术路线、方法与已取得成果的异同。")).to_be_visible()
                # 4. Compare within that scope (typed: keyword retrieval in this fixture has no embeddings).
                await work.get_by_label("向所选资料提问").fill("这两个装配项目的路线有何不同？"); actions += 1
                await act(work.get_by_role("button", name="发送", exact=True))
                await expect(work).to_contain_text("两个项目的装配路线不同")
                stages["选择与对比"] = actions - sum(stages.values())
                # 5. Keep the answer and deliver a report for the same scope.
                await act(work.get_by_role("button", name="保存到报告中心"))
                await expect(page.get_by_text(re.compile("已保存到报告中心「"))).to_be_visible()
                await act(work.get_by_role("button", name="以此生成报告"))
                await act(work.get_by_role("form", name="生成报告").get_by_role("button", name="生成"))
                report = work.get_by_role("article", name=re.compile("^报告："))
                await expect(report).to_contain_text("已生成并保存到“报告中心”", timeout=30000)
                await act(report.get_by_role("button", name="打开报告"))
                await expect(page.locator("aside[aria-hidden='false']")).to_contain_text("两种装配路线对比")
                # The report used exactly the picked files, never the whole library.
                runs = await (await page.request.get(origin+"/api/artifacts?limit=10")).json()
                kinds = {item["type"] for item in runs}
                assert kinds == {"answer_snapshot", "report"}, kinds
                stages["保存与报告"] = actions - sum(stages.values())
                # The report covers exactly the three files of the two picked projects; nothing was chosen twice.
                assert len(reports) == 1 and len(reports[0]["doc_ids"]) == 3, reports
                await page.screenshot(path=str(Path(".logsdev/verification/query-20261016-1814")/"workspace-report.png"))
                # 5b. The conversation is kept in 会话历史 as 资料分析（精准问答） and reopens in the workspace
                # with the materials it was asked about (query 2026-1020 1719).
                await expect(work.get_by_role("button", name="导出此回答为 Word")).to_be_visible()
                await expect(page).to_have_url(re.compile(r"[?&]session="))
                await page.goto(origin+"/chat")
                held = page.get_by_role("button", name=re.compile("这两个装配项目的路线有何不同？.*资料分析（精准问答）"))
                await held.click()
                await expect(page).to_have_url(re.compile(r"/documents\?.*workspace=1&session="))
                back = page.get_by_role("region", name="与资料对话")
                await expect(back.get_by_label("分析范围")).to_contain_text("2 个项目 · 3 份文件")
                await expect(back).to_contain_text("两个项目的装配路线不同")
                await page.screenshot(path=str(Path(".logsdev/verification/query-20261020-1719")/"workspace-reopened.png"))
                # 6. 存量分析 opens the task's conversation with its walkthrough (query 2026-1020 1719).
                await page.goto(origin+"/tasks")
                await page.locator("article").filter(has_text="对比分析").get_by_role("button", name="开始分析").first.click()
                await expect(page).to_have_url(re.compile(r"/chat$"))
                guide = page.get_by_role("dialog", name="对比分析使用指引")
                await expect(guide).to_contain_text("第 1/5 步")
                await guide.get_by_role("button", name="下一步").click()
                await expect(guide).to_contain_text("选择资料范围")
                await guide.get_by_role("button", name="跳过").click()
                await expect(guide).to_be_hidden()
                assert not errors, errors
                await browser.close()
            print(f"PASS fixed task in {actions} actions {stages}: upload, duplicates and failures named, two projects, compare, save, report for the same scope, reopened from 会话历史 with its materials, 存量分析 into the task conversation")
        finally:
            server.should_exit = True; thread.join(timeout=10); listener.close()


asyncio.run(main())
