"""Offline browser acceptance: the corpus-level scene hierarchy and the achievement aspect page.

Serves the built `frontend/dist` with mocked APIs and verifies:
- 技术谱系 is the first view: generated only on click, a technique shows its place in the tree,
  the problems it answers, the supporting techniques and its projects;
- a scene opens its 场景 → 问题 → 技术 → 成果 logic diagram; problems link to techniques;
- 成果 lists what the reports' own 成果列表 state;
- a generated hierarchy lists scenes with the real counts and shows the gap against the targets;
- entering a scene shows its issues with 已解决/待解决 and the traceable tech routes;
- the deep-linked related-analysis page groups the eight aspects per achievement, keeps
  原文未提及 for unevidenced aspects, and returns to the scene without losing the route;
- clicking a citation opens the cited file version and refuses a version that changed;
- a stale hierarchy says it must be regenerated instead of presenting old numbers silently.
"""

import asyncio
import os
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect

BROWSER = os.environ.get("DOX_BROWSER_EXECUTABLE") or None

CORPUS_ID = "c1"
DOC_ID = "d1"
VERSION = "pdfv0001aaaaaaaa"
NEW_VERSION = "pdfv0001bbbbbbbb"
POSTS: list[str] = []
LINEAGE_POSTS: list[str] = []


def lineage(ready: bool):
    levels = {"0": "未判定", "1": "理论与方法研究", "2": "算法与模型验证", "3": "原型与样机验证",
              "4": "系统集成与场景试验", "5": "示范应用与转化"}
    return {"corpus_id": CORPUS_ID, "state": "ready" if ready else "missing", "branch": "AI与医疗", "gaps": [],
            "maturity_levels": levels,
            "categories": [{"name": "机器学习", "summary": "学习方法。", "plain": "让计算机从病例中学规律", "children": [
                {"name": "深度学习方法", "plain": "多层识别模型", "foundation": False, "themes": [{"name": "网络模型", "items": ["NSFC:123456|t1", "NSFC:123456|t2"]}]},
                {"name": "数据与样本库", "plain": "规范收集和保存病例数据", "foundation": True, "themes": [{"name": "数据库建设", "items": ["NSFC:123456|t3"]}]}]}]
            if ready else [],
            "items": {"NSFC:123456|t1": {"name": "深度学习", "desc": "以深度学习提升识别。", "project_id": "NSFC:123456", "item_id": "t1", "maturity": 3, "basis": "形成原型系统", "field": "临床诊疗", "stage": "诊断与分型"},
                      "NSFC:123456|t2": {"name": "数据增强", "desc": "扩充样本。", "project_id": "NSFC:123456", "item_id": "t2", "maturity": 2, "basis": "公开数据集验证", "field": "临床诊疗", "stage": "诊断与分型"},
                      "NSFC:123456|t3": {"name": "多中心数据库", "desc": "建成数据库。", "project_id": "NSFC:123456", "item_id": "t3", "maturity": 4, "basis": "多中心应用", "field": "临床诊疗", "stage": ""}} if ready else {},
            "fields": [{"name": "临床诊疗", "plain": ""}],
            "stages": [{"name": "诊断与分型", "plain": "判断是什么病、属于哪一型"}, {"name": "疗效评估与预后", "plain": ""}]}


SCENE_EVIDENCE = [{"item_id": "s1", "doc_id": DOC_ID, "version": VERSION,
                   "quote": "临床诊疗场景", "locator": {"basis": "pdf_page", "page": 3}}]
ASPECTS = [
    ("论文", "已取得", "报告记载发表论文。", True),
    ("专利", "原文未提及", "", False),
    ("人才/团队", "在研", "培养研究生。", True),
    ("平台/基地", "原文未提及", "", False),
    ("数据与样本", "原文未提及", "", False),
    ("指标达成", "原文未提及", "", False),
    ("标准/许可", "原文未提及", "", False),
    ("转化与应用", "仅预期", "预期在临床落地。", True),
]


def hierarchy(state="ready", message=""):
    aspects = [{"aspect": name, "stage": stage, "note": note, "answered": answered,
                "item_ids": ["o1"] if stage != "原文未提及" else [],
                "evidence": SCENE_EVIDENCE if stage != "原文未提及" else []}
               for name, stage, note, answered in ASPECTS]
    return {
        "corpus_id": CORPUS_ID, "state": state, "message": message, "fingerprint": "fp",
        "process": {"status": "已完成"}, "generated_at": "2026-10-08T09:00:00+00:00",
        "topics": {"场景": 6, "问题": 5, "技术": 3, "成果": 2},
        "scenes": [{
            "name": "临床诊疗", "summary": "围绕临床诊疗流程展开。",
            "project_ids": ["NSFC:123456"], "item_ids": ["s1"], "evidence": SCENE_EVIDENCE,
            "issues": [
                {"name": "病灶识别困难", "state": "已解决", "summary": "已有深度学习方法。",
                 "project_ids": ["NSFC:123456"], "item_ids": ["p1"], "evidence": SCENE_EVIDENCE,
                 "routes": [{"title": "深度学习", "summary": "以深度学习提升识别。",
                             "project_ids": ["NSFC:123456"], "item_ids": ["t1"],
                             "evidence": SCENE_EVIDENCE}]},
                {"name": "标注数据不足", "state": "待解决", "summary": "库内尚无对应技术。",
                 "project_ids": ["NSFC:123456"], "item_ids": ["p2"], "evidence": SCENE_EVIDENCE,
                 "routes": []}],
            "achievements": [{"title": "原型系统", "summary": "已形成原型系统。",
                              "marker_basis": {"projects": 1, "representative": "示例报告", "note": ""},
                              "project_ids": ["NSFC:123456"], "item_ids": ["o1"],
                              "evidence": SCENE_EVIDENCE, "aspects": aspects}]}],
        "coverage": {"targets": {"scenes": 6, "issues_per_scene": 3, "routes_per_issue": 2,
                                 "achievements_per_scene": 3},
                     "scenes": 1, "issues": 2, "solved_issues": 1, "open_issues": 1,
                     "routes": 1, "achievements": 1,
                     "gaps": [{"kind": "aspect", "detail": "临床诊疗/原型系统：6 个方面未给出结论，按原文未提及显示"}]},
    }


def corpora():
    return [{"id": CORPUS_ID, "name": "演示库", "kind": "demo", "domain": "x", "rel_path": CORPUS_ID,
             "docs_count": 4, "preparation": "ready", "is_default": True, "index_progress": None,
             "job": None, "source_count": 4, "indexed_count": 4, "pending_count": 0, "failed_count": 0}]


class AppHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        return

    def do_GET(self):
        # Application routes are client-side: a reload on a deep link must serve the shell.
        if self.path.startswith(("/library", "/chat", "/tasks", "/artifacts", "/prompts")):
            self.path = "/index.html"
        super().do_GET()


async def main():
    root = Path(__file__).resolve().parents[1]
    dist = Path(os.environ.get("DOX_WEB_DIST") or root / "frontend/dist")
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(AppHandler, directory=str(dist)))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    document_version = {"value": VERSION}

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, executable_path=BROWSER)
            page = await browser.new_page(viewport={"width": 1440, "height": 950})
            page_errors: list[str] = []
            page.on("pageerror", lambda error: page_errors.append(str(error)))

            await page.route("**/api/health", lambda r: r.fulfill(
                json={"preparation": "ready", "api_key_configured": True, "model": "offline"}))
            await page.route("**/api/tasks**", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions**", lambda r: r.fulfill(json=[]))
            await page.route(re.compile(r".*/api/workspace/sessions/[^/]+$"), lambda r: r.fulfill(
                json={**(r.request.post_data_json or {}), "id": r.request.url.rsplit("/", 1)[-1], "revision": 1}))
            await page.route(re.compile(r".*/api/corpora(\?.*)?$"), lambda r: r.fulfill(json=corpora()))
            await page.route(re.compile(r".*/api/corpora/[^/]+/files.*$"), lambda r: r.fulfill(
                json={"source_dir": "/tmp", "files": [], "misplaced_files": []}))
            await page.route(re.compile(r".*/api/corpora/[^/]+/projects$"), lambda r: r.fulfill(json={
                "projects": [{"project_id": "NSFC:123456", "number": "123456", "title": "示例项目", "identity_status": "identified",
                              "start_year": 2019, "end_year": 2022, "year_conflict": False, "code": "F0601", "files": [],
                              "facets": {key: {"items": [{"id": "t1", "name": "深度学习", "desc": "", "doc_id": DOC_ID, "version": VERSION}] if key == "技术" else [],
                                               "covered_files": 0, "evidence_files": 0} for key in ("场景", "问题", "技术", "成果")},
                              "funding": [], "funding_conflicts": []}],
                "coverage": {"files": 0, "identified_projects": 1, "pending_identity_records": 0,
                "dimensions": {key: {"evidence_projects": 0, "fully_processed_projects": 0, "items": []}
                               for key in ("场景", "问题", "技术", "成果")},
                "funding": {}}}))
            async def hierarchy_api(route):
                if route.request.method == "POST":
                    POSTS.append(route.request.post_data or "{}")
                await route.fulfill(json=hierarchy())

            await page.route(re.compile(r".*/api/corpora/[^/]+/hierarchy$"), hierarchy_api)

            async def lineage_api(route):
                if route.request.method == "POST":
                    LINEAGE_POSTS.append(route.request.post_data or "{}")
                await route.fulfill(json=lineage(bool(LINEAGE_POSTS)))

            await page.route(re.compile(r".*/api/corpora/[^/]+/lineage$"), lineage_api)
            # The technique's own report record: original evidence and relations stated in the text.
            await page.route(re.compile(r".*/api/corpora/[^/]+/reports/[^/]+/target$"), lambda r: r.fulfill(json={
                "facets": [{"key": "技术", "items": [
                    {"id": "t1", "name": "深度学习", "evidence": [{"quote": "以深度学习提升病灶识别", "locator": {"basis": "pdf_page", "page": 3}, "version": VERSION}]},
                    {"id": "t3", "name": "多中心数据库"}]}, {"key": "问题", "items": [{"id": "p1", "name": "病灶识别困难"}]}],
                "relations": [{"from": {"dimension": "技术", "item_id": "t1"}, "to": {"dimension": "技术", "item_id": "t3"}, "type": "配套",
                               "evidence": [{"quote": "依托多中心数据库训练模型"}]},
                              {"from": {"dimension": "技术", "item_id": "t1"}, "to": {"dimension": "问题", "item_id": "p1"}, "type": "针对"}]}))
            await page.route(re.compile(r".*/api/corpora/[^/]+/outputs$"), lambda r: r.fulfill(json={
                "corpus_id": CORPUS_ID, "coverage": {"files": 1, "with_list": 1}, "projects": {"NSFC:123456": {
                    "declared": 2, "counts": {"专利": 1, "期刊论文": 1}, "doc_id": DOC_ID, "version": VERSION,
                    "items": [{"type": "专利", "title": "一种病灶识别方法"}, {"type": "期刊论文", "title": "Deep lesion"}]}}}))

            async def documents(route):
                await route.fulfill(json=[{"doc_id": DOC_ID, "title": "示例报告", "origin": "示例报告.pdf",
                                           "version": document_version["value"], "captured_at": "", "kind": "pdf",
                                           "parser": "pypdf", "pages": 9}])
            await page.route(re.compile(r".*/api/documents(\?.*)?$"), documents)
            await page.route(re.compile(r".*/api/documents/[^/]+/file.*$"), lambda r: r.fulfill(
                status=200, content_type="application/pdf",
                headers={"Content-Disposition": "inline; filename=x.pdf"},
                body=b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"))

            await page.goto(origin)
            await page.get_by_role("button", name="资料库", exact=True).click()
            await page.get_by_role("button", name="四维浏览", exact=True).first.click()

            block = page.get_by_label("场景层级", exact=True)
            tabs = block.get_by_role("tablist", name="四维浏览")
            # 技术谱系是第一个视图；只在点击时生成，不在打开页面时调用模型。
            await expect(tabs.get_by_role("tab", name="技术谱系 尚未生成")).to_have_attribute("aria-selected", "true")
            assert LINEAGE_POSTS == [], LINEAGE_POSTS
            # 默认是汇报视图；谱系未生成时引导到技术视图生成。
            await block.get_by_role("button", name="在下方细节中生成技术谱系 ↓").click()
            await block.get_by_role("button", name="生成技术谱系", exact=True).click()
            await expect(tabs.get_by_role("tab", name="技术谱系 1 个技术体系 · 3 个技术条目")).to_be_visible()
            assert len(LINEAGE_POSTS) == 1, LINEAGE_POSTS

            # 总览：每个领域一张卡（问题进展与指标）、共性底座；展开页只按环节列全部技术，问题与成果链接到各自页签。
            # 总览、细节上下排列；总览先给本库要点卡片（各有一句结论），可收起。
            insights = block.get_by_role("region", name="本库总览要点")
            for title in ("研究规模", "技术重心", "应用重心", "成熟与转化"):
                await expect(insights).to_contain_text(title)
            board = block.get_by_role("region", name="主展板")
            await expect(board.locator("article")).to_have_count(1)
            await expect(board).to_contain_text("临床诊疗1 个项目 · 3 个技术条目")
            await expect(board).to_contain_text("✔病灶识别困难")
            await expect(board).to_contain_text("➜标注数据不足")
            foundation = block.get_by_role("region", name="共性技术底座")
            await expect(foundation).to_contain_text("数据与样本库")
            await expect(foundation).to_contain_text("规范收集和保存病例数据")
            await board.get_by_role("button", name="展开：按环节查看全部技术 →").click()
            scene = block.get_by_role("region", name="展开页：临床诊疗")
            await expect(scene.get_by_role("tab", name="诊断与分型 · 1")).to_have_attribute("aria-selected", "true")
            await expect(scene).to_contain_text("判断是什么病、属于哪一型")
            await scene.locator("summary").filter(has_text="深度学习方法").click()
            await expect(scene.get_by_role("button", name="示例项目").first).to_be_visible()
            await expect(scene).to_contain_text("依据：形成原型系统")
            await expect(scene).not_to_contain_text("本期突破病灶识别困难")  # problems live on the 问题 tab now
            await block.get_by_role("radio", name="成型技术及以上").click()
            await expect(block.get_by_role("status").filter(has_text="当前筛选")).to_contain_text("已收起 2 个")
            await block.get_by_role("button", name="显示全部").click()
            await scene.get_by_role("button", name="标志性成果与方面完成度 →").click()
            await expect(tabs.get_by_role("tab", name=re.compile("^成果"))).to_have_attribute("aria-selected", "true")
            await expect(block).to_contain_text("成果 · 做到什么程度")
            await tabs.get_by_role("tab", name=re.compile("^技术谱系")).click()
            await board.get_by_role("button", name="展开：按环节查看全部技术 →").click()
            await scene.locator("summary").filter(has_text="深度学习方法").click()
            await scene.get_by_role("button", name="深度学习", exact=True).click()

            # 技术视图：五级树逐级展开；分支显示项目周期与报告所述阶段，条目显示阶段与同项目还涉及的技术。
            # 细节：按层分列的谱系图（同层保留、单支下钻）、领域/环节筛选，右侧五段详情。
            graph = block.get_by_role("region", name="技术谱系图谱")
            detail = block.get_by_label("技术详情")
            nav = block.get_by_role("navigation", name="谱系位置")
            await expect(nav).to_contain_text(re.compile(r"机器学习\s*›\s*深度学习方法\s*›\s*网络模型\s*›\s*深度学习"))
            for name in ("R3：机器学习", "R4：深度学习方法", "R4：数据与样本库", "R5：网络模型",
                         "R6：深度学习", "R6：数据增强"):
                await expect(graph.get_by_role("button", name=name)).to_be_visible()
            await expect(graph.get_by_role("button", name="R4：数据与样本库")).to_contain_text("共性底座")
            for title in ("技术定位", "应用任务", "实现与配套", "项目与成果", "原文依据"):
                await expect(detail.get_by_role("heading", name=title)).to_be_visible()
            await expect(detail).to_contain_text("应用领域：临床诊疗")
            await expect(detail).to_contain_text("业务环节：诊断与分型")
            await expect(detail).to_contain_text("原文所述针对问题：病灶识别困难")
            await expect(detail).to_contain_text("原文明示配套：多中心数据库")
            await expect(detail).to_contain_text("同项目还涉及的技术")
            await expect(detail).to_contain_text("报告所述阶段：攻关验证3 原型与样机验证")
            await expect(detail).to_contain_text("以深度学习提升病灶识别")
            # 筛选：只看“环节未判定”时只剩多中心数据库，网络模型分支显示 0 并弱化。
            filters = block.get_by_label("谱系筛选")
            await filters.get_by_role("button", name=re.compile("^环节未判定")).click()
            await expect(filters.get_by_role("status")).to_contain_text("匹配 1 个项目、1 条技术")
            await expect(graph.get_by_role("button", name="R5：网络模型")).to_contain_text("0 项目")
            await filters.get_by_role("button", name="恢复全部").click()
            # 分支详情：通俗说明、按条目统计的阶段与项目周期图。
            await nav.get_by_role("button", name="机器学习").click()
            await expect(detail).to_contain_text("让计算机从病例中学规律")
            await expect(detail.get_by_role("img", name="项目周期与验证阶段图")).to_be_visible()
            await expect(detail).to_contain_text("最早立项 2019")
            await expect(detail).to_contain_text("本分支已有项目报告达到 系统集成与场景试验")
            await expect(detail).not_to_contain_text("发展节点")
            await graph.get_by_role("button", name="放大").click()
            await expect(graph).to_contain_text(re.compile(r"滚轮缩放 · 拖动平移 · \d+%"))
            for name in ("R4：深度学习方法", "R5：网络模型", "R6：深度学习"):
                await graph.get_by_role("button", name=name).click()
            await detail.get_by_role("button", name="病灶识别困难").click()
            await expect(tabs.get_by_role("tab", name="问题 2 个核心问题 · 目标 18")).to_have_attribute("aria-selected", "true")

            # 四个维度按钮显示实际数量与目标，缺量不被写成达标。
            await expect(tabs.get_by_role("tab", name="场景 1 类 · 目标 6")).to_be_visible()
            await expect(block.get_by_text("未达目标或未采用的条目", exact=False)).to_be_visible()
            # 主题归纳等视图移到下方，默认不展开。
            await expect(page.get_by_label("四维概览")).to_have_count(0)
            await expect(page.get_by_label("更多视图").get_by_role("button", name="项目关系")).to_be_visible()

            await expect(block.get_by_text("已解决", exact=True)).to_be_visible()
            await expect(block.get_by_text("待解决", exact=True)).to_be_visible()
            await expect(block.get_by_text("本库暂无对应技术路线", exact=False)).to_be_visible()
            assert "scene=" in page.url, page.url
            # 问题卡片上的技术可直接跳回谱系位置。
            await block.get_by_role("button", name="深度学习", exact=True).click()
            await expect(block.get_by_label("技术详情")).to_contain_text("报告所述阶段：攻关验证3 原型与样机验证")

            # 场景卡片展开逻辑简图，点击节点高亮链条。
            await tabs.get_by_role("tab", name="场景 1 类 · 目标 6").click()
            await block.get_by_role("button", name="查看场景 临床诊疗").click()
            flow = block.get_by_label("临床诊疗 逻辑简图")
            await expect(flow).to_be_visible()
            # 箭头方向：场景→两个问题、问题→技术、技术→成果，共 4 条带箭头的连线。
            await expect(flow.locator("path[marker-end]")).to_have_count(4)
            await flow.get_by_role("button", name=re.compile("^标注数据不足")).click()
            await expect(flow.get_by_role("button", name=re.compile("^标注数据不足"))).to_have_attribute("aria-pressed", "true")

            await tabs.get_by_role("tab", name="技术 1 条技术路线").click()
            await expect(block.get_by_text("机器学习 › 深度学习方法 › 网络模型", exact=True)).to_be_visible()

            # 成果与成果分析；深层链刷新后仍停在同一视图。
            await tabs.get_by_role("tab", name="成果 1 项标志性成果").click()
            await expect(block.get_by_label("临床诊疗 成果板块")).to_contain_text("一种病灶识别方法")
            await expect(block.get_by_text("原型系统", exact=True).first).to_be_visible()
            await expect(block.get_by_label("临床诊疗 成果分析")).to_contain_text("人才/团队 · 在研")
            await block.get_by_text("按成果查看各方面完成度与原文", exact=True).click()
            await expect(page.locator("caption", has_text="原型系统 的成果方面完成度")).to_be_attached()
            await expect(page.get_by_text("原文未提及", exact=True).first).to_be_visible()
            await expect(page.get_by_text("本次综合未给出该方面结论", exact=False).first).to_be_visible()
            await page.reload()
            await expect(block.get_by_label("临床诊疗 成果分析")).to_be_visible()

            # 引用可回读原文；文件版本变化后不得用新正文冒充旧引用。
            await block.get_by_role("button", name="查看原文", exact=False).first.click()
            await expect(page.get_by_label("关闭 ✕")).to_be_visible()
            await page.get_by_label("关闭 ✕").click()
            document_version["value"] = NEW_VERSION
            await block.get_by_role("button", name="查看原文", exact=False).first.click()
            await expect(page.get_by_text("引用文件已更新，请重新生成层级", exact=True)).to_be_visible()

            # 重新生成只在用户点击时发生：页面打开不调用模型。
            assert POSTS == [], POSTS
            await block.get_by_role("button", name="重新生成", exact=True).click()
            await expect(block.get_by_label("临床诊疗 成果分析")).to_be_visible()
            assert POSTS == ['{"force":true}'], POSTS

            # 窄屏：页面本身不横向溢出。
            await page.set_viewport_size({"width": 430, "height": 900})
            await block.get_by_text("按成果查看各方面完成度与原文", exact=True).click()
            overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            assert overflow <= 1, f"窄屏出现横向溢出 {overflow}px"

            assert not page_errors, page_errors
        print("browser_scene_hierarchy: ok")
    finally:
        server.shutdown()


if __name__ == "__main__":
    asyncio.run(main())