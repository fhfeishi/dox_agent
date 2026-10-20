"""Card B1 / G2-3: a report keeps going when its page is closed, and a service restart under it leaves
“已中断，可重试” with a working retry. The service runs as a separate process so the restart can be a
real `kill -9`; the report writer is a stand-in whose duration the test sets through a file."""
import asyncio
import os
import re
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from urllib.parse import quote

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


def serve(root: Path, port: int):
    """Child process: the real app on root's state, with a report writer that sleeps root/delay seconds."""
    import uvicorn
    from pydantic import SecretStr

    import src.api.library as library_api
    import src.api.reports as reports_api
    import src.main as main_module
    from src.agent.config import Settings
    from src.review import storage

    async def writer(knowledge, settings, params, **kwargs):
        await asyncio.sleep(float((root / "delay").read_text()))
        return f"# {params['domain']}\n\n巡检机器人项目的研究进展 [1]。\n"

    reports_api.generate_markdown = writer
    importer = library_api.import_defaults

    def slow_import(*args, **kwargs):  # a library refresh that takes root/import_delay seconds
        time.sleep(float((root / "import_delay").read_text()))
        return importer(*args, **kwargs)

    library_api.import_defaults = slow_import

    class Answer:  # a model that writes five parts, root/answer_delay seconds apart
        async def astream(self, messages):
            for part in ("第一段，", "第二段，", "第三段，", "第四段，", "第五段完。"):
                await asyncio.sleep(float((root / "answer_delay").read_text()))
                yield SimpleNamespace(content=part)

    from src.agent.graph import build_graph
    storage.DATA = root / "state" / "review"
    settings = Settings(_env_file=None, state_dir=root / "state", corpora_root=root / "corpora", user_dir=root / "usr",
                        model_api_key=SecretStr("fixture"), model_base_url="http://127.0.0.1:9", embedding_path="")
    app = main_module.create_app(settings, graph_factory=lambda knowledge, s: build_graph(knowledge, s, Answer()))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="error")


def start(root: Path) -> tuple[subprocess.Popen, str]:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    child = subprocess.Popen([sys.executable, __file__, "serve", str(root), str(port)], cwd=ROOT,
                             env={**os.environ, "PYTHONPATH": str(ROOT)})
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.5).close()
            return child, f"http://127.0.0.1:{port}"
        except OSError:
            time.sleep(0.2)
    child.kill()
    raise RuntimeError("service did not start")


def prepare(root: Path) -> str:
    from pydantic import SecretStr

    from src.agent.config import Settings
    from src.agent.corpora import scan_corpora
    from src.knowledge import Knowledge
    from src.parsers import import_defaults

    corpus = root / "corpora" / "自然科学基金-机器人"
    source = corpus / "source"
    source.mkdir(parents=True)
    (source / "2021_2024_62173009_王强_巡检机器人.md").write_text("# 项目报告\n国家自然科学基金\n批准号：62173009\n巡检机器人。")
    settings = Settings(_env_file=None, state_dir=root / "state", corpora_root=root / "corpora", user_dir=root / "usr",
                        model_api_key=SecretStr("fixture"), embedding_path="")
    import_defaults(Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings, source_root=source),
                    settings, root=source, parsed_root=corpus / "parsed")
    return scan_corpora(settings)[0].id


async def sign_in(page, origin):
    await page.request.post(origin + "/api/auth/login", data={"username": "user", "password": "123456"})
    for key in ("home", "overview", "chat", "library", "tasks", "review", "intelligence", "results"):
        await page.request.post(origin + "/api/auth/guides", data={"key": key})


async def request_report(page, origin, corpus_id, topic):
    await page.goto(f"{origin}/library/{quote(corpus_id)}/documents?workspace=1&task=task4")
    work = page.get_by_role("region", name="分析工作区")
    await work.get_by_role("button", name="生成报告…").click()
    form = work.get_by_role("form", name="生成报告")
    await form.get_by_label("报告主题").fill(topic)
    await form.get_by_role("button", name="生成").click()


async def until(page, locator, seconds=30):
    """The report centre is read when opened: look again until the state appears."""
    deadline = time.monotonic() + seconds
    while True:
        try:
            await expect(locator.first).to_be_visible(timeout=3000)
            return
        except AssertionError:
            if time.monotonic() > deadline:
                raise
        await page.reload()


async def main():
    with TemporaryDirectory(prefix="dox-run-detach-") as directory:
        root = Path(directory)
        corpus_id = prepare(root)
        (root / "delay").write_text("4")
        (root / "import_delay").write_text("0")
        (root / "answer_delay").write_text("1")
        child, origin = start(root)
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                # One browser profile: closing a tab keeps the sign-in, as for a person closing the page.
                context = await browser.new_context(viewport={"width": 1440, "height": 900})
                errors = []
                # 1. Ask for a report and close the page at once; it is in 报告中心 when one comes back.
                page = await context.new_page()
                page.on("pageerror", lambda e: errors.append(str(e)))
                await sign_in(page, origin)
                await request_report(page, origin, corpus_id, "巡检机器人研究进展")
                await page.wait_for_timeout(600)
                await page.close()
                page = await context.new_page()
                await page.goto(origin + "/results")
                rows = page.locator("li").filter(has_text="巡检机器人研究进展")
                await until(page, rows.filter(has_text="已完成"))
                await rows.get_by_role("button", name="打开").first.click()
                await expect(page.locator("aside[aria-hidden='false']")).to_contain_text("巡检机器人项目的研究进展")
                # The report is recorded as the user's own: it is listed under 我的工作 on 首页.
                await page.goto(origin + "/home")
                await expect(page.get_by_role("region", name="我的工作")).to_contain_text("巡检机器人研究进展")

                # 2. A report still being written when the service is killed comes back as 已中断，可重试.
                (root / "delay").write_text("120")
                await request_report(page, origin, corpus_id, "中断后重试的报告")
                await page.wait_for_timeout(1500)
                os.kill(child.pid, signal.SIGKILL)
                child.wait(timeout=10)
                (root / "delay").write_text("2")
                child, origin = start(root)
                page = await context.new_page()
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.on("dialog", lambda dialog: asyncio.ensure_future(dialog.accept()))
                await sign_in(page, origin)
                await page.goto(origin + "/results")
                interrupted = page.locator("li").filter(has_text="中断后重试的报告")
                await until(page, interrupted.filter(has_text="已中断，可重试"))
                await page.screenshot(path=str(ROOT / ".logsdev/verification/upgrade-B1/results-interrupted.png"))
                await interrupted.get_by_role("button", name="打开").first.click()
                panel = page.locator("aside[aria-hidden='false']")
                await expect(panel.get_by_role("alert")).to_contain_text("已中断，可重试")
                await page.screenshot(path=str(ROOT / ".logsdev/verification/upgrade-B1/panel-interrupted.png"))
                await panel.get_by_role("button", name="按原设置重新生成").click()
                # A quick retry opens the new report; a slow one says it has started and may be left.
                await expect(panel).to_contain_text(re.compile("已重新开始生成|巡检机器人项目的研究进展"))
                # The retry completes as a new report; the interrupted record moves to the recycle bin.
                await until(page, interrupted.filter(has_text="已完成"))
                await expect(interrupted.filter(has_text="已中断")).to_have_count(0)
                await page.screenshot(path=str(ROOT / ".logsdev/verification/upgrade-B1/results-retried.png"))

                # 3. A library refresh cut off by a restart is reported as such, not forgotten.
                (root / "import_delay").write_text("120")
                assert (await page.request.post(f"{origin}/api/corpora/{quote(corpus_id)}/ingest")).ok
                await page.wait_for_timeout(1000)
                os.kill(child.pid, signal.SIGKILL)
                child.wait(timeout=10)
                (root / "import_delay").write_text("0")
                child, origin = start(root)
                page = await context.new_page()
                await sign_in(page, origin)
                await page.goto(f"{origin}/library/{quote(corpus_id)}/documents")
                await expect(page.get_by_text("上次刷新因服务重启中断", exact=False)).to_be_visible()
                await page.screenshot(path=str(ROOT / ".logsdev/verification/upgrade-B1/library-import-interrupted.png"))

                # 4. An answer keeps being written after its page closes (user, 2026-10-20):
                #    back after it finished, the whole answer is there; back while it runs, it carries on live.
                async def ask(question):
                    await page.goto(origin + "/chat")
                    await page.get_by_role("textbox", name="问题", exact=True).fill(question)
                    await page.wait_for_timeout(1500)  # let the conversation finish rendering before counting
                    before = await page.locator("article").count()
                    await page.get_by_role("button", name="发送 ↑").click()
                    await expect(page.locator("article")).to_have_count(before + 2)  # the question and its answer
                    await expect(page.locator("article").last).to_contain_text("第一段")

                await ask("巡检机器人有哪些进展？")
                await page.close()
                await asyncio.sleep(6)  # the server finishes the answer meanwhile
                page = await context.new_page()
                page.on("pageerror", lambda e: errors.append(str(e)))
                await page.goto(origin + "/chat")
                await expect(page.locator("article").last).to_contain_text("第五段完。", timeout=10000)
                await page.screenshot(path=str(ROOT / ".logsdev/verification/upgrade-B1/answer-after-leaving.png"))
                await ask("巡检机器人还有哪些待研究的问题？")
                await page.close()
                page = await context.new_page()
                await page.goto(origin + "/chat")
                await expect(page.locator("article").last).to_contain_text("第五段完。", timeout=15000)
                # Picked up, not asked again: the question is there once.
                await expect(page.locator("article").filter(has_text="巡检机器人还有哪些待研究的问题？")).to_have_count(1)

                # 5. 停止 now has to reach the server: the answer stops there and is not picked up again.
                await ask("巡检机器人这一问会被停止")
                await page.get_by_role("button", name="停止").click()
                await page.wait_for_timeout(6000)  # long enough for the stand-in to have finished
                sessions = await (await page.request.get(origin + "/api/workspace/sessions")).json()
                stopped = next(t for item in sessions for t in item["data"]["turns"] if t["question"] == "巡检机器人这一问会被停止")
                run = await (await page.request.get(origin + "/api/runs/" + stopped["runId"])).json()
                assert run["status"] == "interrupted" and not run.get("replay"), run.get("status")
                await expect(page.locator("article").last).not_to_contain_text("第五段完。")

                # 6. While an answer is written the reader can scroll up and stay there (query 2026-1020 1719).
                await ask("巡检机器人还有哪些应用场景？")
                conversation = page.get_by_role("region", name="对话")
                await conversation.evaluate("el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); }")
                await page.wait_for_timeout(2500)  # two more parts arrive meanwhile
                assert await conversation.evaluate("el => el.scrollTop") < 40, "the page jumped back to the bottom"
                back = page.get_by_role("button", name=re.compile("回到最新"))
                await expect(back).to_be_visible()
                await back.click()
                await page.wait_for_timeout(800)
                assert await conversation.evaluate("el => el.scrollHeight - el.scrollTop - el.clientHeight") < 80
                assert not errors, errors
                await browser.close()
            print("PASS report survives a closed page; after kill -9 it shows 已中断，可重试 and the retry completes; "
                  "an import cut off by kill -9 shows as interrupted; an answer keeps going after its page closes; 停止 stops it at the server; "
                  "the reader can scroll up while an answer is written")
        finally:
            child.kill()
            child.wait(timeout=10)


if __name__ == "__main__":
    if sys.argv[1:2] == ["serve"]:
        serve(Path(sys.argv[2]), int(sys.argv[3]))
    else:
        (ROOT / ".logsdev/verification/upgrade-B1").mkdir(parents=True, exist_ok=True)
        asyncio.run(main())
