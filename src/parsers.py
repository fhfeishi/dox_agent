"""Replaceable ingestion functions: local LiteParse, Crawl4AI or Firecrawl."""

import asyncio
import json
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from .agent.config import Settings
from .knowledge import Document, Page


def parse_file(path: Path, settings: Settings) -> Document:
    if path.suffix.lower() in {".txt", ".md"}:
        pages = [Page(number=1, text=path.read_text(encoding="utf-8-sig"))]
        parser = "utf8"
    elif path.suffix.lower() == ".pdf":
        import liteparse
        from liteparse import LiteParse

        result = LiteParse(
            ocr_enabled=settings.pdf_ocr,
            ocr_language=settings.pdf_ocr_language,
            output_format="json",
            quiet=True,
        ).parse(str(path))
        pages = [Page(number=p.page_num, text=p.text) for p in result.pages]
        parser = "liteparse/" + liteparse.__version__
    else:
        raise ValueError("仅支持 txt、md、pdf")
    return Document(
        title=path.stem,
        origin=str(path.resolve()),
        kind="pdf" if path.suffix.lower() == ".pdf" else "text",
        parser=parser,
        pages=pages,
    )


def session_for(url: str, settings: Settings) -> dict:
    if not settings.web_sessions_file:
        return {}
    sessions = json.loads(settings.web_sessions_file.read_text(encoding="utf-8"))
    return sessions.get(urlsplit(url).hostname, {})


async def crawl4ai_page(url: str, session: dict) -> tuple[str, str]:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig

    browser = BrowserConfig(headless=True, verbose=False, storage_state=session.get("storage_state"))
    config = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, verbose=False, page_timeout=60000)
    async with AsyncWebCrawler(config=browser) as crawler:
        result = await crawler.arun(url=url, config=config)
    if not result.success or (result.status_code or 200) >= 400:
        raise ValueError("网页抓取失败，可能需要登录、重新授权或人工处理")
    return (result.metadata or {}).get("title") or url, result.markdown.raw_markdown


async def firecrawl_page(url: str, session: dict, settings: Settings) -> tuple[str, str]:
    if not settings.firecrawl_api_key:
        raise ValueError("请配置 FIRECRAWL_API_KEY")
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            settings.firecrawl_base_url.rstrip("/") + "/v2/scrape",
            headers={"Authorization": "Bearer " + settings.firecrawl_api_key.get_secret_value()},
            json={
                "url": url,
                "formats": ["markdown"],
                "onlyMainContent": True,
                "headers": session.get("headers", {}),
            },
        )
    if response.status_code >= 400:
        raise ValueError(f"Firecrawl 请求失败（HTTP {response.status_code}）")
    data = response.json()
    if not data.get("success"):
        raise ValueError("Firecrawl 未能提取页面")
    result = data["data"]
    return result.get("metadata", {}).get("title", url), result.get("markdown", "")


async def parse_web(url: str, settings: Settings) -> Document:
    parsed = urlsplit(url)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username:
        raise ValueError("请输入不含账号密码的 HTTP(S) URL")
    session = session_for(url, settings)
    if settings.web_provider == "crawl4ai":
        title, text = await asyncio.wait_for(crawl4ai_page(url, session), timeout=100)
    elif settings.web_provider == "firecrawl":
        title, text = await firecrawl_page(url, session, settings)
    else:
        raise ValueError("WEB_PROVIDER 必须为 crawl4ai 或 firecrawl")
    if not text.strip():
        raise ValueError("网页正文为空，请检查登录状态或页面加载情况")
    if len(text) > 1_000_000:
        raise ValueError("页面超过 100 万字符，请缩小抓取范围")
    return Document(
        title=title, origin=url, kind="web", parser=settings.web_provider, pages=[Page(number=1, text=text)]
    )


def import_defaults(knowledge, settings: Settings) -> dict:
    paths = sorted(
        set(settings.text_root.rglob("*.txt"))
        | set(settings.text_root.rglob("*.md"))
        | {p for p in settings.knowledge_root.rglob("*") if p.suffix.lower() == ".pdf"}
    )
    imported, errors = [], []
    for path in paths:
        try:
            imported.append(knowledge.put(parse_file(path, settings)))
        except Exception as exc:  # noqa: BLE001 - retain other sources on parser failure
            errors.append({"source": path.name, "error": type(exc).__name__})
    return {"imported": imported, "errors": errors}
