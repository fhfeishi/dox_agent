"""User flow for versioned custom tasks and templates against the real local API."""

import asyncio
import re
import socket
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.parse import quote

import uvicorn
from playwright.async_api import async_playwright, expect
from pydantic import SecretStr

import src.main as main_module
from src.agent.config import Settings
from src.agent.corpora import corpus_id_for
from src.knowledge import Document, Knowledge, Page
from src.main import create_app
from tests.browser_support import login


class OfflineGraph:
    def __init__(self, corpus_id: str, doc_id: str):
        self.corpus_id = corpus_id
        self.doc_id = doc_id

    async def astream(self, state, **kwargs):
        yield {"event": "sources", "data": [{"doc_id": self.doc_id, "corpus_id": self.corpus_id,
                                             "version": "v1", "title": "样本", "page": 1}]}
        yield {"event": "token", "data": {"text": "离线回答 [1]"}}
        yield {"event": "done", "data": {"ok": True}}


def start_server(app):
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port,
                                           log_level="error", lifespan="on"))
    thread = Thread(target=lambda: asyncio.run(server.serve(sockets=[listener])), daemon=True)
    thread.start()
    return f"http://127.0.0.1:{port}", server, thread, listener


class CustomTaskOfflineGraph(OfflineGraph):
    async def astream(self, state, **kwargs):
        if state.get("task_id") == "task4":
            yield {"event": "policy", "data": {"route": "clarify", "stop_reason": "report_pending",
                                                 "report_params": {"domain": "人工智能与医疗", "year_from": 2024,
                                                                   "year_to": 2025, "template_id": "hotspots",
                                                                   "fund_type": "重点项目"}}}
            yield {"event": "token", "data": {"text": "报告需求已确认"}}
            yield {"event": "done", "data": {"ok": True}}
            return
        async for event in super().astream(state, **kwargs):
            yield event


async def offline_report(knowledge, settings, params, *, llm=None, **kwargs):
    return "# 实测专项报告\n\n绑定模板与任务参数已用于生成。\n"


async def main():
    with TemporaryDirectory(prefix="dox-custom-task-") as directory:
        root = Path(directory)
        corpus = root / ".knowledge" / "fixture"
        corpus.mkdir(parents=True)
        settings = Settings(_env_file=None, corpora_root=corpus.parent, state_dir=root / "state", user_dir=root / "usr",
                            model_api_key=SecretStr("offline-test"))
        knowledge = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings)
        doc = knowledge.put(Document(title="样本", origin="2021_2025_P1_张三_sample.md", kind="text", parser="text",
                                     pages=[Page(number=1, text="基金项目方法证据")],
                                     markdown="填表日期：2025年\n资助类别：重点项目\n基金项目方法证据"))
        corpus_id = corpus_id_for("fixture")
        main_module.generate_markdown = offline_report
        app = create_app(settings, knowledge, lambda *_: CustomTaskOfflineGraph(corpus_id, doc["doc_id"]))
        origin, server, thread, listener = start_server(app)
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 950})
                await login(page, origin)
                async def publish(kind, source, fields):
                    response=await page.request.post(f"{origin}/api/{kind}/custom",data={("source_task_id" if kind=="tasks" else "source_template_id"):source})
                    assert response.status==201,await response.text()
                    item=await response.json()
                    draft=await page.request.put(f"{origin}/api/{kind}/custom/{item['id']}/draft",data={"revision":item["revision"],**fields})
                    assert draft.status==200,await draft.text()
                    response=await page.request.post(f"{origin}/api/{kind}/custom/{item['id']}/publish",data={"revision":(await draft.json())["revision"]})
                    assert response.status==200,await response.text()
                    return await response.json()

                async def start_task(name):
                    await page.goto(origin+"/tasks")
                    await page.locator("article").filter(has_text=name).get_by_role("button",name="开始分析",exact=True).click()
                    await expect(page.get_by_role("textbox",name="问题",exact=True)).to_be_visible()

                # Editor creation/archive is covered by browser_task_templates; this journey checks
                # runtime parameters and frozen task/template versions through the current task cards.
                qa_task=await publish("tasks","task1",{"name":"基金项目方法问答","parameters":[{"key":"topic","label":"研究主题","type":"text","required":True}]})
                await start_task(qa_task["name"])
                await page.get_by_role("textbox",name="问题",exact=True).fill("有哪些方法？")
                await expect(page.get_by_role("button",name="发送 ↑",exact=True)).to_be_disabled()
                await page.get_by_label("研究主题",exact=True).fill("研究方法")
                await page.get_by_role("button",name="发送 ↑",exact=True).click()
                await page.get_by_role("button",name="保存到报告中心",exact=True).click()
                await expect(page.get_by_text(re.compile("已保存到报告中心"))).to_be_visible()
                custom_template=await publish("templates","comprehensive",{"name":"绑定模板","purpose":"验收固定模板","content":"# 实测专项报告\n\n## 方法\n"})
                report_task=await publish("tasks","task4",{"name":"绑定自定义模板的专项报告","report_template_id":custom_template["id"],"report_template_version":1,"parameters":[{"key":"audience","label":"报告受众","type":"text"}]})
                await start_task(report_task["name"])
                await page.get_by_role("textbox", name="报告受众").fill("项目评审专家")
                await page.get_by_role("textbox", name="问题", exact=True).fill("生成人工智能与医疗 2024 至 2025 报告")
                await page.get_by_role("button", name="发送 ↑").click()
                await expect(page.get_by_role("button", name="生成报告")).to_be_visible()
                fixed_template = page.get_by_role("combobox", name="报告模板")
                await expect(fixed_template).to_be_disabled()
                await expect(fixed_template).to_have_value(custom_template["id"])
                await page.get_by_role("combobox", name="报告知识库").select_option(corpus_id)
                await page.get_by_role("button", name="生成报告").click()
                await expect(page.get_by_text("实测专项报告")).to_be_visible()
                report_session_key = await page.evaluate("localStorage.getItem('dox-agent-session')")
                reports = await (await page.request.get(f"{origin}/api/reports?session_key={report_session_key}")).json()
                report = next(item for item in reports if item["template_id"] == custom_template["id"])
                report_detail = await (await page.request.get(f"{origin}/api/reports/{report['report_id']}")).json()
                assert report_detail["params"]["task_id"] == report_task["id"]
                assert report_detail["params"]["task_version"] == 1
                assert report_detail["params"]["template_version"] == 1
                assert report_detail["params"]["task_params"]["audience"] == "项目评审专家"

                templates = await (await page.request.get(f"{origin}/api/templates?include_archived=true")).json()
                latest_template = next(item for item in templates if item["id"] == custom_template["id"])
                template_v2 = await (await page.request.put(
                    f"{origin}/api/templates/custom/{custom_template['id']}/draft",
                    data={"revision": latest_template["revision"], "name": "绑定模板 v2",
                          "content": "# 绑定模板 v2\n\n## 新章节\n"})).json()
                assert (await page.request.post(
                    f"{origin}/api/templates/custom/{custom_template['id']}/publish",
                    data={"revision": template_v2["revision"]})).status == 200
                await page.reload()
                regenerate = page.get_by_role("button", name="重新生成").first
                await expect(regenerate).to_be_visible()
                await page.get_by_role("combobox", name="报告知识库").select_option(corpus_id)
                async with page.expect_response(lambda response: response.url.endswith("/api/reports")
                                                and response.request.method == "POST") as response_info:
                    await regenerate.click()
                assert (await response_info.value).status == 201
                reports = await (await page.request.get(f"{origin}/api/reports?session_key={report_session_key}")).json()
                assert len([item for item in reports if item["template_id"] == custom_template["id"]]) == 2
                assert all(item["template_version"] == 1 for item in reports)

                latest=await (await page.request.get(f"{origin}/api/tasks/custom/{report_task['id']}")).json()
                updated=await page.request.put(f"{origin}/api/tasks/custom/{report_task['id']}/draft",data={"revision":latest["revision"],"goal":"形成专项报告 v2","parameters":[],"report_template_id":"comprehensive","report_template_version":0})
                assert updated.status==200,await updated.text()
                published=await page.request.post(f"{origin}/api/tasks/custom/{report_task['id']}/publish",data={"revision":(await updated.json())["revision"]})
                assert published.status==200,await published.text()
                await page.reload()
                await expect(page.get_by_text("当前 v1 / 最新 v2")).to_be_visible()
                page.once("dialog", lambda dialog: dialog.accept())
                await page.get_by_role("button", name="升级到最新版").click()
                await expect(page.get_by_text("此会话已升级到任务 v2；不兼容的旧参数已清除")).to_be_visible()
                session_key = await page.evaluate("localStorage.getItem('dox-agent-session')")
                sessions = await (await page.request.get(f"{origin}/api/workspace/sessions")).json()
                session = next(item for item in sessions if item["id"] == session_key)
                assert session["data"]["task_version"] == 2
                assert session["data"]["options"].get("task_params", {}) == {}
                # The old intake keeps its v1 template after the session moves to v2.
                await expect(page.get_by_role("combobox", name="报告模板").first).to_have_value(custom_template["id"])
                await page.get_by_role("combobox", name="报告知识库").first.select_option(corpus_id)
                async with page.expect_response(lambda response: response.url.endswith("/api/reports")
                                                and response.request.method == "POST") as old_report_response:
                    await page.get_by_role("button", name="重新生成").first.click()
                assert (await old_report_response.value).status == 201
                await page.get_by_role("textbox", name="问题", exact=True).fill("再次生成人工智能与医疗 2024 至 2025 报告")
                await page.get_by_role("button", name="发送 ↑").click()
                await expect(page.get_by_role("button", name="生成报告").last).to_be_visible()

                artifacts = await (await page.request.get(f"{origin}/api/artifacts")).json()
                answer = next(item for item in artifacts if item["type"] == "answer_snapshot")
                generated_report = next(item for item in artifacts if item["type"] == "report")
                assert answer["task_id"] == qa_task["id"] and answer["task_version"] == 1
                assert generated_report["task_id"] == report_task["id"] and generated_report["task_version"] == 1
                assert generated_report["template_id"] == custom_template["id"] and generated_report["template_version"] == 1

                # A built-in template stays selectable at v0 through the actual report card.
                builtin_task = await (await page.request.post(f"{origin}/api/tasks/custom",
                                                              data={"source_task_id": "task4"})).json()
                builtin_draft = await (await page.request.put(
                    f"{origin}/api/tasks/custom/{builtin_task['id']}/draft",
                    data={"revision": builtin_task["revision"], "name": "内置模板专项报告",
                          "report_template_id": "comprehensive", "report_template_version": 0})).json()
                assert (await page.request.post(
                    f"{origin}/api/tasks/custom/{builtin_task['id']}/publish",
                    data={"revision": builtin_draft["revision"]})).status == 200
                await page.reload()
                await start_task("内置模板专项报告")
                await page.get_by_role("textbox", name="问题", exact=True).fill("生成人工智能与医疗 2024 至 2025 报告")
                await page.get_by_role("button", name="发送 ↑").click()
                await expect(page.get_by_role("button", name="生成报告")).to_be_visible()
                await expect(page.get_by_role("combobox", name="报告模板")).to_have_value("comprehensive")
                await page.get_by_role("combobox", name="报告知识库").select_option(corpus_id)
                async with page.expect_response(lambda response: response.url.endswith("/api/reports")
                                                and response.request.method == "POST") as response_info:
                    await page.get_by_role("button", name="生成报告").click()
                assert (await response_info.value).status == 201

                # A new draft does not hide its last published template version.
                latest_template = await (await page.request.get(
                    f"{origin}/api/templates/custom/{custom_template['id']}")).json()
                assert (await page.request.put(
                    f"{origin}/api/templates/custom/{custom_template['id']}/draft",
                    data={"revision": latest_template["revision"], "name": "未发布草稿"})).status == 200
                # Templates are chosen freely in the analysis workspace (a bound task offers only its own):
                # the published version stays selectable while a new draft is open, and the label says so.
                await page.goto(f"{origin}/library/{quote(corpus_id)}/documents?workspace=1&task=task4")
                work=page.get_by_role("region",name="分析工作区")
                await work.get_by_role("button",name="生成报告…").click()
                await expect(work.get_by_role("combobox",name="报告模板").locator("option",has_text=re.compile(r"（已发布 v\d+，另有草稿）"))).to_have_count(1)
                await browser.close()
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            listener.close()
            assert not thread.is_alive()
    print("PASS: real API/browser custom task-template versioning, report binding, archive lifecycle and artifacts")


if __name__ == "__main__":
    asyncio.run(main())
