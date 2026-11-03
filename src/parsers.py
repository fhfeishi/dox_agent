"""Replaceable ingestion functions: local mineru (PDF), docx, Crawl4AI or Firecrawl."""

import asyncio
import hashlib
import json
import logging
import os
import re
import shlex
import shutil
import signal
import subprocess
import time
import unicodedata
from pathlib import Path, PureWindowsPath
from urllib.parse import urlsplit

import httpx

from .agent.config import Settings
from .agent.corpora import SOURCE_SUFFIXES
from .knowledge import Document, Page, content_version_of, is_virtual_rel
from .parse_cache import (
    CACHE_FILE,
    LEGACY,
    cache_state,
    canonical_dir,
    complete,
    drop_marker,
    load_output,
    output_page_count,
    output_page_texts,
    parse_quality,
    parser_profile,
    pdf_page_count,
    promote,
    publishes,
    read_cache,
    staging_dir,
    sweep,
    write_cache,
)
from .retrieval import RawBlock

logger = logging.getLogger(__name__)


def _first_file(directory: Path, names: list[str]) -> Path | None:
    for name in names:
        candidate = directory / name
        if candidate.is_file():
            return candidate
    for pattern in names:
        matches = sorted(directory.glob(pattern))
        if matches:
            return matches[0]
    return None


def _block_text(block: dict) -> str:
    """Flatten mineru block content to plain text (content may nest lists/dicts)."""
    def flatten(node: object) -> str:
        if isinstance(node, str):
            return node
        if isinstance(node, list):
            return "".join(flatten(item) for item in node)
        if isinstance(node, dict):
            if isinstance(node.get("text"), str):
                return node["text"]
            return flatten(node.get("content", ""))
        return ""

    return flatten(block).strip()


def _extract_archives(out_dir: Path) -> None:
    """K13: ``--format zip`` writes a single archive; unpack it in place before reading."""
    import zipfile

    for archive in sorted(out_dir.glob("*.zip")):
        with zipfile.ZipFile(archive) as bundle:
            bundle.extractall(out_dir)
        archive.unlink()


def _mineru_markdown(out_dir: Path) -> str:
    path = _first_file(out_dir, ["markdown.md", "full.md", "*.md"])
    return path.read_text(encoding="utf-8") if path else ""


def _mineru_grouped(out_dir: Path) -> list[tuple[int, list]]:
    """L2: blocks grouped by ``page_idx`` from the first mineru-like JSON."""
    for candidate in sorted(out_dir.glob("*.json")):
        try:
            data = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        grouped: list[tuple[int, list]] = []
        if isinstance(data, dict) and isinstance(data.get("pages"), list):
            grouped = [(page.get("page_idx", index), page.get("blocks", []))
                       for index, page in enumerate(data["pages"])]
        elif isinstance(data, list):
            pages: dict[int, list] = {}
            for block in data:
                if isinstance(block, dict):
                    pages.setdefault(int(block.get("page_idx", 0)), []).append(block)
            grouped = list(pages.items())
        if grouped:
            return grouped
    return []


def read_mineru_output(out_dir: Path) -> tuple[str, list[Page]]:
    """K13: read a mineru output dir into ``(markdown, pages)``.

    v4 emits one ``*.md`` (base64 images) plus a middle JSON with ``pages[].page_idx``;
    classic emits ``full.md`` plus ``*_content_list.json`` blocks with ``page_idx``.
    Page numbers come from the JSON; without it the markdown is a single page.
    """
    _extract_archives(out_dir)
    markdown = _mineru_markdown(out_dir)
    by_page: dict[int, list[str]] = {}
    for page_idx, page_blocks in _mineru_grouped(out_dir):
        texts = [text for text in (_block_text(block) for block in page_blocks if isinstance(block, dict)) if text.strip()]
        if texts:
            by_page.setdefault(int(page_idx), []).extend(texts)
    pages = [Page(number=index + 1, text="\n".join(texts)) for index, texts in sorted(by_page.items())]
    if not pages and markdown.strip():
        pages = [Page(number=1, text=markdown)]
    return markdown, pages


def read_mineru_blocks(out_dir: Path) -> list[RawBlock]:
    """L2: atomic mineru blocks (page + kind) for chunking; tables stay whole."""
    _extract_archives(out_dir)
    blocks: list[RawBlock] = []
    for page_idx, page_blocks in _mineru_grouped(out_dir):
        for block in page_blocks:
            if not isinstance(block, dict):
                continue
            text = _block_text(block)
            if text.strip():
                blocks.append(RawBlock(page=int(page_idx) + 1, text=text, kind=str(block.get("type") or "text")))
    return blocks


# F1: MINERU_CMD no longer runs through a shell; these template tokens only made sense there.
_SHELL_TOKENS = {"|", "||", "&", "&&", ";", "<", ">", ">>", "2>", "2>&1"}
# cmd.exe re-parses the arguments of .bat/.cmd programs even without shell=True.
_CMD_META = set('&|<>^%!"()')
# Rejected in uploaded names: shell/cmd quoting and substitution, plus characters Windows forbids.
UNSAFE_NAME_CHARS = set('"`$<>|*?:\\')


def unsafe_name(name: str) -> bool:
    """F1: True when an uploaded file or folder name has characters we refuse to store."""
    return any(char in UNSAFE_NAME_CHARS or unicodedata.category(char) == "Cc" for char in name)


def mineru_args(template: str, pdf: Path, out: Path, *, search_path: str | None = None,
                windows: bool | None = None) -> list[str]:
    """F1: split MINERU_CMD into argv first, then fill ``{pdf}``/``{out}`` into single arguments.

    Quotes in the template (the default wraps ``"{pdf}"``) only group words. ``~`` and
    environment variables in the template are still expanded; pipes, ``&&`` or redirection are not.
    """
    windows = os.name == "nt" if windows is None else windows
    # Windows: non-POSIX split keeps backslashes in paths such as C:\tools\mineru-kit.exe.
    tokens = shlex.split(template, posix=not windows)
    if windows:
        tokens = [token[1:-1] if len(token) >= 2 and token[0] == token[-1] == '"' else token for token in tokens]
    if not tokens:
        raise ValueError("MINERU_CMD 为空")
    if any(token in _SHELL_TOKENS for token in tokens):
        raise ValueError("MINERU_CMD 不经过 shell，不能用管道、重定向或 && / ;，请写成一条命令")
    values = {"pdf": str(pdf), "out": str(out)}
    args = [os.path.expanduser(os.path.expandvars(token)).format(**values) for token in tokens]
    args[0] = shutil.which(args[0], path=search_path) or args[0]
    program = PureWindowsPath(args[0]) if windows else Path(args[0])
    if windows and program.suffix.lower() in {".bat", ".cmd"} and any(_CMD_META & set(arg) for arg in args[1:]):
        raise ValueError("MINERU_CMD 指向 .bat/.cmd，而文件路径含 cmd 特殊字符，已拒绝执行；请改名或改用 .exe")
    return args


# Causes a reader can act on, for the PDF failures seen in practice (A1 pack, 2026-10-21): the file list
# showed mineru's raw log tail — timestamps, module names, a temporary path. The full output is logged.
MINERU_CAUSES = (
    (("data format error", "failed to load document", "not a pdf", "invalid pdf"), "文件不是有效的 PDF：可能已损坏，或只是改了扩展名"),
    (("password", "encrypted"), "PDF 设有密码，无法读取"),
)


def mineru_failure(output: str) -> str:
    lowered = output.lower()
    for needles, reason in MINERU_CAUSES:
        if any(needle in lowered for needle in needles):
            return reason
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    plain = [line for line in lines if not re.match(r"^\d{4}-\d{2}-\d{2}[ T]", line)]
    last = re.sub(r"(?:[A-Za-z]:)?(?:[/\\][^\s/\\]+)+", "", (plain or lines or ["原因未知"])[-1]).strip(" :：")
    return "PDF 解析失败：" + (last[:120] or "原因未知")


class ParseError(ValueError):
    """A PDF parse that did not produce usable output; ``reason`` is a stable code for the record.

    Codes: ``tool_missing``, ``timeout``, ``tool_crash``, ``empty_output``, ``incomplete_output``
    (no per-page JSON), ``page_mismatch``.
    """

    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason


def parse_pdf_pages(path: Path, settings: Settings, out_dir: Path) -> tuple[str, list[Page]]:
    """K13: run mineru into ``out_dir`` and return ``(markdown, per-page text)``."""
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    environment = {**os.environ}
    # B1: `mineru-kit` lives in the running venv's bin dir; make it resolvable even when
    # launch.sh runs uvicorn without activating the venv.
    import sys

    environment["PATH"] = str(Path(sys.executable).parent) + os.pathsep + environment.get("PATH", "")
    if settings.mineru_home:
        environment["MINERU_HOME"] = str(settings.mineru_home)
    args = mineru_args(settings.mineru_cmd, path, out_dir, search_path=environment["PATH"])
    try:
        # F1: no shell, so file names stay literal argv entries and are never parsed as commands.
        process = subprocess.Popen(args, env=environment, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, start_new_session=True)
    except OSError as exc:
        raise ParseError("tool_missing", "无法启动 mineru：" + str(exc)) from exc
    try:
        output, _ = process.communicate(timeout=settings.mineru_timeout)
    except subprocess.TimeoutExpired:
        _kill_process_group(process)
        raise ParseError("timeout", f"mineru 解析超时（>{int(settings.mineru_timeout)}s；可用 MINERU_TIMEOUT 调大）") from None
    if process.returncode != 0:
        text = (output or b"")[-4000:].decode("utf-8", "ignore")
        logger.warning("mineru failed on %s:\n%s", path.name, text)
        raise ParseError("tool_crash", mineru_failure(text))
    markdown, pages = read_mineru_output(out_dir)
    if not pages:
        raise ParseError("empty_output", "mineru 输出为空，未入库")
    return markdown, pages


def _kill_process_group(process) -> None:
    """Kill the whole mineru process tree (mineru may spawn workers that would be orphaned)."""
    try:
        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError, AttributeError):  # AttributeError: no killpg on Windows
        process.kill()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        pass


def read_text_file(path: Path) -> str:
    """TXT/Markdown in UTF-8 (with or without BOM), or the GB18030 family most Chinese Windows tools
    still write (资料库数据接口 §2.1); anything else is refused rather than read as mojibake."""
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("文本编码无法识别，请另存为 UTF-8 后上传")


def parse_file(path: Path, settings: Settings, *, parsed_dir: Path | None = None,
               reuse_cache: bool = True) -> Document:
    suffix = path.suffix.lower()
    markdown = ""
    if suffix in {".txt", ".md", ".markdown"}:
        markdown = read_text_file(path)
        pages = [Page(number=1, text=markdown)]
        # Markdown keeps its own parser label so previews render it instead of a raw <pre>.
        parser = "markdown" if suffix in {".md", ".markdown"} else "utf8"
    elif suffix == ".pdf":
        out_dir = parsed_dir or path.parent / ".mineru" / path.stem
        # L1: reuse the mineru cache; only run the CLI when no cached parse exists.
        markdown, pages = read_mineru_output(out_dir) if reuse_cache else ("", [])
        if not pages:
            markdown, pages = parse_pdf_pages(path, settings, out_dir)
        parser = "mineru"
    elif suffix == ".docx":
        # K8: offline Word parsing (paragraphs + tables as text).
        import docx

        document = docx.Document(str(path))
        parts = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
        for table in document.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells]
                if any(cells):
                    parts.append(" | ".join(cells))
        markdown = "\n".join(parts)
        pages = [Page(number=1, text=markdown)]
        parser = "python-docx/" + getattr(docx, "__version__", "1")
    else:
        raise ValueError("仅支持 txt、md、pdf、docx")
    return Document(
        title=path.stem,
        origin=str(path.resolve()),
        kind="pdf" if suffix == ".pdf" else "text",
        parser=parser,
        pages=pages,
        markdown=markdown,
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
        title=title, origin=url, kind="web", parser=settings.web_provider,
        pages=[Page(number=1, text=text)], markdown=text,
    )


def import_defaults(knowledge, settings: Settings, *, root: Path, force: bool = False, parsed_root: Path | None = None) -> dict:
    """K1: incremental local import backed by the `files` manifest.

    Collects one corpus ``source/`` recursively (§10: no legacy dual root). Unchanged files are
    skipped; changed/new files are re-parsed; source files that disappeared are removed from the
    manifest and from `docs`. An empty manifest is the first backfill and re-parses everything
    once. ``parsed_root`` caches mineru output per file (K13).
    """
    manifest = knowledge.files()
    base = Path(root).resolve()
    if not base.is_dir():
        raise FileNotFoundError(f"资料目录不可读取：{base}")
    current: dict[str, Path] = {}
    refused: list[Path] = []
    for path in collect_sources(root, refused=refused):
        current[path.resolve().relative_to(base).as_posix()] = path

    if parsed_root is not None:
        sweep(Path(parsed_root), current)  # B2: before any import reads or writes the cache
    added = updated = skipped = 0
    imported = []
    # P0-3 B1: ``:`` is reserved for virtual rels (manual:/web:); such a file is reported, not indexed.
    errors = [{"source": path.name, "error": "UnsafeName"} for path in refused]
    for rel, path in current.items():
        prev = manifest.get(rel)
        outcome = import_one(knowledge, settings, path, rel, prev, force=force, parsed_root=parsed_root)
        if outcome == "skipped":
            skipped += 1
        elif isinstance(outcome, Exception):
            errors.append({"source": path.name, "error": type(outcome).__name__})
        else:
            imported.append(outcome)
            updated += 1 if prev else 0
            added += 0 if prev else 1

    deleted = 0
    for rel in list(manifest):
        # Virtual rels (manual text, web pages) have no file on disk by design.
        if rel in current or manifest[rel]["status"] == "removed" or is_virtual_rel(rel):
            continue
        knowledge.drop_file(rel)
        deleted += 1
    return {"imported": imported, "errors": errors, "added": added, "updated": updated,
            "skipped": skipped, "deleted": deleted, "scanned": len(current)}



def import_one(knowledge, settings: Settings, path: Path, rel: str, prev: dict | None, *, force: bool = False,
               parsed_root: Path | None = None):
    """Import one source file: ``"skipped"`` when unchanged, the stored result when indexed, or the
    exception when it failed (also recorded in the manifest with a reason the reader can use).

    P0-1 / B3: three stages with separate failure handling. P1 parses (or reuses a complete staging
    parse) and validates; P2 publishes body, chunks and manifest in one SQLite transaction; a P1/P2
    failure is recorded against ``prev`` (decision ②: an unchanged source keeps its current
    document). P3 promotes the staging parse to the canonical cache *after* publication, in its own
    try: it never rewrites the manifest, and an unfinished promotion is completed by the next import.
    """
    cached = parsed_root is not None and path.suffix.lower() == ".pdf"
    digest = after = ""
    staging: Path | None = None
    try:
        stat = path.stat()
        indexed = bool(prev) and prev["status"] == "indexed"
        if not force and indexed and prev["size"] == stat.st_size and prev["mtime_ns"] == stat.st_mtime_ns:
            return reconcile_cache(knowledge, path, rel, prev, Path(parsed_root)) if cached else "skipped"
        digest = sha256_file(path)
        if not force and indexed and prev["sha256"] == digest:
            knowledge.record_file(rel, stat.st_size, stat.st_mtime_ns, digest, prev["doc_id"], "indexed")
            return reconcile_cache(knowledge, path, rel, prev, Path(parsed_root)) if cached else "skipped"
        blocks = None
        if cached:
            document, blocks, staging = _parse_pdf_cached(path, rel, digest, settings, Path(parsed_root),
                                                         force=force, first=prev is None)
        else:
            changed_pdf = path.suffix.lower() == ".pdf" and (force or not prev or prev["sha256"] != digest)
            document = parse_file(path, settings, reuse_cache=not changed_pdf)
        after = sha256_file(path)
        if after != digest:
            if staging is not None:
                shutil.rmtree(staging, ignore_errors=True)  # U10: a parse of bytes that are gone
            raise ValueError("源文件在解析期间发生变化")
        # KB-5/T1: reuse the manifest doc_id so a rename/reimport updates in place.
        result = knowledge.put(document, doc_id=(prev or {}).get("doc_id"),
                               source_file=(rel, stat.st_size, stat.st_mtime_ns, digest), blocks=blocks)
    except Exception as exc:  # noqa: BLE001 - retain other sources on parser failure
        _record_failure(knowledge, path, rel, prev, digest, after, exc)
        return exc
    return _promote_published(Path(parsed_root), rel, staging, result) if staging is not None else result


def _pdf_document(path: Path, markdown: str, pages: list[Page]) -> Document:
    return Document(title=path.stem, origin=str(path.resolve()), kind="pdf", parser="mineru",
                    pages=pages, markdown=markdown)


def _legacy_pages(path: Path, directory: Path) -> int | None:
    """Decision ① guard: a pre-P0 cache is adopted only when its middle JSON has as many pages as the
    PDF's full page tree (N2: a truncated cache). It cannot prove the cache belongs to this source."""
    expected, got = pdf_page_count(path), output_page_count(directory)
    if expected is None or got != expected:
        return None
    try:
        _, pages, _ = load_output(directory)
    except (OSError, ValueError):
        return None
    return got if any(page.text.strip() for page in pages) else None


def _parse_pdf_cached(path: Path, rel: str, digest: str, settings: Settings, parsed_root: Path, *,
                      force: bool, first: bool) -> tuple[Document, list, Path | None]:
    """P1: ``(document, blocks, staging to promote after publication or None)``."""
    staging = staging_dir(parsed_root, rel, digest)
    canonical = canonical_dir(parsed_root, rel)
    if force:
        drop_marker(staging)
    elif complete(staging, rel, digest):  # U9: a finished parse of these bytes, e.g. after a failed put
        markdown, pages, blocks = load_output(staging)
        return _pdf_document(path, markdown, pages), blocks, staging
    elif complete(canonical, rel, digest):  # the canonical cache already is this source's parse
        markdown, pages, blocks = load_output(canonical)
        return _pdf_document(path, markdown, pages), blocks, None
    elif first and canonical.is_dir() and not (canonical / CACHE_FILE).exists():
        if (count := _legacy_pages(path, canonical)) is not None:  # decision ① (U1)
            write_cache(canonical, rel=rel, source_sha=digest, version=None, profile=LEGACY, pages=count,
                        quality=parse_quality(output_page_texts(canonical) or [], count))
            markdown, pages, blocks = load_output(canonical)
            return _pdf_document(path, markdown, pages), blocks, None
    # Parsing writes only to staging (and a sibling for the retry); the canonical cache is never touched here.
    expected = pdf_page_count(path)
    markdown, pages, got, attempts, quality = _parse_with_retry(path, settings, staging, expected)
    blocks = read_mineru_blocks(staging)
    # The completion marker goes last: a staging directory with cache.json holds a whole parse.
    write_cache(staging, rel=rel, source_sha=digest, version=content_version_of(pages, markdown),
                profile=parser_profile(settings, attempts[-1]["command"]), pages=got,
                attempts=[{key: value for key, value in attempt.items() if key != "command"} for attempt in attempts],
                quality=quality)
    return _pdf_document(path, markdown, pages), blocks, staging


TIER = re.compile(r"(--tier\s+)(\S+)")
LOW_COVERAGE = 0.8  # below this share of pages with text, a retry is worth its cost
NO_RETRY = {"tool_missing", "timeout"}  # a slower tier would not help (timeout) or cannot run


def _tier(command: str) -> str:
    match = TIER.search(command)
    return match.group(2) if match else ""


def _parse_commands(settings: Settings) -> list[str]:
    """The MinerU command, then the same command at the fallback tier when that differs."""
    commands = [settings.mineru_cmd]
    fallback = settings.mineru_fallback_tier.strip()
    if fallback and fallback != "flash" and _tier(settings.mineru_cmd) and _tier(settings.mineru_cmd) != fallback:
        commands.append(TIER.sub(lambda match: match.group(1) + fallback, settings.mineru_cmd, count=1))
    return commands


def _one_attempt(path: Path, settings: Settings, command: str, out_dir: Path, expected: int | None):
    """``(record, (markdown, pages, got, quality) or None)``; usable output may still have low coverage."""
    record = {"tool": "mineru", "tier": _tier(command), "command": command}
    start = time.monotonic()
    try:
        markdown, pages = parse_pdf_pages(path, settings.model_copy(update={"mineru_cmd": command}), out_dir)
        texts = output_page_texts(out_dir)
        if texts is None:
            raise ParseError("incomplete_output", "解析结果缺少逐页数据，未入库")
        got = len(texts)
        if expected is not None and got != expected:
            raise ParseError("page_mismatch", f"解析页数与原件不符（{got}/{expected} 页），未入库")
        if not any(page.text.strip() for page in pages):
            raise ParseError("empty_output", "解析结果为空，未入库")
    except ParseError as exc:
        record.update(ok=False, reason=exc.reason, message=str(exc)[:200],
                      seconds=round(time.monotonic() - start, 1))
        return record, None
    quality = parse_quality(texts, expected)
    record.update(ok=True, reason="low_coverage" if quality["coverage"] < LOW_COVERAGE else "",
                  coverage=quality["coverage"], seconds=round(time.monotonic() - start, 1))
    return record, (markdown, pages, got, quality)


def _parse_with_retry(path: Path, settings: Settings, staging: Path, expected: int | None):
    """Parse into ``staging``; when the first tier fails or covers too few pages, retry at the fallback
    tier into a sibling directory and keep the better result. Raises ``ParseError`` naming every attempt.

    A PDF whose page count no reader can tell is still parsed; its quality says ``page_count_checked:
    false`` instead of the parse being refused.
    """
    attempts: list[dict] = []
    best: tuple[Path, tuple] | None = None
    retry_dir = staging.with_name(staging.name + "-retry")
    for index, command in enumerate(_parse_commands(settings)):
        out_dir = staging if index == 0 else retry_dir
        record, result = _one_attempt(path, settings, command, out_dir, expected)
        attempts.append(record)
        if result is not None and (best is None or result[3]["coverage"] > best[1][3]["coverage"]):
            best = (out_dir, result)
        if record["ok"] and not record["reason"]:
            break
        if record.get("reason") in NO_RETRY:
            break
    try:
        if best is None:
            shutil.rmtree(staging, ignore_errors=True)  # no usable output: nothing to reuse
            summary = "；".join(f"{attempt['tier'] or 'mineru'}：{attempt['message']}" for attempt in attempts)
            reason = attempts[-1]["reason"]
            raise ParseError(reason, summary if len(attempts) > 1 else attempts[0]["message"])
        out_dir, (markdown, pages, got, quality) = best
        if out_dir != staging:
            shutil.rmtree(staging, ignore_errors=True)
            os.replace(out_dir, staging)
        return markdown, pages, got, attempts, quality
    finally:
        shutil.rmtree(retry_dir, ignore_errors=True)


def _record_failure(knowledge, path: Path, rel: str, prev: dict | None, digest: str, after: str,
                    exc: Exception) -> None:
    """P1/P2 failure. Decision ②: when the source equals the indexed one before and after the attempt,
    the document stays current and only the error is noted; otherwise the entry becomes ``error``."""
    # Our own ValueErrors are written for the reader; anything else names its type.
    reason = str(exc) if type(exc) in (ValueError, ParseError) else f"{type(exc).__name__}: {exc}"
    try:
        stat = path.stat()
        if prev and prev["status"] == "indexed" and digest and digest == prev["sha256"]:
            if (after or sha256_file(path)) == digest:
                knowledge.record_file(rel, stat.st_size, stat.st_mtime_ns, prev["sha256"], prev["doc_id"],
                                      "indexed", digest, reason)
                return
        knowledge.record_file(rel, stat.st_size, stat.st_mtime_ns, (prev or {}).get("sha256", ""),
                              (prev or {}).get("doc_id"), "error", digest, reason)
    except OSError:
        pass


def _promote_published(parsed_root: Path, rel: str, staging: Path, result):
    """P3: never touches the manifest; a failure leaves the staging parse for ``reconcile_cache``."""
    try:
        promote(parsed_root, rel, staging)
    except Exception as exc:  # noqa: BLE001 - the parse is already published
        logger.warning("parse cache promotion pending for %s: %s", rel, exc)
        return {**result, "promotion_pending": True} if isinstance(result, dict) else result
    return result


def reconcile_cache(knowledge, path: Path, rel: str, prev: dict, parsed_root: Path):
    """B3: before an indexed PDF is skipped, bring its cache in line with what SQLite publishes.

    Identities: ``S`` = manifest source sha, ``V`` = ``docs.version``. First match wins:
    1. complete staging at ``S`` with version ``V`` → published but not promoted: promote;
    2. complete staging at ``S`` with another version → parsed but not published (e.g. a forced
       reparse interrupted before put, or put failed): publish it, then promote;
    3. canonical ``cache.json`` at ``S`` and ``V`` (or an adopted legacy cache) → consistent;
    4. canonical directory without ``cache.json`` (pre-P0) → adopt as legacy if the page guard holds;
    5. otherwise a canonical directory that disagrees → ``cache_mismatch``: nothing reads it;
    6. no cache at all → ``cache_missing``. Neither 5 nor 6 reparses; the document stays current.
    MinerU never runs here.
    """
    source_sha = prev["sha256"]
    try:
        version = knowledge.get(prev["doc_id"])["version"] if prev["doc_id"] else None
    except KeyError:
        version = None
    staging = staging_dir(parsed_root, rel, source_sha)
    pending = complete(staging, rel, source_sha) if staging.is_dir() else None
    if pending is not None and pending["version"] == version:
        _promote_published(parsed_root, rel, staging, None)
        return "skipped"
    if pending is not None:
        return _republish(knowledge, path, rel, prev, staging, parsed_root)
    canonical = canonical_dir(parsed_root, rel)
    if publishes(read_cache(canonical), source_sha, version):
        return "skipped"
    if canonical.is_dir() and not (canonical / CACHE_FILE).exists():
        if (count := _legacy_pages(path, canonical)) is not None:
            write_cache(canonical, rel=rel, source_sha=source_sha, version=None, profile=LEGACY, pages=count,
                        quality=parse_quality(output_page_texts(canonical) or [], count))
            return "skipped"
    logger.info("parse cache %s for %s", cache_state(parsed_root, rel, source_sha, version), rel)
    return "skipped"


def _republish(knowledge, path: Path, rel: str, prev: dict, staging: Path, parsed_root: Path):
    """B3 #2: publish a complete staging parse of the indexed source (no MinerU), then promote it.
    The source identity is checked again: staging integrity does not prove the source is unchanged."""
    digest = after = ""
    try:
        stat = path.stat()
        digest = sha256_file(path)
        if digest != prev["sha256"]:
            raise ValueError("源文件在解析期间发生变化")
        markdown, pages, blocks = load_output(staging)
        document = _pdf_document(path, markdown, pages)
        after = sha256_file(path)
        if after != digest:
            raise ValueError("源文件在解析期间发生变化")
        result = knowledge.put(document, doc_id=prev["doc_id"],
                               source_file=(rel, stat.st_size, stat.st_mtime_ns, digest), blocks=blocks)
    except Exception as exc:  # noqa: BLE001 - same P2 boundary as import_one
        _record_failure(knowledge, path, rel, prev, digest, after, exc)
        return exc
    return _promote_published(parsed_root, rel, staging, result)


def collect_sources(root: Path, *, refused: list[Path] | None = None) -> list[Path]:
    """Recursively collect regular source files without following links or hiding scan errors.

    A ``:`` in any part of the path relative to ``root`` (file or folder name) could make the rel
    look like a virtual manifest rel (``manual:<id>``); such a file is left out and, when ``refused``
    is given, appended there for the caller to report. Only the relative parts are checked, so a
    Windows drive in ``root`` (``C:\\``) is never refused."""
    base = Path(root)
    if not base.is_dir():
        raise FileNotFoundError(f"资料目录不可读取：{base}")
    paths: list[Path] = []

    def fail(error: OSError) -> None:
        raise error

    for current, dirs, files in os.walk(base, topdown=True, followlinks=False, onerror=fail):
        parent = Path(current)
        dirs[:] = sorted(name for name in dirs if not (parent / name).is_symlink())
        for name in sorted(files):
            path = parent / name
            if not path.is_symlink() and path.suffix.lower() in SOURCE_SUFFIXES and path.is_file():
                if any(":" in part for part in path.relative_to(base).parts):
                    if refused is not None:
                        refused.append(path)
                    continue
                paths.append(path)
    return paths


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(chunk), b""):
            digest.update(block)
    return digest.hexdigest()
