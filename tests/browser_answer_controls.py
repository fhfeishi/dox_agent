"""Offline browser acceptance: built UI + controlled streams, no model requests."""

import asyncio
import json
import os
import re
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect

from tests.browser_support import FrontendHandler

CORPUS = {"id": "c1", "name": "演示库", "kind": "demo", "domain": "x", "rel_path": "c1",
          "docs_count": 1, "source_count": 1, "indexed_count": 1, "pending_count": 0, "failed_count": 0,
          "preparation": "ready", "is_default": True, "index_progress": None, "job": None}


async def check_workspace_panels(page, origin):
    """Hidden targets must open during every task's walkthrough; switching panels must not move input."""
    tasks = [{"id": f"task{i}", "name": name, "description": name, "has_template": False}
             for i, name in enumerate(["精准问答", "对比分析", "技术研判", "专项报告"], 1)]
    await page.route(re.compile(r".*/api/tasks(\?.*)?$"), lambda r: r.fulfill(json=tasks))
    await page.route("**/api/corpora/*/hierarchy", lambda r: r.fulfill(json={
        "state": "ready", "scenes": [{"name": "临床诊疗"}, {"name": "影像分析"}]}))
    requests = []

    async def compose(route):
        requests.append(route.request.post_data_json)
        await route.fulfill(json={"question": "综合梳理本库的技术谱系、场景、问题、技术和成果，以及投入和待突破方向。", "added": []})

    await page.route("**/api/compose-question", compose)
    for task in tasks:
        await page.goto(origin + "/chat?task=" + task["id"])
        guide = page.get_by_role("dialog", name=task["name"] + "使用指引")
        await expect(guide).to_be_visible()
        await guide.get_by_role("button", name="下一步").click()
        libraries = page.get_by_role("dialog", name="对话资料库", exact=True)
        await expect(libraries).to_be_visible()
        await guide.get_by_role("button", name="下一步").click()
        quick = page.get_by_role("dialog", name="点选提问", exact=True)
        await expect(quick).to_be_visible()
        await expect(libraries).not_to_be_visible()
        await guide.get_by_role("button", name="上一步").click()
        await expect(libraries).to_be_visible()
        await expect(quick).not_to_be_visible()
        await guide.get_by_role("button", name="下一步").click()
        await guide.get_by_role("button", name="下一步").click()
        await expect(quick).not_to_be_visible()
        await guide.get_by_role("button", name="下一步").click()
        await guide.get_by_role("button", name="开始使用").click()
    await page.get_by_role("button", name="点选提问", exact=True).click()
    quick = page.get_by_role("dialog", name="点选提问", exact=True)
    await quick.get_by_role("button", name="综合分析", exact=True).click()
    await expect(quick.get_by_role("button", name="综合", exact=True)).to_have_attribute("aria-pressed", "true")
    await quick.get_by_role("button", name="生成问题", exact=False).click()
    await expect(quick.get_by_text("生成的问题", exact=True)).to_be_visible()
    assert requests[-1]["intents"] == ["综合分析"] and requests[-1]["scene"] == ""
    await quick.get_by_role("button", name="填入输入框", exact=False).click()
    field = page.get_by_role("textbox", name="问题", exact=True)
    await expect(field).to_have_value(re.compile("^综合梳理"))
    before = await field.bounding_box()
    await page.get_by_role("button", name=re.compile("^对话知识库：")).click()
    await expect(page.get_by_role("dialog", name="对话资料库", exact=True)).to_be_visible()
    await page.get_by_role("button", name="点选提问", exact=True).click()
    await expect(quick).to_be_visible()
    await expect(page.get_by_role("dialog", name="对话资料库", exact=True)).not_to_be_visible()
    after = await field.bounding_box()
    assert abs(before["y"] - after["y"]) <= 1, (before, after)
    await expect(quick.get_by_role("button", name="综合分析", exact=True)).to_have_attribute("aria-pressed", "true")
    await page.keyboard.press("Escape")
    await expect(quick).not_to_be_visible()
    libraries_data = [CORPUS, *[{**CORPUS, "id": f"c{i}", "name": f"资料库{i}", "is_default": False} for i in range(2, 9)],
                      {**CORPUS, "id": "lost", "name": "缺失库", "missing": True}]
    await page.route(re.compile(r".*/api/corpora(\?.*)?$"), lambda r: r.fulfill(json=libraries_data))
    # A reload reads the new library inventory, as in a real session returning after a library import.
    await page.reload()
    await page.get_by_role("button", name=re.compile("^对话知识库：")).click()
    libraries = page.get_by_role("dialog", name="对话资料库", exact=True)
    for i in range(2, 7):
        await libraries.get_by_role("checkbox", name=f"当前对话使用 资料库{i}", exact=True).check()
    await expect(libraries.get_by_role("checkbox", name="当前对话使用 资料库7", exact=True)).to_be_disabled()
    await expect(libraries.get_by_role("checkbox", name="当前对话使用 缺失库", exact=True)).to_be_disabled()
    search = libraries.get_by_role("textbox", name="搜索知识库范围")
    await search.fill("资料库7")
    await libraries.get_by_role("button", name="仅使用此库", exact=True).click()
    await expect(libraries.get_by_role("checkbox", name="当前对话使用 资料库7", exact=True)).to_be_checked()
    await expect(libraries.get_by_label("已选资料库")).to_contain_text("资料库7")
    await expect(libraries.get_by_label("已选资料库")).not_to_contain_text("演示库")
    await search.fill("演示库")
    await libraries.get_by_role("button", name="仅使用此库", exact=True).click()
    await libraries.get_by_role("button", name="完成", exact=True).click()
    await page.get_by_role("button", name="资料范围： 全部", exact=True).click()
    await expect(page.get_by_role("button", name="资料范围： 全部", exact=True)).to_have_attribute("aria-expanded", "true")
    await page.keyboard.press("Escape")
    await page.unroute(re.compile(r".*/api/corpora(\?.*)?$"))
    await page.route(re.compile(r".*/api/corpora(\?.*)?$"), lambda r: r.fulfill(json=[CORPUS]))
    # Leave the original answer-controls journey with its original task and empty input.
    await page.goto(origin + "/chat?task=task1")
    await page.get_by_role("dialog", name="精准问答使用指引").get_by_role("button", name="跳过").click()


async def show_technical(page):
    """Open the latest answer's 资料检索 panel if folded, then its 技术信息 (administrators only)."""
    header = page.get_by_role("button", name=re.compile("^资料检索")).last
    await expect(header).to_be_visible()
    if await header.get_attribute("aria-expanded") != "true":
        await header.click()
    details = page.locator("details").filter(has=page.get_by_text("技术信息", exact=True)).last
    await expect(details).to_be_visible()
    if await details.get_attribute("open") is None:
        await details.locator("summary").click()


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(FrontendHandler, directory=str(root / "frontend/dist")))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{server.server_port}"
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(permissions=["clipboard-read", "clipboard-write"], viewport={"width": 1280, "height": 950})
            page = await context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            # Login exists since query 2026-1013 1133; offline scripts run as a signed-in administrator.
            await page.route("**/api/auth/session", lambda r: r.fulfill(json={"authenticated": True, "username": "admin", "role": "admin", "guides_seen": ["home", "leader", "chat", "library", "tasks", "review", "intelligence"]}))
            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline-test"}))
            await page.route(re.compile(r".*/api/corpora/[^/]+/files.*$"), lambda r: r.fulfill(json={"source_dir": "/tmp/c1/source", "files": [], "misplaced_files": []}))
            await page.route(re.compile(r".*/api/corpora(\?.*)?$"), lambda r: r.fulfill(json=[CORPUS]))
            await page.route(re.compile(r".*/api/documents(\?.*)?$"), lambda r: r.fulfill(json=[{
                "doc_id": "d1", "title": "引用资料", "version": "v1", "kind": "text",
                "origin": "sample.md", "parser": "markdown", "pages": 1, "captured_at": "",
            }]))
            await page.route("**/api/documents/d1/markdown*", lambda r: r.fulfill(json={
                "text": "# 引用正文", "doc_id": "d1", "version": "v1",
            }))
            await page.route("**/api/workspace/*", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions/*", lambda r: r.fulfill(json={
                **r.request.post_data_json, "id": r.request.url.rsplit("/", 1)[-1],
                "revision": r.request.post_data_json["revision"] + 1,
            }))
            await page.add_init_script("""(() => {
                const realFetch = window.fetch.bind(window);
                window.requests = [];
                window.savedSessionWrites = [];
                window.mode = 'success';
                window.fetch = async (url, options) => {
                    if (typeof url === 'string' && url.startsWith('/api/workspace/sessions/') && options?.method === 'PUT') {
                        const response = await realFetch(url, options);
                        if (response.ok) window.savedSessionWrites.push(JSON.parse(options.body));
                        return response;
                    }
                    if (url !== '/api/chat') return realFetch(url, options);
                    window.requests.push(JSON.parse(options.body));
                    const mode = window.mode;
                    const text = mode === 'compare' ? '| 维度 | 差异 |\\n| --- | --- |\\n| 技术 | 方法不同 [1] |'
                        : '**答案版本' + window.requests.length + '**\\n\\n```python\\nprint(1)\\n```';
                    let timers = [];
                    return new Response(new ReadableStream({
                        start(controller) {
                            const send = (event, data) => controller.enqueue(new TextEncoder().encode('event: ' + event + '\\ndata: ' + JSON.stringify(data) + '\\n\\n'));
                            options.signal.addEventListener('abort', () => { timers.forEach(clearTimeout); controller.error(new DOMException('Aborted', 'AbortError')); }, {once: true});
                            send('status', {message: '测试研究中'});
                            if (mode === 'compare') send('run', {task_id: 'task2'});
                            send('token', {text: ''});
                            send('sources', [1, 2].map(citation => ({
                                citation, doc_id: 'd1', corpus_id: 'c1', version: 'v1',
                                title: '引用资料', snippet: '引用正文', page: 1, url: ''
                            })));
                            if (mode === 'cancel') return;
                            // Hold the first token until the test has observed the waiting state.
                            // A fixed 180ms window disappears on a busy machine before the panels open.
                            if (window.requests.length === 1) {
                                window.releaseFirstToken = () => {
                                    window.releaseFirstToken = null;
                                    send('token', {text});
                                    timers.push(setTimeout(() => send('done', {ok: true}), 320));
                                };
                                return;
                            }
                            timers.push(setTimeout(() => send('token', {text}), 180));
                            timers.push(setTimeout(() => {
                                if (mode === 'failure') controller.close();
                                else send('done', {ok: true});
                            }, 500));
                        },
                        cancel() { timers.forEach(clearTimeout); }
                    }), {headers: {'Content-Type': 'text/event-stream'}});
                };
            })();""")
            await page.goto(origin)
            await page.get_by_role("link", name="对话工作台", exact=True).click()
            await check_workspace_panels(page, origin)
            field = page.get_by_role("textbox", name="问题", exact=True)
            await field.fill("第一问")
            await page.get_by_role("button", name="发送 ↑").click()
            # Timings and tokens sit in the folded 技术信息 of the 资料检索 panel (2026-10-20).
            await show_technical(page)
            await expect(page.get_by_text("首 token / Think 等待：等待中", exact=False)).to_be_visible()
            await page.evaluate("window.releaseFirstToken()")
            await expect(page.get_by_role("button", name="重新生成").last).to_be_enabled()
            article = page.locator("article").last
            await expect(article.get_by_text("答案版本1", exact=True)).to_be_visible()
            await expect(article.get_by_role("button", name="1 引用资料 · 第1页", exact=True)).to_have_count(1)
            await expect(article.get_by_text("引用来源 1 篇")).to_be_visible()
            await article.get_by_role("button", name="1 引用资料 · 第1页", exact=True).click()
            await expect(page.get_by_role("heading", name="引用正文", exact=True)).to_be_visible()
            await page.get_by_role("button", name="关闭预览面板", exact=True).click()
            await article.get_by_role("button", name="复制答案", exact=True).click()
            assert await page.evaluate("navigator.clipboard.readText()") == "**答案版本1**\n\n```python\nprint(1)\n```"
            await article.get_by_role("button", name="重新生成").click()
            await expect(article.get_by_role("button", name="重新生成")).to_be_enabled()
            requests = await page.evaluate("window.requests")
            assert {k: v for k, v in requests[0].items() if k != "run_id"} == {k: v for k, v in requests[1].items() if k != "run_id"}
            assert requests[0]["messages"] == [{"role": "user", "content": "第一问"}]
            assert requests[0]["allowed_doc_ids"] is None
            await article.get_by_text("之前的回答 · 1 个版本", exact=True).click()
            await expect(article.get_by_text("答案版本1", exact=True)).to_be_visible()
            await expect(article.get_by_text("答案版本2", exact=True)).to_be_visible()
            # Follow-up is a new user action after the completed regenerated answer is persisted.
            await page.wait_for_function("window.savedSessionWrites.some(s => s.data?.turns?.[0]?.complete && s.data.turns[0].answer.includes('答案版本2'))")
            await field.fill("追问")
            await page.get_by_role("button", name="发送 ↑").click()
            # Sending first asks which library fits the question, so wait for the request itself.
            try:
                await page.wait_for_function("window.requests.length === 3")
            except Exception:
                print("Follow-up diagnostic:", await page.evaluate("({requests: window.requests.length, body: document.body.innerText})"))
                raise
            await expect(page.get_by_role("button", name="重新生成").last).to_be_enabled()
            messages = await page.evaluate("window.requests.at(-1).messages")
            assert messages[1]["content"].startswith("**答案版本2**")
            assert len(messages) == 3
            # 对比分析: the comparison table keeps its inline [n] citation, without the source list.
            await page.evaluate("window.mode = 'compare'")
            await field.fill("对比两个项目")
            await page.get_by_role("button", name="发送 ↑").click()
            compare = page.locator("article").last
            await expect(compare.get_by_text("方法不同", exact=False)).to_be_visible()
            await expect(compare.get_by_role("button", name="[1]", exact=True)).to_have_count(1)
            await expect(compare.get_by_text("引用来源", exact=False)).to_have_count(0)
            await page.evaluate("window.mode = 'success'")
            await page.evaluate("window.mode = 'cancel'")
            await field.fill("草稿不要清空")
            await page.get_by_role("button", name="重新生成").last.click()
            await expect(field).to_have_value("草稿不要清空")
            await page.get_by_role("button", name="停止", exact=True).click()
            await expect(page.get_by_role("button", name=re.compile("^资料检索")).last).to_contain_text("已中断，结果未确认")
            latest = page.locator("article").last
            await show_technical(page)
            await expect(latest.get_by_text("首 token / Think 等待：未收到正文", exact=True).first).to_be_visible()
            await page.evaluate("window.mode = 'failure'")
            await page.get_by_role("button", name="重新生成").last.click()
            await expect(page.get_by_role("button", name=re.compile("^资料检索")).last).to_contain_text("处理失败")
            assert "连接中断" in await page.get_by_role("alert").inner_text()
            await page.evaluate("Object.defineProperty(navigator.clipboard, 'writeText', {value: async () => {throw new Error('denied')}})")
            await latest.get_by_role("button", name="复制答案", exact=True).first.click()
            await expect(page.get_by_text("复制失败，请手动选择答案复制。", exact=True)).to_be_visible()
            await page.get_by_role("button", name="导出", exact=True).click()
            async with page.expect_download() as download_info:
                await page.get_by_role("button", name="导出诊断 JSON").click()
            download = await download_info.value
            exported = json.loads(Path(await download.path()).read_text())
            failed = exported["turns"][-1]
            assert failed["totalMs"] is None and failed["firstTokenMs"] >= 0
            assert failed["outcome"] == "failed" and len(failed["previousAttempts"]) == 2
            for turn in exported["turns"]:
                for attempt in [turn, *turn["previousAttempts"]]:
                    if attempt["complete"]:
                        assert 0 <= attempt["firstTokenMs"] <= attempt["totalMs"]
            output = root / "data/answer-controls.png"
            output.parent.mkdir(exist_ok=True)
            await page.screenshot(path=str(output), full_page=True)
            # Long user queries and comparison tables must wrap inside the reading column.
            await page.evaluate("window.mode = 'compare'")
            await field.fill("请综合分析本资料库在临床诊疗、医学影像与数据治理方面的研究路线、核心问题、关键技术和已有成果，结合项目与经费投入指出待突破的缺口，并区分原文事实与研判意见。" * 3)
            await page.get_by_role("button", name="发送 ↑").click()
            await expect(page.locator("article").last.locator("table")).to_be_visible()
            shots = Path(os.environ.get("WORKSPACE_SHOTS") or root / ".logsdev/verification/workspace-ui")
            shots.mkdir(parents=True, exist_ok=True)
            for width, height in [(1366, 900), (2560, 1440), (3840, 2160)]:
                await page.set_viewport_size({"width": width, "height": height})
                await page.locator(".chat-question").last.scroll_into_view_if_needed()
                assert await page.locator(".question-text").last.evaluate("e=>e.scrollWidth<=e.clientWidth")
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                await page.screenshot(path=str(shots / f"reading-{width}.png"))
            await page.set_viewport_size({"width": 390, "height": 844})
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert not errors, errors
            await browser.close()
            print("PASS: copy, clipboard failure, regenerate context/history, live timing, cancel, failure, export, mobile overflow")
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == "__main__":
    asyncio.run(main())
