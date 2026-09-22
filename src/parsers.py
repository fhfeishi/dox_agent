"""Replaceable ingestion functions: local LiteParse, Crawl4AI or Firecrawl."""

import asyncio
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from .agent.config import Settings
from .knowledge import Document, Page


def _pdf_pages(path: Path, settings: Settings, *, ocr_enabled: bool, target_pages: list[int] | None = None) -> list[Page]:
    from liteparse import LiteParse

    options = dict(ocr_enabled=ocr_enabled, ocr_language=settings.pdf_ocr_language, output_format="json", quiet=True)
    if target_pages:
        options["target_pages"] = ",".join(str(number) for number in target_pages)
    if settings.pdf_num_workers:
        options["num_workers"] = settings.pdf_num_workers
    result = LiteParse(**options).parse(str(path))
    return [Page(number=p.page_num, text=p.text) for p in result.pages]


def parse_pdf_pages(path: Path, settings: Settings) -> list[Page]:
    """K2/K3: OCR tiers — off (text layer), force (always), auto (only text-less pages)."""
    if settings.pdf_ocr_mode == "force":
        return _pdf_pages(path, settings, ocr_enabled=True)
    pages = _pdf_pages(path, settings, ocr_enabled=False)
    if settings.pdf_ocr_mode == "auto":
        empty = [page.number for page in pages if not page.text.strip()]
        if empty:
            try:
                rescued = {page.number: page.text for page in _pdf_pages(path, settings, ocr_enabled=True, target_pages=empty)}
            except Exception:  # noqa: BLE001 - keep the text layer when OCR is unavailable
                rescued = {}
            pages = [Page(number=page.number, text=rescued.get(page.number) or page.text) for page in pages]
    return pages


def parse_file(path: Path, settings: Settings) -> Document:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md"}:
        pages = [Page(number=1, text=path.read_text(encoding="utf-8-sig"))]
        parser = "utf8"
    elif suffix == ".pdf":
        import liteparse

        pages = parse_pdf_pages(path, settings)
        parser = "liteparse/" + liteparse.__version__
    else:
        raise ValueError("仅支持 txt、md、pdf")
    return Document(
        title=path.stem,
        origin=str(path.resolve()),
        kind="pdf" if suffix == ".pdf" else "text",
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


def import_defaults(knowledge, settings: Settings, *, root: Path | None = None, exclude: list[Path] = ()) -> dict:
    """K1: incremental local import backed by the `files` manifest.

    With `root` (a corpus ``source/`` dir) only that corpus is collected; the legacy path
    keeps the old dual-root collection. Unchanged files are skipped; changed/new files are
    re-parsed; source files that disappeared are removed from the manifest and from `docs`
    (so BM25 stops returning them; dense drops stale ids on its next sync). An empty manifest
    is the first backfill and re-parses everything once.
    """
    excluded = [item.resolve() for item in exclude]
    manifest = knowledge.files()
    current: dict[str, Path] = {}
    for path in collect_sources(root, settings):
        resolved = path.resolve()
        if any(resolved == item or item in resolved.parents for item in excluded):
            continue
        base = Path(root) if root is not None else source_base(path, settings)
        try:
            rel = resolved.relative_to(base.resolve()).as_posix()
        except ValueError:
            rel = path.name
        current[rel] = path

    added = updated = skipped = 0
    imported, errors = [], []
    for rel, path in current.items():
        prev = manifest.get(rel)
        try:
            stat = path.stat()
            if prev and prev["status"] == "indexed" and prev["size"] == stat.st_size and prev["mtime_ns"] == stat.st_mtime_ns:
                skipped += 1
                continue
            digest = sha256_file(path)
            if prev and prev["status"] == "indexed" and prev["sha256"] == digest:
                knowledge.record_file(rel, stat.st_size, stat.st_mtime_ns, digest, prev["doc_id"], "indexed")
                skipped += 1
                continue
            result = knowledge.put(parse_file(path, settings))
            knowledge.record_file(rel, stat.st_size, stat.st_mtime_ns, digest, result["doc_id"], "indexed")
            imported.append(result)
            updated += 1 if prev else 0
            added += 0 if prev else 1
        except Exception as exc:  # noqa: BLE001 - retain other sources on parser failure
            errors.append({"source": path.name, "error": type(exc).__name__})
            try:
                stat = path.stat()
                knowledge.record_file(rel, stat.st_size, stat.st_mtime_ns, (prev or {}).get("sha256", ""),
                                      (prev or {}).get("doc_id"), "error")
            except OSError:
                pass

    deleted = 0
    for rel in list(manifest):
        if rel in current or manifest[rel]["status"] == "removed":
            continue
        knowledge.drop_file(rel)
        deleted += 1
    return {"imported": imported, "errors": errors, "added": added, "updated": updated,
            "skipped": skipped, "deleted": deleted, "scanned": len(current)}


def source_base(path: Path, settings: Settings) -> Path:
    """Legacy collection spans knowledge_root/text_root; pick the root that contains the file."""
    for candidate in (settings.knowledge_root, settings.text_root):
        try:
            path.resolve().relative_to(candidate.resolve())
            return candidate
        except ValueError:
            continue
    return path.parent


def collect_sources(root: Path | None, settings: Settings) -> list[Path]:
    if root is not None:
        base = Path(root)
        return sorted(p for p in base.rglob("*") if p.is_file() and p.suffix.lower() in {'.pdf', '.txt', '.md'})
    return sorted(
        set(settings.text_root.rglob("*.txt"))
        | set(settings.text_root.rglob("*.md"))
        | {p for p in settings.knowledge_root.rglob("*") if p.is_file() and p.suffix.lower() == ".pdf"}
    )


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(chunk), b""):
            digest.update(block)
    return digest.hexdigest()
