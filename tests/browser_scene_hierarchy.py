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
    return {"corpus_id": CORPUS_ID, "state": "ready" if ready else "missing", "branch": "AI与医疗", "gaps": [],
            "categories": [{"name": "机器学习", "summary": "学习方法。",
                            "children": [{"name": "深度学习方法", "routes": ["深度学习"]}]}] if ready else [],
            "routes": {"深度学习": {"summary": "以深度学习提升识别。", "project_ids": ["NSFC:123456"],
                                  "issues": [{"scene": "临床诊疗", "issue": "病灶识别困难", "state": "已解决"}]}},
            "supporting": {"深度学习": [{"name": "数据增强", "project_ids": ["NSFC:123456"]}]}}

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
            await page.route("**/api/official-docs", lambda r: r.fulfill(json={"status": "idle", "errors": []}))
            await page.route(re.compile(r".*/api/corpora(\?.*)?$"), lambda r: r.fulfill(json=corpora()))
            await page.route(re.compile(r".*/api/corpora/[^/]+/files.*$"), lambda r: r.fulfill(
                json={"source_dir": "/tmp", "files": [], "misplaced_files": []}))
            await page.route(re.compile(r".*/api/corpora/[^/]+/projects$"), lambda r: r.fulfill(json={
                "projects": [], "coverage": {"files": 0, "identified_projects": 0, "pending_identity_records": 0,
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
            await block.get_by_role("button", name="生成技术谱系").click()
            await expect(tabs.get_by_role("tab", name="技术谱系 1 个技术体系 · 1 条典型技术")).to_be_visible()
            assert LINEAGE_POSTS == ['{"force":true}'], LINEAGE_POSTS
            await block.get_by_role("button", name="深度学习", exact=True).click()
            detail = block.get_by_label("技术详情")
            await expect(detail).to_contain_text("AI与医疗 › 机器学习 › 深度学习方法")
            await expect(detail).to_contain_text("数据增强")
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
            await expect(block.get_by_label("技术详情")).to_contain_text("针对的问题")

            # 场景卡片展开逻辑简图，点击节点高亮链条。
            await tabs.get_by_role("tab", name="场景 1 类 · 目标 6").click()
            await block.get_by_role("button", name="查看场景 临床诊疗").click()
            flow = block.get_by_label("临床诊疗 逻辑简图")
            await expect(flow).to_be_visible()
            await flow.get_by_role("button", name=re.compile("^标注数据不足")).click()
            await expect(flow.get_by_role("button", name=re.compile("^标注数据不足"))).to_have_attribute("aria-pressed", "true")

            await tabs.get_by_role("tab", name="技术 1 条技术路线").click()
            await expect(block.get_by_text("机器学习 › 深度学习方法", exact=True)).to_be_visible()

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