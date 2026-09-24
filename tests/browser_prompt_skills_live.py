"""Browser + real local API: edit Prompt/Skill and bind a fixed Skill version to a task."""

import asyncio
import socket
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

import uvicorn
from playwright.async_api import async_playwright, expect

from tests.test_runs import ready_app


async def main():
    with TemporaryDirectory(prefix="dox-prompt-skill-") as directory:
        app, _ = ready_app(Path(directory))
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen(128)
        port = listener.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error", lifespan="on"))
        thread = Thread(target=lambda: asyncio.run(server.serve(sockets=[listener])), daemon=True)
        thread.start()
        origin = f"http://127.0.0.1:{port}"
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 950})
                await page.goto(origin)
                await page.get_by_role("button", name="Prompt / Skill").click()
                await expect(page.get_by_role("button", name="新建 Prompt")).to_be_visible()
                await page.get_by_role("button", name="新建 Prompt").click()
                await page.get_by_label("Prompt 正文").fill("研究主题：{{topic}}")
                await page.get_by_label("Prompt 变量").fill("topic")
                await page.get_by_role("button", name="保存并启用").click()
                await expect(page.get_by_text("已启用 v1", exact=False)).to_be_visible()
                prompt_id = (await (await page.request.get(f"{origin}/api/prompt-skills")).json())[-1]["id"]

                await page.get_by_role("button", name="新建 Skill").click()
                await page.get_by_label("Skill 规则").fill("先检索，再回答")
                await page.get_by_label("Skill 输入").fill("topic")
                await page.get_by_label("Skill Prompt").select_option(f"{prompt_id}|1")
                await page.get_by_label("Skill 输出").fill("给出结论和引用")
                await page.get_by_label("knowledge_search").check()
                await page.get_by_label("测试输入 topic").fill("材料")
                await page.get_by_role("button", name="保存并启用").click()
                await expect(page.get_by_text("已启用 v1", exact=False)).to_have_count(2)
                await page.get_by_role("button", name="静态检查").click()
                await expect(page.get_by_text("研究主题：材料", exact=False)).to_be_visible()
                await expect(page.get_by_text("未运行模型", exact=False)).to_be_visible()
                skill_id = next(item["id"] for item in await (await page.request.get(f"{origin}/api/prompt-skills")).json() if item["kind"] == "skill")

                await page.get_by_role("button", name="任务", exact=True).click()
                await page.get_by_role("button", name="复制问答任务").click()
                await page.get_by_label("固定 Skill 版本").select_option(f"{skill_id}|1")
                # The Skill input must be supplied by the published task definition.
                await page.get_by_role("button", name="添加参数").click()
                await page.get_by_label("参数1名称").fill("topic")
                await page.get_by_label("参数1标签").fill("研究主题")
                await page.get_by_label("参数1默认").fill("材料")
                await page.get_by_role("button", name="保存并发布").click()
                await expect(page.get_by_text("已发布 v1")).to_be_visible()
                await browser.close()
        finally:
            server.should_exit = True
            thread.join(timeout=5)
            listener.close()
            assert not thread.is_alive()


if __name__ == "__main__":
    asyncio.run(main())
