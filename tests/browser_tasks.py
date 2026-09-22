"""Offline browser acceptance: task system is on by default (cards, output hint, task_id).

Serves the built `frontend/dist` with mocked APIs. Verifies that `GET /api/tasks` drives the
task views, that selecting a task binds a new session to it, and that `POST /api/chat` carries
`task_id` (and the browsed `corpus_id`). No model requests.
"""

import asyncio
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect

TASKS = [
    {"id": "task1", "name": "精准问答", "description": "回答具体问题。", "output_hint": "结论 + 逐条 [n] 引用", "has_template": False},
    {"id": "task2", "name": "对比分析", "description": "跨文档对比。", "output_hint": "对比维度表 + 可比性前提", "has_template": False},
    {"id": "task3", "name": "趋势推测", "description": "讨论领域走向。", "output_hint": "事实/推断分段 + 置信度", "has_template": False},
    {"id": "task4", "name": "专项报告", "description": "按模板生成报告。", "output_hint": "Markdown 报告 + 来源 + 局限", "has_template": True},
]


async def main():
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root / "frontend/dist")))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    store: dict[str, dict] = {}
    chat_bodies: list[dict] = []
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

            async def chat(r):
                payload = r.request.post_data_json
                chat_bodies.append(payload)
                rid = payload.get("run_id")
                step_running = json.dumps({"run_id": rid, "id": "s1", "sequence": 1, "phase": "research",
                                          "status": "running", "label": "搜索资料"})
                step_done = json.dumps({"run_id": rid, "id": "s1", "sequence": 1, "phase": "research",
                                       "status": "completed", "label": "搜索资料", "duration_ms": 1234})
                body = (f'event: step\ndata: {step_running}\n\n'
                        f'event: step\ndata: {step_done}\n\n'
                        'event: sources\ndata: []\n\n'
                        'event: token\ndata: {"text":"回答"}\n\n'
                        'event: done\ndata: {"ok":true}\n\n')
                await r.fulfill(status=200, content_type="text/event-stream", body=body)

            await page.route("**/api/health", health)
            await page.route("**/api/documents", documents)
            await page.route("**/api/corpora", corpora)
            await page.route("**/api/tasks", tasks)
            await page.route("**/api/workspace/sessions", sessions)
            await page.route("**/api/workspace/sessions/*", sessions)
            await page.route("**/api/official-docs", official)
            await page.route("**/api/chat", chat)

            await page.goto(origin)

            # task views are reachable from the rail and show the output contract
            await page.get_by_role("button", name="任务模板").first.click()
            await expect(page.get_by_text("对比维度表 + 可比性前提")).to_be_visible()

            # selecting a task binds a new session and returns to chat
            await page.get_by_text("对比维度表 + 可比性前提").click()
            field = page.get_by_role("textbox", name="问题", exact=True)
            await field.fill("对比一下")
            await page.get_by_role("button", name="发送 ↑").click()
            await expect(page.get_by_text("回答", exact=False).first).to_be_visible()

            assert chat_bodies, "no chat request captured"
            body = chat_bodies[-1]
            assert body.get("task_id") == "task2", body
            assert body.get("corpus_id") == "c1", body
            # per-step latency from step events is shown in the answer trace
            await expect(page.get_by_text("1.2 秒").first).to_be_visible()
            assert not errors, errors
            print("PASS: tasks on by default, output_hint shown, task selection binds session, chat carries task_id + corpus_id, step duration shown")
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
