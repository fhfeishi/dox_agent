"""Parse workbench behind the 资料入库 page (2026-11-04).

Everything here reads except one write: ``PUT .../parse/corrections`` saves a page's human correction
into ``corrections.json`` next to ``cache.json``. That write touches no other file — no cache.json,
no manifest, no SQLite row, no MinerU product — so a correction never republishes a document
(decision A, 2026-11-04). The workbench exposes the real MinerU products already on disk
(markdown/middle_json/images), the P0 quality facts, the per-document stage view and the correction
overlay, so an operator can inspect a parse before deciding to publish. Legacy parsed directories
(no ``cache.json``) are supported: quality is recomputed from the products, and a correction takes
its source identity from the source file itself.
"""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import corrections as corrections_store
from ..agent.corpora import PARSED_DIRNAME
from ..auth import require_admin
from ..parse_anchors import check_anchors
from ..parse_cache import (
    output_page_count,
    output_page_texts,
    parse_quality,
    quality_grade,
    read_cache,
)
from ..parse_tables import block_markdown
from ..parsers import _block_images, _block_text, sha256_file
from ..personal_libraries import MINE
from ..personal_libraries import owner as personal_owner
from ..stages import stage_view

# MinerU names page assets page_<n>_<kind>_<n>[_<n>].jpg: image, chart, table, table_image,
# equation. The old pattern accepted only ``image``, so most figures and every table were a 422
# even though the file was on disk.
IMAGE_NAME = re.compile(r"^page_\d+_[a-z]+(?:_[a-z]+)*_\d+(?:_\d+)*\.(?:jpg|jpeg|png|webp)$",
                        re.IGNORECASE)
CAPTION_START = re.compile(r"^(图|表|Figure|Table)\s*\d", re.IGNORECASE)
# A table's structured content replaces its cropped picture (see ``build_parse_blocks``).
TABLE_TYPES = frozenset({"table", "table_body"})


class CorrectionRequest(BaseModel):
    """One page's correction: the text as the parse has it, and the text it should read as.

    An empty ``before`` replaces the whole page: a page MinerU left blank has no text to match, so
    the reader supplies its content outright (M4, 2026-11-04). It is still scoped to this page.
    """

    rel: str = Field(min_length=1, max_length=500)
    page: int = Field(ge=0)
    before: str = Field(default="", max_length=20000)
    after: str = Field(max_length=20000)
    # R10: a block-level save names the block it edited and its bbox, so the reader can place it.
    block_id: str | None = Field(default=None, max_length=64)
    bbox: list[float] | None = None
MEDIA = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def _overlap(left: list[float], right: list[float]) -> float:
    """Horizontal overlap of two normalized bboxes, 0–1."""
    return max(0.0, min(left[2], right[2]) - max(left[0], right[0]))


def _attach_captions(blocks: list[dict]) -> None:
    """Give a figure/table its nearby text caption, and mark that block as attached.

    MinerU 4 in this corpus does not emit ``image_caption``/``table_caption`` types; the caption is
    an ordinary ``text`` block such as "图 1 边缘端功能" or "表1. 计划执行情况". A caption belongs to
    the nearest visual block above or below it, must overlap horizontally, and must not be a long
    paragraph. It is rendered under the image/table instead of as a separate row, which is what the
    reader is looking for. No caption is invented: only a text block that starts with 图/表 is used.
    """
    visuals = {"image", "chart", "table", "figure", "image_body", "table_body"}
    for block in blocks:
        text = str(block.get("text") or "").strip()
        if not text or block.get("type") in visuals or block.get("attached_to"):
            continue
        if len(text) > 300 or not CAPTION_START.match(text) or not block.get("bbox"):
            continue
        cap = block["bbox"]
        candidates = []
        for visual in blocks:
            if visual.get("type") not in visuals or not visual.get("bbox"):
                continue
            box = visual["bbox"]
            if _overlap(cap, box) < 0.2:
                continue
            # vertical gap: caption below (usual) or above (tables often have it above)
            below = max(0.0, cap[1] - box[3])
            above = max(0.0, box[1] - cap[3])
            gap = min(below, above)
            if gap <= 0.06:
                candidates.append((gap, visual))
        if not candidates:
            continue
        _, visual = min(candidates, key=lambda item: item[0])
        visual["caption"] = ((visual.get("caption") + "\n") if visual.get("caption") else "") + text
        block["attached_to"] = visual["id"]


def _markdown_pages(directory: Path) -> list[str]:
    """Fallback page split for parses without a middle JSON: markdown is grouped by its page images."""
    path = directory / "markdown.md"
    if not path.is_file():
        return []
    pages: list[list[str]] = [[]]
    current = 0
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines(keepends=True):
        match = re.search(r"images/page_(\d+)_", line)
        if match:
            current = int(match.group(1))
            while len(pages) <= current:
                pages.append([])
        pages[current].append(line)
    return ["".join(chunk) for chunk in pages]


def build_parse_blocks(directory: Path, page: int) -> dict:
    """One page of a MinerU parse as the blocks a reader sees (R10, 2026-11-12 1036).

    Module level rather than a closure inside ``install`` so the block contract can be tested without
    a running app: a block keeps its stable id, its normalised bbox and its text, and a block with no
    text is reported with ``no_text=True`` rather than dropped — a blank block is exactly what a
    proofreader has to see (a figure, an empty cell, a failed OCR line).

    ``text`` is Markdown a reader can render (pipe tables, ``$…$``); ``raw_text`` keeps the parser's
    own string (an HTML table, ``<eq>``), which is what JSON view and a correction record show.
    """
    path = directory / "middle_json.json"
    if not path.is_file():
        raise HTTPException(404, "这份解析没有逐块数据（缺 middle_json.json）")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(422, "逐块数据无法读取") from exc
    pages = data.get("pages") if isinstance(data, dict) else None
    if not isinstance(pages, list) or not pages:
        raise HTTPException(422, "逐块数据为空")
    if page < 0 or page >= len(pages):
        raise HTTPException(404, "页码超出解析范围")
    raw = pages[page].get("blocks") if isinstance(pages[page], dict) else None
    blocks = []
    for index, block in enumerate(raw or []):
        if not isinstance(block, dict):
            continue
        bbox = block.get("bbox")
        bbox = [float(value) for value in bbox] if isinstance(bbox, list) and len(bbox) == 4 else None
        text = _block_text(block)
        # 2026-11-12 1036: MinerU keeps a table as an HTML string and a formula as <eq>. A reader
        # without HTML support printed that markup under the table and overlapped the next block,
        # so the block's ``text`` is Markdown: pipe tables, $…$ formulas, no stray tags. The raw
        # form stays available as ``raw_text`` for 数据 and for a correction's own record.
        kind = str(block.get("type") or "text")
        markdown = block_markdown(text)
        images = _block_images(block)
        # MinerU's own rule (docvortex ``_render_table_body``): a table with structured content is
        # rendered as that content and its cropped picture is **not** shown — showing both is the
        # duplicate the reader saw. A chart or a figure is the opposite (``_render_chart_body``):
        # the picture is the block, so it stays and the recognised text sits with it.
        if kind in TABLE_TYPES and markdown:
            images = []
        blocks.append({"id": f"p{page}-b{index}", "type": kind,
                       "bbox": bbox, "text": markdown, "raw_text": text,
                       "no_text": not text, "images": images})
    # Reading order: rows top-down, then left-to-right; a block without a bbox keeps its own order.
    blocks.sort(key=lambda item: (item["bbox"][1] if item["bbox"] else 1e9,
                                  item["bbox"][0] if item["bbox"] else 1e9))
    _attach_captions(blocks)
    return {"page": page, "page_count": len(pages), "blocks": blocks}


def install(app, ctx):
    find_corpus = ctx.find_corpus
    knowledge_for = ctx.knowledge_for
    grades = getattr(ctx.settings, "parse_quality_grades", None) or {}
    router = APIRouter()

    async def info_for(corpus_id: str):
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "资料库不存在")
        if info.missing:
            raise HTTPException(409, "资料库目录已缺失")
        return info

    def directory_for(info, rel: str) -> Path:
        # rel is a source-relative path such as "2022_.../name.pdf"; never let it escape parsed/.
        if not rel or rel.startswith(".") or ".." in rel.split("/") or "\\" in rel:
            raise HTTPException(422, "资料路径非法")
        root = (info.root / PARSED_DIRNAME).resolve()
        directory = (root / rel).resolve()
        if not directory.is_relative_to(root):
            raise HTTPException(422, "资料路径非法")
        return directory

    def current_source_sha(info, rel: str) -> str | None:
        """sha256 of the source file as it is **now**; None when it is gone or escapes the library.

        B1 (2026-11-04): the identity a correction is judged against is the source's own bytes, not
        the marker's. ``cache.json`` records what was parsed once; when the file was replaced or
        deleted while that marker stayed, trusting the marker kept a stale parse and its overlay
        looking valid. A legacy parse has no marker at all, so the source file is the only identity
        either way.
        """
        source = (info.source_dir / rel).resolve()
        if not source.is_relative_to(info.source_dir.resolve()) or not source.is_file():
            return None
        return sha256_file(source)

    def pdf_page_count_or_none(path: Path) -> int | None:
        """Pages of the source PDF, or None when no reader can tell (a legacy parse's guard)."""
        try:
            import pypdfium2
            with pypdfium2.PdfDocument(str(path)) as pdf:
                return len(pdf)
        except Exception:  # noqa: BLE001 - a guard that cannot measure simply does not apply
            return None

    def parse_blocks(directory: Path, page: int) -> dict:
        """``{page, page_count, blocks}`` from the middle JSON, in reading order (R10).

        A block keeps its stable ``id`` (``p{page}-b{index}``), its normalised ``bbox`` and its text;
        a block with no text is reported with ``no_text=True`` rather than dropped, because a blank
        block is exactly what a proofreader has to see (a figure, an empty cell, a failed OCR line).
        """
        return build_parse_blocks(directory, page)

    def source_sha_for(info, rel: str, directory: Path) -> str | None:
        """The current source sha for reading, computed only when an overlay exists.

        A plain read of a library without corrections must not hash every source file, so the hash
        is computed only when ``corrections.json`` is there to be judged.
        """
        if not (directory / corrections_store.CORRECTIONS_FILE).is_file():
            return None
        return current_source_sha(info, rel)

    @router.get("/api/corpora/{corpus_id}/parse/archive")
    async def parse_archive(corpus_id: str, rel: str = Query(...)):
        """One parse's dossier: cache marker (if any), quality, attempts, pages and images."""
        info = await info_for(corpus_id)
        directory = directory_for(info, rel)

        def read() -> dict:
            if not directory.is_dir():
                return {"rel": rel, "exists": False, "anchors": check_anchors(rel, None),
                        "quality_grade": None,
                        "corrections": corrections_store.summary(directory, None)}
            cache = read_cache(directory)
            texts = output_page_texts(directory)
            markdown = directory / "markdown.md"
            images_dir = directory / "images"
            images = (sorted(path.name for path in images_dir.iterdir()
                             if path.is_file() and IMAGE_NAME.match(path.name))
                      if images_dir.is_dir() else [])
            quality = (cache or {}).get("quality")
            if quality is None and texts:
                # Legacy parse: derive the same objective facts from the real products on disk.
                quality = parse_quality(texts, output_page_count(directory))
            return {
                "rel": rel,
                "exists": True,
                "cache": cache,
                "legacy": cache is None,
                "profile": (cache or {}).get("profile") or "legacy-unmarked",
                "pages": (cache or {}).get("pages") or output_page_count(directory) or len(texts or []),
                "attempts": (cache or {}).get("attempts") or [],
                "quality": quality,
                # A2-b: a configured hint only; empty configuration leaves it null.
                "quality_grade": quality_grade(quality, grades),
                "markdown_chars": markdown.stat().st_size if markdown.is_file() else 0,
                "images": images,
                "page_lengths": [len(text) for text in texts] if texts else [],
                "anchors": check_anchors(rel, texts or _markdown_pages(directory)),
                # A2/A5-c: an overlay applied on read; the MinerU products stay untouched.
                "corrections": corrections_store.summary(directory, source_sha_for(info, rel, directory)),
                "has_middle_json": (directory / "middle_json.json").is_file(),
            }

        return await asyncio.to_thread(read)

    def blocks_with_corrections(info, rel: str, directory: Path, page: int) -> dict:
        """The page's blocks, each with its own correction applied by block id (R11 #1).

        Only this block's ``text`` changes; ``original_text`` keeps what MinerU produced, so the
        reader can always show the change and the block list keeps its identity. An empty block is
        returned with ``no_text=True`` rather than dropped, so the list matches the page one-to-one.
        """
        body = parse_blocks(directory, page)
        overlay = corrections_store.load(directory, source_sha_for(info, rel, directory))
        entry = overlay["pages"].get(str(page))
        blocks = corrections_store.apply_blocks(body["blocks"], {str(page): entry} if entry else None)
        for block in blocks:
            block["original_text"] = block["text"] if "correction" not in block else \
                block["correction"].get("before", "")
            block["no_text"] = not block["text"].strip()
        return {**body, "blocks": blocks, "corrections": entry}

    @router.get("/api/corpora/{corpus_id}/parse/blocks")
    async def parse_blocks_of(corpus_id: str, rel: str = Query(...), page: int = Query(0, ge=0)):
        """The parse's blocks of one page with their bboxes, for the side-by-side editor."""
        info = await info_for(corpus_id)
        directory = directory_for(info, rel)
        if not directory.is_dir():
            raise HTTPException(404, "该资料尚无解析产物")
        return await asyncio.to_thread(blocks_with_corrections, info, rel, directory, page)

    @router.get("/api/corpora/{corpus_id}/parse/page-image")
    async def parse_page_image(corpus_id: str, rel: str = Query(...), page: int = Query(0, ge=0),
                               scale: float = Query(1.5, ge=0.5, le=3)):
        """Render the original PDF page as PNG; no file is written and MinerU does not run (R10)."""
        info = await info_for(corpus_id)
        if not rel or rel.startswith(".") or ".." in rel.split("/") or "\\" in rel:
            raise HTTPException(422, "资料路径非法")
        source = (info.source_dir / rel).resolve()
        if not source.is_relative_to(info.source_dir.resolve()) or not source.is_file():
            raise HTTPException(404, "原件不存在")

        def render() -> bytes:
            import io
            from contextlib import closing

            import pypdfium2

            with closing(pypdfium2.PdfDocument(source)) as pdf:
                if page >= len(pdf):
                    raise HTTPException(404, "页码超出原件范围")
                with closing(pdf[page]) as rendered, closing(rendered.render(scale=scale)) as bitmap:
                    image = bitmap.to_pil().convert("RGB")
            buffer = io.BytesIO()
            image.save(buffer, format="PNG", optimize=True)
            return buffer.getvalue()

        try:
            data = await asyncio.to_thread(render)
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001 - a render failure is the reader's problem, not a 500
            raise HTTPException(422, f"原件无法渲染为页图（{type(exc).__name__}）") from exc
        return Response(content=data, media_type="image/png",
                        headers={"Cache-Control": "no-store"})

    @router.get("/api/corpora/{corpus_id}/parse/page/{page}")
    async def parse_page(corpus_id: str, page: int, rel: str = Query(...)):
        """One page's text and its original images, for side-by-side proofreading."""
        info = await info_for(corpus_id)
        directory = directory_for(info, rel)

        def read() -> dict:
            if not directory.is_dir():
                raise HTTPException(404, "该资料尚无解析产物")
            texts = output_page_texts(directory) or _markdown_pages(directory)
            if page < 0 or page >= len(texts):
                raise HTTPException(404, "页码超出解析范围")
            images_dir = directory / "images"
            images = (sorted(path.name for path in images_dir.glob(f"page_{page}_*")
                             if path.is_file() and IMAGE_NAME.match(path.name))
                      if images_dir.is_dir() else [])
            # A2/A5-c: ``text`` stays the parse's own words; the overlay is a second, separate field.
            # R11 #1: block corrections are applied per block id (not by matching text on the page),
            # so two blocks with identical words cannot be confused.
            overlay = corrections_store.load(directory, source_sha_for(info, rel, directory))
            entry = overlay["pages"].get(str(page))
            corrected = corrections_store.apply(texts[page], {str(page): entry} if entry else None)
            try:
                parsed = parse_blocks(directory, page)
            except HTTPException:
                parsed = None
            if parsed is not None:
                blocks = corrections_store.apply_blocks(parsed["blocks"], {str(page): entry} if entry else None)
                corrected = "\n".join(block["text"] for block in blocks if block["text"]) \
                    if any("correction" in block for block in blocks) else corrected
            return {"rel": rel, "page": page, "pages": len(texts), "text": texts[page],
                    "corrected_text": corrected, "corrections": entry, "images": images}

        return await asyncio.to_thread(read)

    @router.put("/api/corpora/{corpus_id}/parse/corrections")
    async def save_correction(corpus_id: str, payload: CorrectionRequest, request: Request):
        """Save one page's correction into ``corrections.json`` (decision A, 2026-11-04).

        The write lands next to ``cache.json`` and touches nothing else: no ``Knowledge.put``, no
        ``docs.version``, no ``cache.json`` rewrite, so the parse and what SQLite publishes stay as
        they were and the correction is an overlay applied on read.

        Source identity: the marker's ``source_sha256`` when the directory has one; otherwise (a
        legacy parse without ``cache.json``) the sha256 of ``<corpus>/source/<rel>`` is computed now.
        A correction is only valid for the bytes it was written against, so this must never be
        None — a source that is gone cannot be proofread (422).

        Identity is decided here, not left to ``find_corpus``: a system library takes the same
        administrator check every other system-library write uses, and ``mine-<id>`` is checked
        against ``personal_libraries.owner(request)`` — anyone else, the administrator included,
        gets 404 as if the library did not exist. ``find_corpus`` already filters ``mine-`` by the
        signed-in account, but a write endpoint must not rely on that alone.
        """
        if corpus_id.startswith(MINE):
            library_id = corpus_id[len(MINE):]
            store = request.app.state.personal_libraries
            actual = await asyncio.to_thread(store.owner_of, library_id)
            if not actual or actual != personal_owner(request):
                raise HTTPException(404, "资料库不存在")
        else:
            # ADMIN_ONLY is the route-level guard for the system libraries; this keeps the same rule
            # here because the route also serves mine-<id>, which an ordinary owner must reach.
            require_admin(request)
        info = await info_for(corpus_id)
        directory = directory_for(info, payload.rel)
        if not directory.is_dir():
            raise HTTPException(404, "该资料尚无解析产物")
        texts = await asyncio.to_thread(lambda: output_page_texts(directory) or _markdown_pages(directory))
        if payload.page >= len(texts):
            raise HTTPException(422, "页码超出解析范围")
        # B1: the identity is the source's bytes now. A parse whose marker names other bytes is a
        # parse of an older source — saving a correction against it would proofread the wrong text.
        source_sha = await asyncio.to_thread(current_source_sha, info, payload.rel)
        if not source_sha:
            raise HTTPException(422, "原件不存在或已移出资料库，无法确定校对对应的源文件")
        cache = await asyncio.to_thread(read_cache, directory)
        marked = (cache or {}).get("source_sha256")
        if marked and marked != source_sha:
            # B1 (write side): the parse was produced from other bytes, so a correction against it
            # would be saved onto a stale parse — and re-stamping it with the current sha would
            # silently revive an overlay the reader had just voided. Refuse instead.
            raise HTTPException(422, "这份解析对应的是旧原件，请重新解析后再校对")
        if not marked:
            # A legacy parse has no marker. Its identity is whatever the existing overlay recorded
            # when it was written: a differing sha means this parse belongs to older bytes, and
            # saving again would re-stamp it with the current sha and revive a voided overlay (B1).
            stored = await asyncio.to_thread(corrections_store.read, directory)
            recorded = (stored or {}).get("source_sha256")
            if recorded and recorded != source_sha:
                raise HTTPException(422, "这份解析对应的是旧原件，请重新解析后再校对")
            # Without any recorded identity, the page count is the only available guard.
            expected = await asyncio.to_thread(output_page_count, directory)
            actual = await asyncio.to_thread(pdf_page_count_or_none, info.source_dir / payload.rel)
            if expected is not None and actual is not None and expected != actual:
                raise HTTPException(422, "这份解析的页数与当前原件不符，请重新解析后再校对")
        # A page's original text is what ``before`` must match; an empty ``before`` replaces the
        # whole page instead (a blank page has no text to match).
        if not payload.block_id and payload.before and payload.before not in texts[payload.page]:
            raise HTTPException(422, "校对前的文字与当前解析正文不一致，请刷新后重试")
        existing = await asyncio.to_thread(corrections_store.load, directory, source_sha)
        pages = {str(page): {**{key: entry[key] for key in ("before", "after", "by", "at") if key in entry},
                             **({"blocks": entry["blocks"]} if "blocks" in entry else {})}
                 for page, entry in existing["pages"].items()}
        key = str(payload.page)
        entry = pages.setdefault(key, {})
        restamp_block: str | None = None
        if payload.block_id:
            # R10/R11 #1: a block-level save edits only this block; the page entry keeps its other
            # blocks and never gains page-level text, so a block edit cannot replace the page.
            block = await asyncio.to_thread(parse_blocks, directory, payload.page)
            known = {item["id"]: item for item in block["blocks"]}
            if payload.block_id not in known:
                raise HTTPException(422, "这一块不属于本页，请刷新后重试")
            original = known[payload.block_id]["text"]
            # R11 #10: ``before`` is this block's own text, compared exactly — not "somewhere on the
            # page". A substring check let a stale editor overwrite a block whose words merely
            # contained the phrase, and let two identical blocks be confused.
            previous = corrections_store.block_correction({key: entry}, payload.block_id)
            current = corrections_store.apply_block(original, previous)
            if payload.before != current:
                raise HTTPException(422, "这一块的正文已变化（当前：" +
                                    (current[:40] or "无文本") + "），请刷新后重试")
            # The editor sends the current visible text; the overlay always replaces the original
            # parse text, including an originally blank block. Never chain corrections together.
            record = {"before": original, "after": payload.after, "by": request.state.user[0], "at": ""}
            bbox = payload.bbox if payload.bbox is not None else known[payload.block_id]["bbox"]
            if bbox is not None:
                record["bbox"] = bbox
            entry.setdefault("blocks", {})[payload.block_id] = record
            entry.pop("before", None)  # a block save never writes page-level text
            entry.pop("after", None)
            restamp_block = payload.block_id
        else:
            entry.update({"before": payload.before, "after": payload.after,
                          "by": request.state.user[0], "at": ""})
        await asyncio.to_thread(corrections_store.save, directory, source_sha, pages,
                                by=request.state.user[0], restamp=None if payload.block_id else key,
                                restamp_block=restamp_block)
        return await asyncio.to_thread(corrections_store.summary, directory, source_sha)

    @router.get("/api/corpora/{corpus_id}/parse/image")
    async def parse_image(corpus_id: str, rel: str = Query(...), name: str = Query(...)):
        """Serve one page image from parsed/<rel>/images, with a strict name and path check."""
        info = await info_for(corpus_id)
        directory = directory_for(info, rel)
        if not IMAGE_NAME.match(name):
            raise HTTPException(422, "图片名非法")
        images_dir = (directory / "images").resolve()
        path = (images_dir / name).resolve()
        if not path.is_relative_to(images_dir) or not path.is_file():
            raise HTTPException(404, "图片不存在")
        return FileResponse(path, media_type=MEDIA.get(path.suffix.lower(), "application/octet-stream"))

    @router.get("/api/corpora/{corpus_id}/parse/stages")
    async def parse_stages(corpus_id: str):
        """P0-4 stage view, read-only. An empty corpus has no database to read."""
        info = await info_for(corpus_id)
        if info.sqlite is None:
            return {"corpus_id": info.id, "name": info.name, "documents": 0,
                    "counts": {}, "rows": []}
        return await asyncio.to_thread(stage_view, knowledge_for(info), info)

    app.include_router(router)
