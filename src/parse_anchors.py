"""A2-a (2026-11-04): check the parse against anchors taken from the file name.

A parse can be complete and still wrong: the text of another document, a shifted page, a missing
title. The cheap, objective check is to look for facts the file name already states — the project
number, the year window, the title — in the page text. Everything here is local: regular
expressions and string comparison, no model call, no file written.

Anchors are *hints*, never a verdict: a missing anchor means "the reader should look at this page",
not "the parse is bad". ``matched`` and ``missing`` count the anchors, not the pages.
"""

from __future__ import annotations

import re
from pathlib import Path

# A fund project number: seven or eight digits, or the alphanumeric form (U21A20373, 81930055).
NUMBER = re.compile(r"(?<![0-9A-Za-z])([0-9]{7,8}|[A-Za-z][0-9]{2}[A-Za-z][0-9]{5})(?![0-9A-Za-z])")
# A year window in the file name: 2022_2025, 2022-2025, 2022–2025, 2020_2024.
YEARS = re.compile(r"(20[0-9]{2})\s*[_\-–—~至]\s*(20[0-9]{2})")
# The title part of a fund file name: after the last year/number token, without the extension.
TITLE = re.compile(r"(?:20[0-9]{2}[_\-–—~]*){1,2}.*?[_\-–—~]([^_\-–—~]{4,})\.(?:pdf|md|txt)$",
                   re.IGNORECASE)


def _normalize(text: str) -> str:
    """Compare Chinese text without the separators a PDF or an OCR pass may insert."""
    return re.sub(r"[\s\u3000·・,，.。、:：;；()（）\[\]【】《》<>\"'“”‘’\-—_/\\|]+", "", text)


def anchors_for(rel: str) -> list[dict]:
    """``[{anchor, kind}]`` from a source-relative path; the file name is what states them."""
    name = Path(rel).name
    found: list[dict] = []
    number = NUMBER.search(name)
    if number:
        found.append({"anchor": number.group(1), "kind": "project_number"})
    window = YEARS.search(name)
    if window:
        for year in window.groups():
            found.append({"anchor": year, "kind": "year"})
    title = TITLE.search(name)
    if title:
        # A long title is enough to be distinctive; keep the head so an OCR line break cannot hide it.
        fragment = _normalize(title.group(1))[:12]
        if len(fragment) >= 4:
            found.append({"anchor": fragment, "kind": "title"})
    return found


def check_anchors(rel: str, page_texts: list[str] | None) -> dict:
    """Locate each anchor of ``rel`` in the page text: ``{checked, matched, missing}``.

    ``checked`` has one entry per anchor and page (the first page the anchor appears on, ``None``
    when absent); ``missing`` lists the anchors nothing matched, so the reader knows what to check.
    ``page_texts=None`` means the parse has no per-page text at all: every anchor is missing, and
    ``page_count`` is 0 rather than an error.
    """
    anchors = anchors_for(rel)
    texts = page_texts or []
    checked: list[dict] = []
    missing: list[dict] = []
    for anchor in anchors:
        needle = _normalize(anchor["anchor"])
        page = next((index + 1 for index, text in enumerate(texts)
                     if needle and needle in _normalize(text)), None)
        checked.append({**anchor, "page": page, "found": page is not None})
        if page is None:
            missing.append(checked[-1])
    return {"checked": checked, "matched": len(checked) - len(missing), "missing": missing,
            "page_count": len(texts)}
