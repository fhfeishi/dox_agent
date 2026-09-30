"""User saves, revises, restores and purges artifacts through a real local API and built UI.

Only the model graph/report generator are deterministic test doubles. HTTP, SQLite,
session persistence, artifact APIs, and the browser are real. All data is temporary.
"""

import asyncio
import re
import shutil
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


class OfflineGraph:
    def __init__(self, corpus_id: str, doc_id: str):
        self.corpus_id = corpus_id
        self.doc_id = doc_id

    async def astream(self, state, **kwargs):
        yield {"event": "sources", "data": [{"doc_id": self.doc_id, "corpus_id": self.corpus_id,
                                             "version": "v1", "title": "样本", "page": 1}]}
        yield {"event": "token", "data": {"text": "离线回答 [1]"}}
        yield {"event": "done", "data": {"ok": True}}


async def offline_report(knowledge, settings, params, *, llm=None, template_content=None,
                         task_definition=None, visible_sources=None):
    doc = knowledge.current()[0]
    if visible_sources is not None:
        visible_sources.append({"citation": 1, "doc_id": doc["doc_id"], "title": doc["title"],
                                "version": doc["version"], "page": 1,
                                "url": f"/api/documents/{doc['doc_id']}?version={doc['version']}"})
    return "# 实测报告\n\n| 结论 | 来源 |\n| --- | --- |\n| 已验证 | [1] 样本 |\n"


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


async def main():
    with TemporaryDirectory(prefix="dox-artifacts-live-") as directory:
        root = Path(directory)
        corpus_root = root / ".knowledge"
        corpus_dir = corpus_root / "fixture"
        corpus_dir.mkdir(parents=True)
        state_dir = root / "state"
        settings = Settings(_env_file=None, corpora_root=corpus_root, state_dir=state_dir,
                            model_api_key=SecretStr("offline-test"), auto_import_official=False)
        knowledge = Knowledge(corpus_dir / "datadb" / "knowledge.sqlite3", settings=settings)
        doc = knowledge.put(Document(title="样本", origin="2021_2025_P1_张三_sample.md", kind="text", parser="text",
                                     pages=[Page(number=1, text="证据正文")],
                                     markdown="填表日期：2025年\n资助类别：面上项目\n证据正文"))
        for name in ("zz-b", "zz-c"):
            other=Knowledge(corpus_root/name/"datadb"/"knowledge.sqlite3",settings=settings)
            other.put(Document(title=name,origin=f"2021_2025_P2_李四_{name}.md",kind="text",parser="text",pages=[Page(number=1,text="独立库资料")],markdown="独立库资料"))
        corpus_id = corpus_id_for("fixture")
        main_module.generate_markdown = offline_report

        def application():
            return main_module.create_app(settings, knowledge,
                                          lambda *_: OfflineGraph(corpus_id, doc["doc_id"]))

        origin, server, thread, listener = start_server(application())
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 950})
                await page.goto(origin)
                await expect(page.get_by_role("button",name="✓ fixture",exact=True)).to_be_visible()
                await page.get_by_role("button",name="＋管理知识库",exact=True).click()
                async def fail_save(route):
                    if route.request.method == "PUT": await route.fulfill(status=503,json={"detail":"受控保存失败"})
                    else: await route.continue_()
                await page.route("**/api/workspace/sessions/*",fail_save)
                await page.get_by_role("checkbox",name="当前对话使用 zz-b",exact=True).check()
                await expect(page.get_by_text("范围未保存",exact=False)).to_be_visible()
                await page.get_by_role("textbox",name="问题",exact=True).fill("保存完成前不发送")
                await expect(page.get_by_role("button",name="发送 ↑",exact=True)).to_be_disabled()
                await page.unroute("**/api/workspace/sessions/*",fail_save)
                await page.get_by_role("button",name="重试保存",exact=True).click()
                await expect(page.get_by_role("button",name="发送 ↑",exact=True)).to_be_enabled()

                await expect(page.get_by_role("button",name="✓ zz-b",exact=True)).to_be_visible()
                await page.get_by_role("button",name="＋管理知识库",exact=True).click()
                await page.get_by_title("任务 / 附件",exact=True).click()
                await page.get_by_role("button",name="导入文件",exact=False).click()
                await page.get_by_role("combobox",name="上传目标知识库").select_option(corpus_id_for("zz-c"))
                await expect(page.get_by_text("此库未用于当前对话")).to_be_visible()
                await page.get_by_role("button",name="前往添加资料").click()
                await page.locator('input[type="file"]').set_input_files({"name":"uploaded.txt","mimeType":"text/plain","buffer":b"isolated upload"})
                await expect(page.get_by_text("uploaded.txt",exact=True).first).to_be_visible()
                # The upload queue echoes the name before the POST lands on disk; poll the file instead.
                for _ in range(100):
                    try:
                        if (corpus_root/"zz-c"/"source"/"uploaded.txt").read_bytes()==b"isolated upload": break
                    except OSError: pass
                    await asyncio.sleep(0.1)
                else: raise AssertionError("uploaded.txt 未在 10 秒内落盘")
                await page.get_by_role("navigation").get_by_role("button",name="对话",exact=True).click()
                await expect(page.get_by_role("button",name="✓ fixture",exact=True)).to_be_visible()
                await expect(page.get_by_role("button",name="✓ zz-b",exact=True)).to_be_visible()
                await expect(page.get_by_role("button",name="✓ zz-c",exact=True)).to_have_count(0)
                await page.get_by_role("textbox", name="问题", exact=True).fill("查询样本")
                await page.get_by_role("button", name="发送 ↑").click()
                await expect(page.get_by_role("button", name="保存为成果")).to_be_visible()
                await page.get_by_role("button", name="保存为成果").click()
                await expect(page.get_by_text(re.compile("已保存为成果"))).to_be_visible()

                sessions=await (await page.request.get(f"{origin}/api/workspace/sessions")).json()
                active_scope=next(row["data"]["corpus_ids"] for row in sessions if row["data"].get("turns"))
                assert active_scope == [corpus_id,corpus_id_for("zz-b")]
                session_key = await page.evaluate("localStorage.getItem('dox-agent-session')")
                template = await (await page.request.post(
                    f"{origin}/api/templates/custom",
                    data={"source_template_id": "comprehensive"})).json()
                template_draft = await (await page.request.put(
                    f"{origin}/api/templates/custom/{template['id']}/draft",
                    data={"revision": template["revision"], "name": "实测模板",
                          "content": "# 实测模板\n\n## 章节\n"})).json()
                template_publish = await page.request.post(
                    f"{origin}/api/templates/custom/{template['id']}/publish",
                    data={"revision": template_draft["revision"]})
                assert template_publish.status == 200
                task = await (await page.request.post(
                    f"{origin}/api/tasks/custom", data={"source_task_id": "task4"})).json()
                task_draft = await (await page.request.put(
                    f"{origin}/api/tasks/custom/{task['id']}/draft",
                    data={"revision": task["revision"], "name": "实测报告任务", "goal": "生成实测报告",
                          "background": "只依据样本", "report_template_id": template["id"],
                          "report_template_version": 1})).json()
                task_publish = await page.request.post(
                    f"{origin}/api/tasks/custom/{task['id']}/publish",
                    data={"revision": task_draft["revision"]})
                assert task_publish.status == 200
                custom_chat = await page.request.post(f"{origin}/api/chat", data={
                    "task_id": task["id"], "task_version": 1, "run_id": "live-custom-task-run-1",
                    "session_key": session_key, "corpus_ids": [corpus_id],
                    "messages": [{"role": "user", "content": "查询样本"}]})
                assert custom_chat.status == 200
                report = await page.request.post(f"{origin}/api/reports", data={
                    "domain": "实测领域", "year_from": 2024, "year_to": 2025,
                    "template_id": template["id"], "template_version": 1,
                    "corpus_id": corpus_id, "session_key": session_key,
                    "run_id": "live-report-run-1", "task_id": task["id"], "task_version": 1})
                assert report.status == 201, await report.text()


                await page.get_by_role("navigation").get_by_role("button", name="成果", exact=True).click()
                await expect(page.get_by_role("button", name="离线回答 [1]", exact=True)).to_be_visible()
                await expect(page.get_by_role("button", name="实测领域", exact=True)).to_be_visible()
                await page.get_by_role("button", name="离线回答 [1]", exact=True).click()
                await expect(page.get_by_text("原始回答已核验").last).to_be_visible()
                await page.get_by_role("button", name="编辑新版本").click()
                await page.get_by_role("textbox", name="成果 Markdown").fill("# 人工修订\n\n保留来源 [1]")
                await page.get_by_role("button", name="保存草稿").click()
                await expect(page.get_by_role("heading", name="人工修订")).to_be_visible()
                await expect(page.get_by_text("用户修订版本").last).to_be_visible()
                await page.get_by_role("combobox", name="成果版本").select_option("1")
                await expect(page.get_by_text("原始回答已核验").last).to_be_visible()
                await page.get_by_role("button", name="＋ 新的问答",exact=True).click()
                await page.get_by_role("navigation").get_by_role("button", name="成果", exact=True).click()
                await expect(page.get_by_role("button", name="离线回答 [1]", exact=True)).to_be_visible()
                card=page.locator("article").filter(has=page.get_by_role("button",name="离线回答 [1]",exact=True))
                await card.get_by_role("button",name="移入回收站",exact=True).click()
                await page.get_by_role("button",name="回收站",exact=True).click()
                await page.get_by_role("button",name="离线回答 [1]",exact=True).click()
                await expect(page.get_by_text(re.compile("回收站只读"))).to_be_visible()
                await page.get_by_role("combobox",name="成果版本").select_option("1")
                await expect(page.get_by_text("原始回答已核验").last).to_be_visible()
                await page.get_by_role("button",name="还原",exact=True).last.click()
                await page.get_by_role("button",name="成果",exact=True).last.click()
                await expect(page.get_by_role("button",name="离线回答 [1]",exact=True)).to_be_visible()
                # P1: a second snapshot is purged through the browser confirm path; the chat answer survives.
                await page.get_by_role("navigation").get_by_role("button",name="对话",exact=True).click()
                await page.get_by_role("textbox",name="问题",exact=True).fill("第二次查询样本")
                await page.get_by_role("button",name="发送 ↑",exact=True).click()
                await expect(page.get_by_role("button",name="保存为成果",exact=True)).to_have_count(1)  # current turn only
                await page.get_by_role("button",name="保存为成果",exact=True).click()
                await expect(page.get_by_text(re.compile("已保存为成果")).last).to_be_visible()
                snapshots=await (await page.request.get(f"{origin}/api/artifacts?type=answer_snapshot")).json()
                assert len(snapshots)==2,snapshots
                doomed=snapshots[0]["artifact_id"]  # active view sorts created_at DESC; card 0 is the newest snapshot
                await page.get_by_role("navigation").get_by_role("button",name="成果",exact=True).click()
                cards=page.locator("article").filter(has=page.get_by_role("button",name="离线回答 [1]",exact=True))
                await expect(cards).to_have_count(2)
                await cards.nth(0).get_by_role("button",name="移入回收站",exact=True).click()
                trashed_list=await (await page.request.get(f"{origin}/api/artifacts?view=trash")).json()
                assert [item["artifact_id"] for item in trashed_list]==[doomed],"卡片位置与最新快照不一致"
                await page.get_by_role("button",name="回收站",exact=True).click()
                trashed_card=page.locator("article").filter(has=page.get_by_role("button",name="离线回答 [1]",exact=True))
                await expect(trashed_card).to_have_count(1)
                page.once("dialog",lambda dialog: dialog.dismiss())
                await trashed_card.get_by_role("button",name="彻底删除",exact=True).click()
                await expect(trashed_card).to_have_count(1)  # dismissed confirmation must not purge
                page.once("dialog",lambda dialog: dialog.accept())
                await trashed_card.get_by_role("button",name="彻底删除",exact=True).click()
                await expect(trashed_card).to_have_count(0)
                purged=await page.request.get(f"{origin}/api/artifacts/{doomed}")
                assert purged.status==410,(purged.status,await purged.text())
                assert (await purged.json())["detail"]["lifecycle"]=="purged"
                remaining=await (await page.request.get(f"{origin}/api/artifacts?type=answer_snapshot")).json()
                assert [item["artifact_id"] for item in remaining]==[snapshots[1]["artifact_id"]]
                await page.get_by_role("button",name="成果",exact=True).last.click()
                await expect(cards).to_have_count(1)
                await page.get_by_role("navigation").get_by_role("button",name="对话",exact=True).click()
                await expect(page.get_by_text("离线回答 [1]").last).to_be_visible()  # the chat answer outlives its purged snapshot
                await page.get_by_role("navigation").get_by_role("button",name="知识库",exact=True).click()
                page.once("dialog",lambda dialog: dialog.accept("研究组"))
                await page.get_by_role("button",name="＋新建分组",exact=True).click()
                await expect(page.get_by_role("button",name="研究组 · 0 个库 · 展开",exact=True)).to_be_visible()
                await page.get_by_role("combobox",name="fixture 移动到分组",exact=True).select_option(label="研究组")
                await page.get_by_role("combobox",name="zz-b 移动到分组",exact=True).select_option(label="研究组")
                await page.get_by_role("button",name="研究组 · 2 个库 · 展开",exact=True).click()
                await expect(page.get_by_role("combobox",name="fixture 移动到分组",exact=True)).to_be_visible()
                await page.reload()
                await expect(page.get_by_role("button",name="研究组 · 2 个库 · 收起",exact=True)).to_be_visible()
                await page.get_by_role("textbox",name="搜索知识库",exact=True).fill("zz-b")
                await expect(page.get_by_role("combobox",name="fixture 移动到分组",exact=True)).to_have_count(0)
                await expect(page.get_by_role("combobox",name="zz-b 移动到分组",exact=True)).to_be_visible()
                await page.get_by_role("textbox",name="搜索知识库",exact=True).fill("")
                await expect(page.get_by_role("combobox",name="fixture 移动到分组",exact=True)).to_be_visible()
                await page.screenshot(path="/tmp/dox-groups.png",full_page=True)
                page.once("dialog",lambda dialog: dialog.accept())
                await page.get_by_role("button",name="解散分组",exact=True).click()
                await expect(page.get_by_role("button",name="研究组 · 2 个库 · 收起",exact=True)).to_have_count(0)
                assert len(await (await page.request.get(f"{origin}/api/corpora")).json()) == 3
                await page.get_by_role("navigation").get_by_role("button",name="对话",exact=True).click()
                await page.set_viewport_size({"width":720,"height":900})
                await page.screenshot(path="/tmp/dox-chat-narrow.png",full_page=True)
                await expect(page.get_by_role("button",name="＋管理知识库",exact=True)).to_be_visible()
                await browser.close()
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            listener.close()
            assert not thread.is_alive(), "test server did not stop"

        # A7: restore the state databases as one set and prove the artifact/run links survive.
        backup = root / "backup"
        backup.mkdir()
        assert {"artifacts.sqlite3", "templates.sqlite3"} <= {p.name for p in (state_dir/"artifacts").glob("*.sqlite3")}
        for source in state_dir.rglob("*.sqlite3"):
            dest=backup/source.relative_to(state_dir); dest.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(source,dest)
            source.unlink()
        for source in backup.rglob("*.sqlite3"):
            dest=state_dir/source.relative_to(backup); dest.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(source,dest)
        origin, server, thread, listener = start_server(application())
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 950})
                await page.goto(origin)
                await page.get_by_role("navigation").get_by_role("button", name="成果", exact=True).click()
                await expect(page.get_by_role("button", name="离线回答 [1]", exact=True)).to_be_visible()
                await expect(page.get_by_role("button", name="实测领域", exact=True)).to_be_visible()
                items = await (await page.request.get(f"{origin}/api/artifacts")).json()
                answer = next(item for item in items if item["type"] == "answer_snapshot")
                report = next(item for item in items if item["type"] == "report")
                assert answer["run_available"] and report["run_available"]
                old = await (await page.request.get(
                    f"{origin}/api/artifacts/{answer['artifact_id']}?version=1")).json()
                latest = await (await page.request.get(
                    f"{origin}/api/artifacts/{answer['artifact_id']}")).json()
                run = await (await page.request.get(f"{origin}/api/runs/{answer['run_id']}")).json()
                assert old["source_verification"] == "verified" and latest["version"] == 2
                assert run["status"] == "completed" and run["answer_sha256"]
                custom_task_version = await (await page.request.get(
                    f"{origin}/api/tasks/custom/{task['id']}/versions/1")).json()
                custom_template_version = await (await page.request.get(
                    f"{origin}/api/templates/custom/{template['id']}/versions/1")).json()
                custom_run = await (await page.request.get(
                    f"{origin}/api/runs/live-custom-task-run-1")).json()
                custom_report_artifact = await (await page.request.get(
                    f"{origin}/api/artifacts?session_key={session_key}&type=report")).json()
                assert custom_task_version["goal"] == "生成实测报告"
                assert custom_template_version["version"] == 1
                assert custom_run["task_version"] == 1 and custom_run["status"] == "completed"
                assert any(item["task_id"] == task["id"] and item["template_version"] == 1
                           for item in custom_report_artifact)

                await browser.close()
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            listener.close()
            assert not thread.is_alive(), "restored test server did not stop"
    print("PASS: real service browser artifact/report/version flow and paired SQLite restore")


if __name__ == "__main__":
    asyncio.run(main())
