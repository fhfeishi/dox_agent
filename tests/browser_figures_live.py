"""Local browser acceptance for a generated PDF figure and immutable artifact edits."""

import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from browser_artifacts_live import start_server
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright, expect
from pydantic import SecretStr

from src import reports
from src.agent.config import Settings
from src.agent.corpora import corpus_id_for
from src.knowledge import Document, Knowledge, Page
from src.main import create_app
from src.parsers import sha256_file


class FigureModel:
    async def ainvoke(self, messages):
        return SimpleNamespace(content="# 报告\n\n## 架构\n云边协同架构 [1]。")


async def main():
    with TemporaryDirectory(prefix="dox-figures-live-") as directory:
        root = Path(directory)
        corpus = root / ".knowledge" / "fixture"
        source = corpus / "source" / "study.pdf"
        parsed = corpus / "parsed" / "study.pdf"
        source.parent.mkdir(parents=True)
        (parsed / "images").mkdir(parents=True)
        cover = Image.new("RGB", (640, 400), "white")
        ImageDraw.Draw(cover).text((30, 30), "LOGO", fill="black")
        chart = Image.new("RGB", (640, 400), "white")
        ImageDraw.Draw(chart).line((80, 300, 220, 170, 400, 230, 540, 80), fill="red", width=12)
        alternative = Image.new("RGB", (640, 400), "white")
        ImageDraw.Draw(alternative).ellipse((90, 50, 550, 350), outline="green", width=16)
        cover.save(source, save_all=True, append_images=[chart, alternative])
        chart.save(parsed / "images" / "chart.jpg", quality=95)
        alternative.save(parsed / "images" / "alternative.jpg", quality=95)
        pages = [{"page_idx": 0, "blocks": []}]
        for page_idx, filename, caption in ((1, "chart.jpg", "图1 云边协同架构"),
                                             (2, "alternative.jpg", "图2 边缘计算拓扑")):
            pages.append({"page_idx": page_idx, "blocks": [{"type": "chart", "index": 0,
                "bbox": [0, 0, 1, 1], "content": [{"type": "chart_body", "image_path": f"images/{filename}"},
                    {"type": "chart_caption", "content": [{"type": "text", "content": caption}]}]}]})
        (parsed / "middle_json.json").write_text(json.dumps({"pages": pages}, ensure_ascii=False))
        settings = Settings(_env_file=None, corpora_root=root / ".knowledge", state_dir=root / "state",
                            model_api_key=SecretStr("offline-test"), auto_import_official=False)
        knowledge = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings)
        doc = knowledge.put(Document(title="云边协同", origin=str(source), kind="pdf", parser="mineru",
            pages=[Page(number=1, text="标题"), Page(number=2, text="云边协同架构"),
                   Page(number=3, text="边缘计算拓扑")],
            markdown="填表日期：2025年\n资助类别：面上项目\n云边协同架构"))
        knowledge.record_file("study.pdf", source.stat().st_size, source.stat().st_mtime_ns,
                              sha256_file(source), doc["doc_id"], "indexed")
        reports.model_for = lambda settings: FigureModel()
        origin, server, thread, listener = start_server(create_app(settings, knowledge))
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 950})
                await page.goto(origin)
                response = await page.request.post(f"{origin}/api/reports", data={
                    "domain": "云边协同", "year_from": 2025, "year_to": 2025,
                    "template_id": "comprehensive", "corpus_id": corpus_id_for("fixture"),
                    "illustrated": True})
                assert response.status == 201, await response.text()
                await page.get_by_role("button", name="成果", exact=True).click()
                await page.get_by_role("button", name="云边协同", exact=False).first.click()
                image = page.get_by_role("img", name="图1 云边协同架构")
                await expect(image).to_be_visible()
                assert await image.evaluate("image => image.complete && image.naturalWidth > 0")
                assert "#page=2" in await image.locator("xpath=..").get_attribute("href")
                await page.get_by_role("button", name="替换图片").click()
                await expect(page.get_by_role("link", name="查看原 PDF 第 3 页")).to_be_visible()
                await page.get_by_role("button", name="选用此图").click()
                await expect(page.get_by_role("img", name="图2 边缘计算拓扑").last).to_be_visible()
                await page.get_by_role("button", name="移除图片").click()
                await expect(page.get_by_role("img", name="图2 边缘计算拓扑")).to_have_count(0)
                await page.get_by_role("combobox", name="成果版本").select_option("1")
                await expect(page.get_by_role("img", name="图1 云边协同架构")).to_be_visible()
                await browser.close()
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            listener.close()
            assert not thread.is_alive()


if __name__ == "__main__":
    asyncio.run(main())
