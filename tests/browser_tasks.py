"""Offline browser acceptance: task system is on by default (cards, output hint, task_id).

Serves the built `frontend/dist` with mocked APIs. Verifies that `GET /api/tasks` drives the
task views, that selecting a task binds a new session to it, and that `POST /api/chat` carries
`task_id` (and the browsed `corpus_id`). No model requests.
"""

import asyncio
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, unquote, urlsplit

from playwright.async_api import async_playwright, expect

TASKS = [
    {"id": "task1", "name": "精准问答", "description": "回答具体问题。", "output_hint": "结论 + 逐条 [n] 引用", "has_template": False},
    {"id": "task2", "name": "对比分析", "description": "跨文档对比。", "output_hint": "对比维度表 + 可比性前提", "has_template": False},
    {"id": "task3", "name": "趋势推测", "description": "讨论领域走向。", "output_hint": "事实/推断分段 + 置信度", "has_template": False},
    {"id": "task4", "name": "专项报告", "description": "按模板生成报告。", "output_hint": "Markdown 报告 + 来源 + 局限", "has_template": True,
     "templates": ["achievements", "hotspots", "future_directions", "comprehensive"]},
]

TEMPLATES = [
    {"id": "achievements", "name": "成果报告"},
    {"id": "hotspots", "name": "热点报告"},
    {"id": "future_directions", "name": "未来方向报告"},
    {"id": "comprehensive", "name": "综合报告"},
]


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root / "frontend/dist")))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    store: dict[str, dict] = {}
    chat_bodies: list[dict] = []
    report_bodies: list[dict] = []
    artifacts_store: list[dict] = []
    artifact_markdowns: dict[str, list[str]] = {}
    report_scope: dict[str, str | None] = {"initial": None, "generated": None}
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1440, "height": 950})
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            async def health(r):
                await r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline"})

            async def documents(r):
                await r.fulfill(json=[])

            async def corpora(r):
                await r.fulfill(json=[{"id": "c1", "name": "演示库", "kind": "demo", "domain": "x",
                                       "rel_path": "c1", "docs_count": 3, "preparation": "ready",
                                       "is_default": True, "index_progress": None, "job": None}])

            async def tasks(r):
                await r.fulfill(json=TASKS)

            async def templates(r):
                await r.fulfill(json=TEMPLATES)

            async def template_detail(r):
                template_id = r.request.url.rsplit("/", 1)[-1]
                name = next((item["name"] for item in TEMPLATES if item["id"] == template_id), template_id)
                await r.fulfill(json={"id": template_id, "name": name,
                                      "content": f"# {name}模板\n\n## 一、研究范围与资料来源\n"})

            async def sessions(r):
                if r.request.method == "PUT":
                    data = r.request.post_data_json
                    sid = r.request.url.rsplit("/", 1)[-1]
                    record = {"id": sid, "revision": store.get(sid, {}).get("revision", 0) + 1,
                              "title": data["title"], "data": data["data"]}
                    store[sid] = record
                    await r.fulfill(json=record)
                else:
                    await r.fulfill(json=list(store.values()))

            async def official(r):
                await r.fulfill(json={"status": "idle", "errors": []})

            async def report_metadata(r):
                await r.fulfill(json={"corpus_id": "c1", "total": 2,
                    "date": {"hits": 1, "missing": 1}, "category": {"hits": 1, "missing": 1},
                    "unmatched": [{"doc_id": "d-missing", "title": "缺字段报告.pdf", "corpus_id": "c1",
                                   "date": "missing", "category": "missing"}]})

            async def reports(r):
                if r.request.method == "POST":
                    body = r.request.post_data_json
                    report_bodies.append(body)
                    report_scope["generated"] = body.get("session_key")
                    artifacts_store.append({
                        "artifact_id": "artifact:new-report", "type": "report", "status": "completed",
                        "title": "医疗", "current_version": 1, "created_at": "2026-09-23", "updated_at": "2026-09-23",
                        "session_key": body.get("session_key", ""), "run_id": body.get("run_id", ""),
                        "run_available": True,
                        "corpus_ids": ["c1"], "task_id": "task4", "template_id": "comprehensive",
                        "export_format": "md", "export_status": "", "fail_reason": ""})
                    artifact_markdowns["artifact:new-report"] = ["# 测试报告"]
                    await r.fulfill(json={"report_id": "new-report", "markdown": "# 测试报告"})
                elif r.request.url.endswith("/new-report"):
                    await r.fulfill(json={"report_id": "new-report", "markdown": "# 测试报告"})
                elif r.request.url.endswith("/legacy-report"):
                    await r.fulfill(json={"report_id": "legacy-report", "markdown": "# 旧报告正文"})
                else:
                    session_key = parse_qs(urlsplit(r.request.url).query).get("session_key", [""])[0]
                    if report_scope["initial"] is None:
                        report_scope["initial"] = session_key
                    items = []
                    if session_key == report_scope["initial"]:
                        items.append({"report_id": "legacy-report", "domain": "旧报告",
                                      "year_from": None, "year_to": None, "template_id": ""})
                    if session_key == report_scope["generated"]:
                        items.append({"report_id": "new-report", "domain": "医疗", "corpus_id": "c1",
                                      "year_from": 2025, "year_to": 2025, "template_id": "comprehensive"})
                    await r.fulfill(json=items)

            async def report_preflight(r):
                no_candidate = r.request.post_data_json.get("year_from") == 2030
                await r.fulfill(json={"total": 2, "corpus_total": 2,
                    "excluded": {"date": 1, "year": 1 if no_candidate else 0, "category": 0},
                    "date_hits": 1, "category_hits": 1, "eligible_count": 0 if no_candidate else 1,
                    "eligible": [] if no_candidate else [{"doc_id": "d1", "title": "示例报告", "version": "v1", "corpus_id": "c1"}],
                    "fingerprint": ("b" if no_candidate else "a") * 64})

            def legacy_artifact(session_key):
                return {"artifact_id": "report:legacy-report", "type": "report", "status": "completed",
                        "title": "旧报告", "current_version": 1, "created_at": "2026-09-21", "updated_at": "2026-09-21",
                        "session_key": session_key or "", "run_id": "", "corpus_ids": [],
                        "run_available": False,
                        "task_id": "task4", "template_id": "", "export_format": "md", "export_status": "",
                        "fail_reason": "", "legacy": True}

            async def artifacts(r):
                url = r.request.url
                path = urlsplit(url).path
                if r.request.method == "POST" and path.rstrip("/").endswith("/api/artifacts"):
                    body = r.request.post_data_json
                    item = {"artifact_id": "artifact:answer", "type": "answer_snapshot", "status": "completed",
                            "title": body.get("title") or "回答快照", "current_version": 1,
                            "created_at": "2026-09-23", "updated_at": "2026-09-23",
                            "session_key": body.get("session_key", ""), "run_id": body.get("run_id", ""),
                            "run_available": True,
                            "corpus_ids": ["c1"], "task_id": "task2", "template_id": "",
                            "export_format": "md", "export_status": "", "fail_reason": ""}
                    artifacts_store.append(item)
                    artifact_markdowns[item["artifact_id"]] = ["回答"]
                    await r.fulfill(status=201, json=item)
                    return
                if path.rstrip("/").endswith("/api/artifacts"):
                    session_key = parse_qs(urlsplit(url).query).get("session_key", [None])[0]
                    items = list(artifacts_store)
                    if session_key is None or session_key == report_scope["initial"]:
                        items.append(legacy_artifact(report_scope["initial"] or ""))
                    if session_key is not None:
                        items = [item for item in items if item["session_key"] == session_key]
                    await r.fulfill(json=items)
                    return
                artifact_id = unquote(path.split("/api/artifacts/", 1)[1].split("/", 1)[0])
                if path.endswith("/versions"):
                    found = next((item for item in artifacts_store if item["artifact_id"] == artifact_id), None)
                    if not found:
                        await r.fulfill(status=404, json={"detail": "成果不存在"})
                    elif r.request.method == "POST":
                        body = r.request.post_data_json
                        artifact_markdowns[artifact_id].append(body["markdown"])
                        found["current_version"] = len(artifact_markdowns[artifact_id])
                        found["status"] = body["status"]
                        await r.fulfill(status=201, json={**found, "version": found["current_version"],
                            "markdown": body["markdown"], "citations": [], "source_verification": "user_modified"})
                    else:
                        await r.fulfill(json=[{"version": index + 1, "status": "completed" if index == 0 else found["status"],
                            "source_verification": "verified" if index == 0 else "user_modified"}
                            for index in range(len(artifact_markdowns[artifact_id]))])
                    return
                if artifact_id == "report:legacy-report":
                    await r.fulfill(json={**legacy_artifact(""), "markdown": "# 旧报告正文", "citations": []})
                    return
                found = next((item for item in artifacts_store if item["artifact_id"] == artifact_id), None)
                if found:
                    selected = int(parse_qs(urlsplit(url).query).get("version", [found["current_version"]])[0])
                    await r.fulfill(json={**found, "version": selected,
                        "markdown": artifact_markdowns[artifact_id][selected - 1], "citations": [],
                        "source_verification": "verified" if selected == 1 else "user_modified"})
                else:
                    await r.fulfill(status=404, json={"detail": "成果不存在"})

            async def run_snapshot(r):
                run_id = r.request.url.rsplit("/", 1)[-1]
                await r.fulfill(json={"contract_version": 1, "run_id": run_id, "created_at": "", "updated_at": "",
                                      "session_key": "", "parent_run_id": "", "run_type": "chat", "status": "completed",
                                      "task_id": "task2", "model": "offline-snapshot", "resource_policy": "local_only",
                                      "requested_corpus_ids": ["c1"], "effective_corpus_ids": ["c1"],
                                      "allowed_doc_ids": None, "params": {}, "param_sources": {},
                                      "output_intent": "text", "ended_at": "", "metrics": {},
                                      "citations": [{"doc_id": "d1", "version": "v1", "page": 2}]})

            async def chat(r):
                payload = r.request.post_data_json
                chat_bodies.append(payload)
                if payload.get("task_id") == "task4":
                    policy = {"route": "clarify", "stop_reason": "report_pending",
                              "report_params": {"domain": "医疗", "year_from": 2025, "year_to": 2025,
                                                "template_id": "comprehensive", "fund_type": "面上项目"}}
                    body = ('event: policy\ndata: ' + json.dumps(policy, ensure_ascii=False) + '\n\n'
                            'event: token\ndata: {"text":"需求已确认"}\n\n'
                            'event: done\ndata: {"ok":true}\n\n')
                    await r.fulfill(status=200, content_type="text/event-stream", body=body)
                    return
                rid = payload.get("run_id")
                run_event = json.dumps({"run_id": rid, "model": "offline", "resource_policy": "local_only",
                                        "effective_corpus_ids": ["c1"]})
                step_running = json.dumps({"run_id": rid, "id": "s1", "sequence": 1, "phase": "research",
                                          "status": "running", "label": "搜索资料"})
                step_done = json.dumps({"run_id": rid, "id": "s1", "sequence": 1, "phase": "research",
                                       "status": "completed", "label": "搜索资料", "duration_ms": 1234})
                body = (f'event: run\ndata: {run_event}\n\n'
                        f'event: step\ndata: {step_running}\n\n'
                        f'event: step\ndata: {step_done}\n\n'
                        'event: sources\ndata: []\n\n'
                        'event: token\ndata: {"text":"回答"}\n\n'
                        'event: done\ndata: {"ok":true}\n\n')
                await r.fulfill(status=200, content_type="text/event-stream", body=body)

            await page.route("**/api/health", health)
            await page.route(re.compile(r".*/api/documents(?:\?.*)?$"), documents)
            await page.route(re.compile(r".*/api/corpora(?:\?.*)?$"), corpora)
            await page.route("**/api/tasks**", tasks)
            await page.route("**/api/templates**", templates)
            await page.route("**/api/templates/*", template_detail)
            await page.route("**/api/workspace/sessions", sessions)
            await page.route("**/api/workspace/sessions/*", sessions)
            await page.route("**/api/official-docs", official)
            await page.route("**/api/chat", chat)
            await page.route(re.compile(r".*/api/runs/[^/]+$"), run_snapshot)
            await page.route(re.compile(r".*/api/artifacts(?:\?.*)?$"), artifacts)
            await page.route(re.compile(r".*/api/artifacts/.+$"), artifacts)
            await page.route("**/api/corpora/c1/report-metadata", report_metadata)
            await page.route("**/api/reports**", reports)
            await page.route("**/api/reports/preflight", report_preflight)

            await page.goto(origin)
            # New sessions auto-select the first corpus directory; there is no confirmation gate.
            await expect(page.get_by_text(re.compile("当前对话：演示库（1/6）"))).to_be_visible()
            # Given the current task and scope, when the user prepares to send,
            # then the visible configuration matches the local-only run contract.
            await expect(page.get_by_label("本次运行配置")).to_contain_text("本地资料")
            await expect(page.get_by_label("本次运行配置")).to_contain_text("演示库")

            # Legacy reports are read back as artifacts; missing run/corpus stay "未记录".
            await page.get_by_role("button", name="成果", exact=True).click()
            await expect(page.get_by_role("heading", name="成果")).to_be_visible()
            await expect(page.get_by_text("旧报告", exact=True)).to_be_visible()
            await expect(page.get_by_text(re.compile("报告 · 版本 1"))).to_be_visible()
            await page.get_by_role("button", name="对话", exact=True).click()

            # task views are reachable from the rail and show the output contract
            await page.get_by_role("button", name="Prompt / Skill").click()
            await expect(page.get_by_text("尚不支持在界面中查看、编辑或启用自定义 Skill", exact=False)).to_be_visible()
            await page.get_by_role("button", name="查看任务").click()
            await expect(page.get_by_text("对比维度表 + 可比性前提")).to_be_visible()

            # selecting a task binds a new session and returns to chat
            await page.get_by_text("对比维度表 + 可比性前提").click()
            await expect(page.get_by_text("任务预览", exact=True)).to_be_visible()
            await page.get_by_role("button", name="使用此任务").click()
            field = page.get_by_role("textbox", name="问题", exact=True)
            await field.fill("对比一下")
            await page.get_by_role("button", name="发送 ↑").click()
            await expect(page.get_by_text("回答", exact=False).first).to_be_visible()

            assert chat_bodies, "no chat request captured"
            body = chat_bodies[-1]
            assert body.get("task_id") == "task2", body
            # The app always sends the explicit retrieval set (single corpus uses a one-element list).
            assert body.get("corpus_ids") == ["c1"] and "corpus_id" not in body, body
            # W3-A: the chat request carries the session key used by the persisted run snapshot.
            assert body.get("session_key"), body
            # per-step latency from step events is shown in the answer trace
            await expect(page.get_by_text("1.2 秒").first).to_be_visible()

            # W1: the shared inspector exposes an execution summary for the latest answer.
            await page.get_by_role("button", name="查看执行摘要").click()
            await expect(page.get_by_text("执行摘要", exact=True)).to_be_visible()
            await expect(page.get_by_text("运行 ID")).to_be_visible()
            await expect(page.get_by_text("搜索资料").first).to_be_visible()
            # A2: the server-effective scope is shown from the run event, not inferred from the request.
            inspector = page.get_by_role("complementary", name="检查器")
            await expect(inspector.get_by_text("服务端实际范围")).to_be_visible()
            await expect(inspector.get_by_text("演示库", exact=True)).to_be_visible()
            # B2: the persisted run snapshot is read back and takes precedence over the live event.
            await expect(inspector.get_by_text("offline-snapshot")).to_be_visible()
            await page.get_by_role("button", name="返回上一预览").click()
            await expect(page.get_by_text("检查器", exact=True)).to_be_visible()

            # W1: the inspector width is adjustable and saved; narrow screens use a full-width layer.
            await page.get_by_label("检查器宽度").fill("500")
            await page.wait_for_function("localStorage.getItem('dox.inspector.width') === '500'")
            await page.set_viewport_size({"width": 390, "height": 844})
            narrow = await page.get_by_role("complementary", name="检查器").bounding_box()
            assert narrow and narrow["width"] >= 380, narrow
            await page.set_viewport_size({"width": 1440, "height": 950})

            # W3-B: a completed answer can be saved as an artifact linked to its run.
            await page.get_by_role("button", name="保存为成果").first.click()
            await expect(page.get_by_text(re.compile("已保存为成果"))).to_be_visible()

            # Task4 intake returns parameters, then report generation and AC-12 coverage stay offline.
            await page.get_by_role("button", name="任务").first.click()
            await page.get_by_role("button", name=re.compile("专项报告.*查看任务详情")).click()
            # W1: the task preview lists its output templates; one opens read-only in the inspector.
            await page.get_by_role("button", name="综合报告").click()
            await expect(page.get_by_text("输出模板预览", exact=True)).to_be_visible()
            await expect(page.get_by_role("heading", name="综合报告模板")).to_be_visible()
            await page.get_by_role("button", name="返回上一预览").click()
            await page.get_by_role("button", name="使用此任务").click()
            await expect(page.get_by_label("本次运行配置")).to_contain_text("专项报告")
            await page.get_by_role("textbox", name="问题", exact=True).fill("生成医疗项目报告")
            await page.get_by_role("button", name="发送 ↑").click()
            await expect(page.get_by_role("button", name="生成报告")).to_be_visible()
            assert chat_bodies[-1].get("task_id") == "task4", chat_bodies[-1]
            assert chat_bodies[-1].get("corpus_ids") == ["c1"], chat_bodies[-1]
            assert await page.get_by_role("combobox", name="报告知识库").input_value() == "c1"
            await page.get_by_role("button", name="生成报告").click()
            await expect(page.get_by_text("测试报告")).to_be_visible()
            # W3-A: the report request is an independent child run of the task4 intake run.
            assert report_bodies, "no report request captured"
            assert report_bodies[-1].get("parent_run_id") == chat_bodies[-1].get("run_id"), report_bodies[-1]
            assert str(report_bodies[-1].get("run_id", "")).endswith("-report"), report_bodies[-1]
            assert report_bodies[-1].get("session_key"), report_bodies[-1]
            assert report_bodies[-1].get("template_id") == "comprehensive"
            assert report_bodies[-1].get("scope_fingerprint") == "a" * 64
            assert report_bodies[-1].get("template_version") is None, report_bodies[-1]
            await page.context.grant_permissions(["clipboard-read", "clipboard-write"])
            report_card = page.locator("article").filter(has_text="测试报告").first
            await report_card.get_by_role("button", name="复制", exact=True).click()
            assert await page.evaluate("navigator.clipboard.readText()") == "# 测试报告"
            async with page.expect_download() as download_info:
                await report_card.get_by_role("button", name="下载 .md").click()
            download = await download_info.value
            assert download.suggested_filename.endswith(".md")
            # Given a year range with no matching report, the same card explains the gap
            # and never sends another generation request.
            await report_card.get_by_role("button", name="调整").click()
            await report_card.get_by_role("spinbutton", name="起始年份").fill("2030")
            await report_card.get_by_role("spinbutton", name="结束年份").fill("2030")
            before = len(report_bodies)
            await report_card.get_by_role("button", name="重新生成").first.click()
            await expect(report_card.get_by_text(re.compile("当前范围没有符合条件的资料"))).to_be_visible()
            assert len(report_bodies) == before
            await page.wait_for_timeout(900)
            await page.reload()
            await expect(page.get_by_text("测试报告")).to_be_visible()
            # Given a saved report, when the user opens the central report page,
            # then they can read and download it without an unimplemented placeholder.
            await page.get_by_role("button", name="成果", exact=True).click()
            await expect(page.get_by_role("heading", name="成果")).to_be_visible()
            await page.get_by_role("button", name=re.compile("医疗.*报告 · 版本")).last.click()
            await expect(page.get_by_text("成果预览", exact=True)).to_be_visible()
            await expect(page.get_by_role("heading", name="测试报告")).to_be_visible()
            # Given a completed artifact, editing creates a draft version while the
            # original remains selectable and the central card reflects the new version.
            await page.get_by_role("button", name="编辑新版本").click()
            await page.get_by_role("textbox", name="成果 Markdown").fill("# 修订报告")
            await page.get_by_role("button", name="保存草稿").click()
            await expect(page.get_by_role("heading", name="修订报告")).to_be_visible()
            await expect(page.get_by_role("button", name=re.compile("医疗.*报告 · 版本 2"))).to_be_visible()
            await page.get_by_role("combobox", name="成果版本").select_option("1")
            await expect(page.get_by_role("heading", name="测试报告")).to_be_visible()
            async with page.expect_download() as central_download:
                await page.get_by_role("button", name="下载 .md").last.click()
            assert (await central_download.value).suggested_filename.endswith("-v1.md")
            # The artifact preview returns to the overview. A pinned preview survives
            # navigation; unpinned context follows the next section.
            await page.get_by_role("button", name="返回上一预览").click()
            await expect(page.get_by_text("检查器", exact=True)).to_be_visible()
            await page.get_by_role("button", name=re.compile("医疗.*报告 · 版本")).last.click()
            await page.get_by_role("button", name="固定检查器").click()
            await page.get_by_role("button", name="Prompt / Skill").click()
            await expect(page.get_by_text("成果预览", exact=True)).to_be_visible()
            await page.get_by_role("button", name="取消固定检查器").click()
            await page.get_by_role("button", name="任务", exact=True).click()
            await expect(page.get_by_text("检查器", exact=True)).to_be_visible()
            await page.get_by_role("button", name="对话", exact=True).click()
            await page.get_by_role("combobox", name="报告知识库").select_option("c1")
            await page.get_by_role("button", name="查看元数据覆盖与未命中资料").click()
            await expect(page.get_by_text(re.compile("共 2 份.*填表日期命中 1.*资助类别命中 1"))).to_be_visible()
            await expect(page.get_by_text("缺字段报告.pdf · 日期 missing · 类别 missing")).to_be_visible()
            await expect(page.get_by_text("不代表 PDF/OCR 识别正确率")).to_be_visible()
            # Given artifacts in earlier sessions, the global page still finds them after
            # starting a new session; the explicit current-session filter is empty.
            await page.get_by_role("button", name="新建对话").click()
            await page.get_by_role("button", name="成果", exact=True).click()
            await expect(page.get_by_role("heading", name="成果")).to_be_visible()
            await expect(page.get_by_role("button", name=re.compile("医疗.*报告 · 版本"))).to_be_visible()
            await page.get_by_role("button", name="当前会话", exact=True).click()
            await expect(page.get_by_text(re.compile("本会话还没有成果"))).to_be_visible()
            await expect(page.get_by_role("button", name=re.compile("医疗.*报告 · 版本"))).to_have_count(0)
            await page.get_by_role("button", name="全部成果", exact=True).click()
            await expect(page.get_by_role("button", name=re.compile("医疗.*报告 · 版本"))).to_be_visible()
            assert not errors, errors
            print("PASS: task selection and corpus scope, report task intake/generation, AC-11 legacy source fallback, AC-12 coverage/unmatched UI")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
