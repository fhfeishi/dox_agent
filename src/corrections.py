"""A2/A5-c (2026-11-04): an overlay of human corrections on a MinerU parse.

A correction is *not* a parse product. The MinerU output (markdown, middle JSON, images) is never
rewritten: ``corrections.json`` sits next to ``cache.json`` and is applied when the text is read,
so the parse stays the record of what the tool produced and the correction stays the record of what
a person changed.

    {"source_sha256": "<sha of the source this was proofread against>",
     "pages": {"3": {"before": "...", "after": "...", "by": "admin", "at": "2026-11-04T...",
                     "blocks": {"p3-b4": {"before": "...", "after": "...", "bbox": [..],
                                          "by": "admin", "at": "..."}}}}}

A page entry may carry either a page-level correction (R4/R5) or per-block entries (R10, 2026-11-05),
or both: the block editor writes the block it edited, and the whole-page form still works.

One rule decides whether the overlay is used at all: the file names the source bytes it was written
against, and the caller passes the **current** sha256 of the source file — not the one a stale
``cache.json`` happens to remember (B1, 2026-11-04). When those differ (the file was replaced or
deleted while the marker stayed), every correction is void — the old text is not what the tool
produces any more, and guessing where it moved would be inventing facts. A void overlay is reported,
never silently repaired or deleted.

A correction is either a text substitution (``before`` → ``after``, matched exactly) or, when
``before`` is empty, the whole page's content (M4): a page MinerU left blank has no text to match.

Nothing here talks to a model or a network, and nothing here publishes: the caller reads
``docs.version`` from SQLite untouched (decision A, 2026-11-04 — a correction never re-runs
``Knowledge.put``).
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

CORRECTIONS_FILE = "corrections.json"


def _path(directory: Path) -> Path:
    return Path(directory) / CORRECTIONS_FILE


def read(directory: Path) -> dict | None:
    """The stored overlay as it is on disk, or None when it is missing or unreadable."""
    try:
        data = json.loads(_path(directory).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("pages"), dict):
        return None
    if not isinstance(data.get("source_sha256"), str):
        return None
    return data


def load(directory: Path, source_sha: str | None) -> dict:
    """``{active, invalidated, pages}`` for reading: the overlay only counts at its own source sha.

    ``active`` is True when the stored overlay names ``source_sha`` and has usable entries;
    ``invalidated`` is True when a file exists but belongs to other source bytes. Either way the
    returned ``pages`` is what may be applied: empty unless active. A missing, malformed or
    structurally wrong file reads as no corrections at all — never as an error, and it is never
    deleted here.
    """
    stored = read(directory)
    if stored is None:
        return {"active": False, "invalidated": False, "pages": {}}
    if not source_sha or stored["source_sha256"] != source_sha:
        return {"active": False, "invalidated": True, "pages": {}}
    pages = {}
    for page, entry in stored["pages"].items():
        if not str(page).isdigit() or not isinstance(entry, dict):
            continue
        usable = {}
        if isinstance(entry.get("before"), str) and isinstance(entry.get("after"), str) \
                and (entry["before"] or entry["after"]):
            usable.update({"before": entry["before"], "after": entry["after"],
                           "by": entry.get("by", ""), "at": entry.get("at", "")})
        blocks = {str(key): block for key, block in (entry.get("blocks") or {}).items()
                  if isinstance(block, dict) and isinstance(block.get("before"), str)
                  and isinstance(block.get("after"), str)}
        if blocks:
            usable["blocks"] = blocks
        if usable:
            pages[str(page)] = usable
    return {"active": bool(pages), "invalidated": False, "pages": pages}


def apply(text: str, page_corrections: dict | None) -> str:
    """The **page-level** correction applied to a page's text: ``before`` → ``after``, exactly.

    Block corrections are *not* applied here — they belong to a block, and replacing a page's text
    by matching block text would hit whichever block happens to hold the same words first (R11 #1).
    Use :func:`apply_blocks` when the parse has per-block data.

    ``before`` must occur in the text as written. A ``before`` that is not there changes nothing:
    the correction was written against other text, and a fuzzy or positional match would silently
    edit the wrong words.

    An empty ``before`` means "this whole page is replaced by ``after``" (M4, 2026-11-04): a page
    MinerU left blank cannot be proofread by matching text, so the reader supplies its content
    outright. The replacement is scoped to the page it is stored for — this function is called with
    one page's entries — so a blank ``before`` can never rewrite text on another page.
    """
    if not page_corrections:
        return text
    for entry in page_corrections.values():
        if not isinstance(entry, dict):
            continue
        before, after = entry.get("before"), entry.get("after")
        if isinstance(before, str) and isinstance(after, str) and (before or after):
            text = after if before == "" else text.replace(before, after, 1)
    return text


def block_correction(page_corrections: dict | None, block_id: str) -> dict | None:
    """The stored correction of one block, or None. Identity is the block id, never its text."""
    if not isinstance(page_corrections, dict):
        return None
    for entry in page_corrections.values():
        if not isinstance(entry, dict):
            continue
        block = (entry.get("blocks") or {}).get(str(block_id))
        if isinstance(block, dict) and isinstance(block.get("before"), str) \
                and isinstance(block.get("after"), str):
            return block
    return None


def apply_block(text: str, correction: dict | None) -> str:
    """One block's text with its own correction applied; nothing else is touched (R11 #1).

    The correction was saved against this block's id, so it replaces this block's text only — even
    when another block on the page holds identical words, and even when ``before`` is empty (a
    blank block filled in by hand). ``before`` must still match the block's text as written.
    """
    if not isinstance(correction, dict):
        return text
    before, after = correction.get("before"), correction.get("after")
    if not isinstance(before, str) or not isinstance(after, str):
        return text
    if before == "":
        return after
    return text.replace(before, after, 1) if before in text else text


def apply_blocks(blocks: list[dict], page_corrections: dict | None) -> list[dict]:
    """The page's blocks with their own corrections applied, in the given order.

    Each block keeps its ``id``, ``type`` and ``bbox``; only its ``text`` may change, and only from
    the correction stored for that id. This is what the reader and the block list both use, so the
    two views cannot disagree about which block was edited.
    """
    out = []
    for block in blocks:
        item = dict(block)
        correction = block_correction(page_corrections, str(item.get("id", "")))
        if correction is not None:
            item["text"] = apply_block(str(item.get("text", "")), correction)
            item["correction"] = correction
        out.append(item)
    return out


def save(directory: Path, source_sha: str, pages: dict, *, by: str = "",
         restamp: str | None = None, restamp_block: str | None = None) -> dict:
    """Write the overlay atomically; the caller decides *when* (R5 adds the PUT endpoint).

    ``pages`` maps a page key to ``{"before", "after", by?, at?, blocks?}``; ``blocks`` maps a block
    id to ``{"before", "after", bbox?, by?, at?}`` (R10). Only what is being saved takes the
    writer's account and the current time: every other page and block keeps the ``by``/``at`` it
    already records, so saving page 1 does not rewrite who proofread page 0 (M1, 2026-11-04).
    ``restamp`` names that page and ``restamp_block`` that block; without them, an entry that
    carries no time yet is stamped (the first save of an entry). The key is the same zero-based
    page index ``GET /api/corpora/{corpus_id}/parse/page/{page}`` uses, so the reader never has to
    convert. Writing is atomic (temporary file + ``os.replace``), so a reader never sees a
    half-written overlay.
    """
    if not source_sha:
        # B1: an overlay without the bytes it was written against can never be judged valid; refusing
        # here keeps a None out of the file.
        raise ValueError("校对缺少原件 sha，拒绝写入")
    stamp = datetime.now(UTC).isoformat()
    entries = {}
    for page, entry in pages.items():
        key = str(int(page))
        previous_at = str(entry.get("at") or "")
        fresh = restamp == key or (restamp is None and not previous_at)
        saved: dict = {}
        before_text = str(entry.get("before", ""))
        after_text = str(entry.get("after", ""))
        if before_text or after_text:
            saved.update({"before": before_text, "after": after_text,
                          "by": (by or str(entry.get("by", ""))) if fresh else str(entry.get("by", "")),
                          "at": stamp if fresh else previous_at})
        blocks = {}
        for block_id, block in (entry.get("blocks") or {}).items():
            block_at = str(block.get("at") or "")
            block_fresh = restamp_block == str(block_id) or (restamp_block is None and not block_at)
            record = {
                "before": str(block.get("before", "")), "after": str(block.get("after", "")),
                "by": (by or str(block.get("by", ""))) if block_fresh else str(block.get("by", "")),
                "at": stamp if block_fresh else block_at,
            }
            if isinstance(block.get("bbox"), list):
                record["bbox"] = block["bbox"]
            blocks[str(block_id)] = record
        if blocks:
            saved["blocks"] = blocks
        # A page entry with neither text nor blocks is meaningless; keep the file honest.
        if saved or blocks:
            entries[key] = saved
    data = {"source_sha256": source_sha, "pages": entries}
    directory = Path(directory)
    temporary = directory / f".{CORRECTIONS_FILE}.{uuid4().hex}.tmp"
    try:
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(temporary, _path(directory))
    finally:
        temporary.unlink(missing_ok=True)
    return data


def summary(directory: Path, source_sha: str | None) -> dict:
    """The read-only overview the workbench shows: ``{active, invalidated, pages: [int]}``."""
    loaded = load(directory, source_sha)
    return {"active": loaded["active"], "invalidated": loaded["invalidated"],
            "pages": sorted(int(page) for page in loaded["pages"])}
