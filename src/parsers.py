"""Replaceable ingestion functions: local mineru (PDF), docx, Crawl4AI or Firecrawl."""

import asyncio
import hashlib
import json
import os
import shlex
import shutil
import signal
import subprocess
import unicodedata
from pathlib import Path, PureWindowsPath
from urllib.parse import urlsplit

import httpx

from .agent.config import Settings
from .agent.corpora import SOURCE_SUFFIXES
from .knowledge import Document, Page
from .retrieval import RawBlock


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
        raise ValueError("无法启动 mineru：" + str(exc)) from exc
    try:
        output, _ = process.communicate(timeout=settings.mineru_timeout)
    except subprocess.TimeoutExpired:
        _kill_process_group(process)
        raise ValueError(f"mineru 解析超时（>{int(settings.mineru_timeout)}s；可用 MINERU_TIMEOUT 调大）") from None
    if process.returncode != 0:
        tail = (output or b"")[-500:].decode("utf-8", "ignore")
        raise ValueError("mineru 解析失败：" + tail)
    markdown, pages = read_mineru_output(out_dir)
    if not pages:
        raise ValueError("mineru 输出为空，未入库")
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


def parse_file(path: Path, settings: Settings, *, parsed_dir: Path | None = None,
               reuse_cache: bool = True) -> Document:
    suffix = path.suffix.lower()
    markdown = ""
    if suffix in {".txt", ".md", ".markdown"}:
        markdown = path.read_text(encoding="utf-8-sig")
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
    for path in collect_sources(root):
        current[path.resolve().relative_to(base).as_posix()] = path

    added = updated = skipped = 0
    imported, errors = [], []
    for rel, path in current.items():
        prev = manifest.get(rel)
        digest = ""
        try:
            stat = path.stat()
            if not force and prev and prev["status"] == "indexed" and prev["size"] == stat.st_size and prev["mtime_ns"] == stat.st_mtime_ns:
                skipped += 1
                continue
            digest = sha256_file(path)
            if not force and prev and prev["status"] == "indexed" and prev["sha256"] == digest:
                knowledge.record_file(rel, stat.st_size, stat.st_mtime_ns, digest, prev["doc_id"], "indexed")
                skipped += 1
                continue
            changed_pdf = path.suffix.lower() == ".pdf" and (force or not prev or prev["sha256"] != digest)
            # A changed PDF must never publish its new source hash with the old MinerU cache.
            # Parse into a digest-specific directory so a failed attempt keeps the prior cache.
            parsed_dir = (parsed_root / rel / ".versions" / digest if changed_pdf and parsed_root
                          else parsed_root / rel if parsed_root else None)
            document = parse_file(path, settings, parsed_dir=parsed_dir, reuse_cache=not changed_pdf)
            if sha256_file(path) != digest:
                raise ValueError("源文件在解析期间发生变化")
            # KB-5/T1: reuse the manifest doc_id so a rename/reimport updates in place.
            blocks = None
            # PDF reports get block-accurate chunks (tables stay whole); other kinds rely on
            # the page-level fallback. Both forms publish with the body in one transaction.
            if parsed_root is not None and path.suffix.lower() == ".pdf":
                blocks = read_mineru_blocks(parsed_dir) or None
            result = knowledge.put(document, doc_id=(prev or {}).get("doc_id"),
                                   source_file=(rel, stat.st_size, stat.st_mtime_ns, digest), blocks=blocks)
            imported.append(result)
            updated += 1 if prev else 0
            added += 0 if prev else 1
        except Exception as exc:  # noqa: BLE001 - retain other sources on parser failure
            errors.append({"source": path.name, "error": type(exc).__name__})
            try:
                stat = path.stat()
                knowledge.record_file(rel, stat.st_size, stat.st_mtime_ns, (prev or {}).get("sha256", ""),
                                      (prev or {}).get("doc_id"), "error", digest,
                                      f"{type(exc).__name__}: {exc}")
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


def collect_sources(root: Path) -> list[Path]:
    """Recursively collect regular source files without following links or hiding scan errors."""
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
                paths.append(path)
    return paths


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(chunk), b""):
            digest.update(block)
    return digest.hexdigest()
