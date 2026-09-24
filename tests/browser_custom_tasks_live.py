"""User flow for versioned custom tasks and templates against the real local API."""

import asyncio
import re
import socket
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

import uvicorn
from playwright.async_api import async_playwright, expect
from pydantic import SecretStr

import src.main as main_module
from src.agent.config import Settings
from src.agent.corpora import corpus_id_for
from src.knowledge import Document, Knowledge, Page
from src.main import create_app


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
        settings = Settings(_env_file=None, corpora_root=corpus.parent, state_dir=root / "state",
                            model_api_key=SecretStr("offline-test"), auto_import_official=False)
        knowledge = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings)
        doc = knowledge.put(Document(title="样本", origin="sample", kind="text", parser="text",
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
                await page.goto(origin)
                await page.get_by_role("button", name="任务", exact=True).click()
                await page.get_by_role("button", name="复制问答任务").click()
                await expect(page.get_by_text("未发布草稿")).to_be_visible()
                await page.get_by_role("textbox", name="名称").fill("基金项目方法问答")
                await page.get_by_role("textbox", name="用途说明").fill("回答基金项目方法问题")
                await page.get_by_role("textbox", name="背景").fill("基金项目资料")
                await page.get_by_role("textbox", name="目标").fill("比较方法")
                await page.get_by_role("textbox", name="具体要求").fill("逐项引用")
                await page.get_by_role("textbox", name="任务类别").fill("方法比较")
                await page.get_by_role("textbox", name="适用边界").fill("仅限当前知识库")
                await page.get_by_role("textbox", name="需要澄清的条件").fill("主题或年份范围缺失时澄清")
                await page.get_by_role("textbox", name="输出说明").fill("逐条引用并说明局限")
                await page.get_by_role("textbox", name="默认关注点").fill("技术路线")
                await page.get_by_role("button", name="添加参数").click()
                await page.get_by_role("textbox", name="参数1名称").fill("topic")
                await page.get_by_role("textbox", name="参数1标签").fill("研究主题")
                await page.get_by_role("checkbox", name="必填").check()
                await page.get_by_role("button", name="保存并发布").click()
                await expect(page.get_by_text("已发布 v1").first).to_be_visible()
                await page.get_by_role("button", name="使用此任务").click()
                await expect(page.get_by_role("textbox", name="研究主题")).to_be_visible()
                await page.get_by_role("textbox", name="研究主题").fill("研究方法")
                await page.get_by_role("textbox", name="问题", exact=True).fill("有哪些方法？")
                await page.get_by_role("button", name="发送 ↑").click()
                await expect(page.get_by_role("button", name="保存为成果")).to_be_visible()
                await page.get_by_role("button", name="保存为成果").click()
                await expect(page.get_by_text(re.compile("已保存为成果"))).to_be_visible()

                await page.get_by_role("button", name="任务", exact=True).first.click()
                await page.get_by_role("button", name=re.compile("基金项目方法问答.*查看任务详情")).click()
                await page.get_by_role("button", name="归档任务").click()
                await expect(page.get_by_text("任务已归档")).to_be_visible()
                await expect(page.get_by_text("已归档，不能用于新会话；恢复后可继续选择。")).to_be_visible()
                await page.get_by_role("button", name="恢复任务").click()
                await expect(page.get_by_text("任务已恢复")).to_be_visible()

                await page.get_by_role("button", name="复制专项报告任务").click()
                await expect(page.get_by_text("未发布草稿")).to_be_visible()
                await page.get_by_role("button", name="综合报告", exact=True).click()
                await expect(page.get_by_role("heading", name="综合报告模板")).to_be_visible()
                await page.get_by_role("button", name="复制为自定义模板").click()
                await expect(page.get_by_role("textbox", name="模板用途")).to_be_visible()
                await expect(page.get_by_text("章节与变量样例预览（仅 UI 样例，不是真实证据）")).to_be_visible()
                await page.get_by_role("textbox", name="模板用途").fill("用于人工智能与医疗专项报告")
                await page.get_by_role("button", name="保存并发布").click()
                await expect(page.get_by_text("已发布 v1").first).to_be_visible()
                await page.get_by_role("button", name="返回上一预览").click()
                await page.get_by_role("button", name="返回上一预览").click()
                templates = await (await page.request.get(f"{origin}/api/templates?include_archived=true")).json()
                custom_template = next(item for item in templates if item["kind"] == "custom")
                await page.get_by_role("textbox", name="名称").fill("绑定自定义模板的专项报告")
                await page.get_by_role("textbox", name="用途说明").fill("生成固定模板专项报告")
                await page.get_by_role("textbox", name="目标").fill("形成专项报告 v1")
                await page.get_by_role("textbox", name="具体要求").fill("按绑定模板输出")
                await page.get_by_role("textbox", name="任务类别").fill("专项报告")
                await page.get_by_role("textbox", name="适用边界").fill("仅限选定知识库")
                await page.get_by_role("textbox", name="需要澄清的条件").fill("年份或领域缺失时澄清")
                await page.get_by_role("textbox", name="输出说明").fill("使用固定发布版本")
                template_select = page.get_by_role("combobox", name="固定报告模板")
                await template_select.select_option(f"{custom_template['id']}|{custom_template['version']}")
                await page.get_by_role("button", name="添加参数").click()
                await page.get_by_role("textbox", name="参数1名称").fill("audience")
                await page.get_by_role("textbox", name="参数1标签").fill("报告受众")
                await page.get_by_role("button", name="保存并发布").click()
                await expect(page.get_by_text("已发布 v1").first).to_be_visible()
                tasks = await (await page.request.get(f"{origin}/api/tasks?include_archived=true")).json()
                report_task = next(item for item in tasks if item["name"] == "绑定自定义模板的专项报告")
                qa_task = next(item for item in tasks if item["name"] == "基金项目方法问答")
                assert report_task["report_template_id"] == custom_template["id"]
                assert report_task["report_template_version"] == custom_template["version"] == 1

                await page.get_by_role("button", name="使用此任务").click()
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

                await page.get_by_role("button", name="任务", exact=True).first.click()
                await page.get_by_role("button", name=re.compile("绑定自定义模板的专项报告.*查看任务详情")).click()
                await page.get_by_role("textbox", name="目标").fill("形成专项报告 v2")
                await page.get_by_role("button", name="删除", exact=True).click()
                await page.get_by_role("combobox", name="固定报告模板").select_option("comprehensive|0")
                await page.get_by_role("button", name="保存并发布").click()
                await expect(page.get_by_text("已发布 v2").first).to_be_visible()
                await page.get_by_role("button", name="关闭检查器").click()
                await page.get_by_role("button", name="对话", exact=True).click()
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
                await page.get_by_role("button", name="任务", exact=True).first.click()
                await page.get_by_role("button", name=re.compile("内置模板专项报告.*查看任务详情")).click()
                await page.get_by_role("button", name="使用此任务").click()
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
                await page.get_by_role("button", name="任务", exact=True).first.click()
                await page.get_by_role("button", name=re.compile("趋势推测.*查看任务详情")).click()
                await expect(page.get_by_role("complementary", name="检查器").get_by_role("button", name="复制任务")).to_have_count(0)
                await page.get_by_role("button", name=re.compile(r"^专项报告.*查看任务详情")).first.click()
                await page.get_by_role("button", name="使用此任务").click()
                await page.get_by_role("textbox", name="问题", exact=True).fill("生成人工智能与医疗 2024 至 2025 报告")
                await page.get_by_role("button", name="发送 ↑").click()
                await expect(page.get_by_role("combobox", name="报告模板").locator("option", has_text="另有草稿")).to_have_count(1)
                await browser.close()
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            listener.close()
            assert not thread.is_alive()
    print("PASS: real API/browser custom task-template versioning, report binding, archive lifecycle and artifacts")


if __name__ == "__main__":
    asyncio.run(main())
