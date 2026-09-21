"""Offline browser acceptance: built UI + controlled streams, no model requests."""

import asyncio
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root / "frontend/dist")))
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
            await page.route("**/api/health", lambda r: r.fulfill(json={"preparation": "ready", "api_key_configured": True, "model": "offline-test"}))
            await page.route("**/api/documents", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/*", lambda r: r.fulfill(json=[]))
            await page.route("**/api/workspace/sessions/*", lambda r: r.fulfill(json={
                **r.request.post_data_json, "id": r.request.url.rsplit("/", 1)[-1],
                "revision": r.request.post_data_json["revision"] + 1,
            }))
            await page.route("**/api/official-docs", lambda r: r.fulfill(json={"status": "idle", "errors": []}))
            await page.add_init_script("""(() => {
                const realFetch = window.fetch.bind(window);
                window.requests = [];
                window.mode = 'success';
                window.fetch = async (url, options) => {
                    if (url !== '/api/chat') return realFetch(url, options);
                    window.requests.push(JSON.parse(options.body));
                    const mode = window.mode;
                    const text = '**答案版本' + window.requests.length + '**\\n\\n```python\\nprint(1)\\n```';
                    let timers = [];
                    return new Response(new ReadableStream({
                        start(controller) {
                            const send = (event, data) => controller.enqueue(new TextEncoder().encode('event: ' + event + '\\ndata: ' + JSON.stringify(data) + '\\n\\n'));
                            options.signal.addEventListener('abort', () => { timers.forEach(clearTimeout); controller.error(new DOMException('Aborted', 'AbortError')); }, {once: true});
                            send('status', {message: '测试研究中'});
                            send('token', {text: ''});
                            if (mode === 'cancel') return;
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
            field = page.get_by_role("textbox", name="问题", exact=True)
            await field.fill("第一问")
            await page.get_by_role("button", name="发送 ↑").click()
            await expect(page.get_by_text("首 token / Think 等待：等待中", exact=False)).to_be_visible()
            await expect(page.get_by_role("button", name="重新生成")).to_be_enabled()
            article = page.locator("article").last
            await expect(article.get_by_text("答案版本1", exact=True)).to_be_visible()
            await article.get_by_role("button", name="复制答案", exact=True).click()
            assert await page.evaluate("navigator.clipboard.readText()") == "**答案版本1**\n\n```python\nprint(1)\n```"
            await article.get_by_role("button", name="重新生成").click()
            await expect(article.get_by_role("button", name="重新生成")).to_be_enabled()
            requests = await page.evaluate("window.requests")
            assert requests[0] == requests[1]
            assert requests[0]["messages"] == [{"role": "user", "content": "第一问"}]
            assert requests[0]["query_routing"] == "auto"
            assert requests[0]["evidence_level"] == "middle"
            await article.get_by_text("之前的回答 · 1 个版本", exact=True).click()
            await expect(article.get_by_text("答案版本1", exact=True)).to_be_visible()
            await expect(article.get_by_text("答案版本2", exact=True)).to_be_visible()
            await field.fill("追问")
            await page.get_by_role("button", name="发送 ↑").click()
            await expect(page.get_by_role("button", name="重新生成")).to_be_enabled()
            messages = await page.evaluate("window.requests.at(-1).messages")
            assert messages[1]["content"].startswith("**答案版本2**")
            assert len(messages) == 3
            await page.evaluate("window.mode = 'cancel'")
            await field.fill("草稿不要清空")
            await page.get_by_role("button", name="重新生成").click()
            await expect(field).to_have_value("草稿不要清空")
            await page.get_by_role("button", name="停止", exact=True).click()
            await expect(page.get_by_text("已停止（未完成）", exact=False)).to_be_visible()
            latest = page.locator("article").last
            await expect(latest.get_by_text("首 token / Think 等待：未收到正文", exact=True).first).to_be_visible()
            await page.evaluate("window.mode = 'failure'")
            await page.get_by_role("button", name="重新生成").click()
            await expect(page.get_by_text("失败（未完成）", exact=False)).to_be_visible()
            assert "连接中断" in await page.get_by_role("alert").inner_text()
            await page.evaluate("Object.defineProperty(navigator.clipboard, 'writeText', {value: async () => {throw new Error('denied')}})")
            await latest.get_by_role("button", name="复制答案", exact=True).first.click()
            await expect(page.get_by_text("复制失败，请手动选择答案复制。", exact=True)).to_be_visible()
            async with page.expect_download() as download_info:
                await page.get_by_role("button", name="导出对话与证据版本").click()
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
