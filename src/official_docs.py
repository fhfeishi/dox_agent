"""Discover and import public Markdown documentation into the local corpus."""

import asyncio
import re
import sqlite3
from urllib.parse import urljoin, urlsplit

import httpx

from .knowledge import Document, Page

SECTIONS = {name: f"https://docs.langchain.com/oss/python/{name}/llms.txt" for name in ("langchain", "langgraph", "deepagents")}


async def fetch_markdown(http, url):
    for _ in range(5):
        response = await http.get(url)
        if response.is_redirect:
            target = urljoin(url, response.headers["location"])
            if urlsplit(target).netloc != "docs.langchain.com" or urlsplit(target).scheme != "https":
                raise ValueError("目录指向外部站点，不作为官方正文导入")
            url = target
            if not urlsplit(url).path.endswith((".md", ".txt")):
                url = url.rstrip("/") + ".md"
            continue
        response.raise_for_status()
        return response
    raise ValueError("重定向次数过多")


def discover(text: str, section: str) -> list[tuple[str, str]]:
    pages = {}
    for title, url in re.findall(r"\[([^\]]+)\]\((https://[^\s)]+)\)", text):
        parsed = urlsplit(url)
        if parsed.netloc == "docs.langchain.com" and parsed.path.startswith(f"/oss/python/{section}/") and parsed.path.endswith(".md") and not parsed.query:
            pages[url] = title
    return list(pages.items())


async def import_official(knowledge, sections: list[str], progress: dict, client=None):
    async def run(http):
        pages = {}
        for section in sections:
            response = await http.get(SECTIONS[section])
            response.raise_for_status()
            found = discover(response.text, section)
            if not found:
                raise ValueError(f"{section} 文档目录没有有效Markdown页面")
            pages.update(found)
        progress["total"] = len(pages)
        semaphore = asyncio.Semaphore(4)

        async def ingest(url, title):
            async with semaphore:
                try:
                    response = await fetch_markdown(http, url)
                    text = response.text
                    if not text.strip() or len(text) > 1_000_000 or "<html" in text[:500].lower():
                        raise ValueError("正文为空、超限或返回HTML")
                    document = Document(title=title, origin=url.removesuffix(".md"), kind="official", parser="official-markdown", pages=[Page(number=1, text=text)])
                    result = await asyncio.to_thread(knowledge.put, document)
                    progress["imported"] += 1
                    progress["changed"] += int(result["changed"])
                except (httpx.HTTPError, ValueError, OSError, sqlite3.Error) as exc:
                    progress["errors"].append({"url": url, "error": type(exc).__name__})
                finally:
                    progress["completed"] += 1

        await asyncio.gather(*(ingest(url, title) for url, title in pages.items()))

    if client is not None:
        await run(client)
    else:
        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as http:
            await run(http)
