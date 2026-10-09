"""Template section → proposal block ranges, and the counting rules that read them.

A template names the checked object ("项目摘要"); the mapping decides which blocks of this
proposal version are that object. Auto-detection only proposes ranges; duplicates stay
ambiguous until a person chooses, and unread content keeps coverage partial.
"""
import calendar
import re
from datetime import date

from .parser import compact

ALGORITHM = "visible-codepoints-v1"
ALGORITHM_NOTE = "正文去空白后按 Unicode 码点计数（中文、标点、字母、数字各计 1），不含标题；表格单元格计入，图片内文字不计入并标为覆盖不足。"
PREFIX = r"^(第[一二三四五六七八九十百]+[章节部分篇]|[一二三四五六七八九十]+[、.．]|[（(][一二三四五六七八九十]+[）)]|\d+(\.\d+)*[、.．]?)"


def norm(text):
    text = re.sub(PREFIX, "", compact(text))
    return re.sub(r"[：:。.]+$", "", re.sub(r"[（(][^）)]{0,40}[）)]$", "", text))


def section_checks(rule):
    return [c for c in rule.get("checks", []) if c.get("enabled", True) and (c.get("execution") or {}).get("section", "").strip()]


def candidates(blocks, section):
    target = norm(section)
    found = []
    for index, block in enumerate(blocks):
        text = compact(block["text"])
        if not text:
            continue
        title = norm(text)
        inline = re.match(re.escape(target) + r"([（(][^）)]{0,40}[）)])?[：:].{20,}", re.sub(PREFIX, "", text))
        if title == target or (block["level"] and title.startswith(target)):
            level = block["level"] or 1
            ids = [block["id"]]
            for following in blocks[index + 1:]:
                if following["level"] and following["level"] <= level:
                    break
                ids.append(following["id"])
            found.append(ids)
        elif inline and not block["level"]:
            ids = [block["id"]]
            for following in blocks[index + 1:]:
                if following["level"] or re.match(r"^\S{2,12}[：:]", compact(following["text"])):
                    break
                ids.append(following["id"])
            found.append(ids)
    return found


def read_range(blocks, ids, section):
    """Return counted text and what of the range could not be read."""
    chosen = [b for b in blocks if b["id"] in set(ids)]  # Document order, overlap counted once.
    target = norm(section)
    parts, images, headings = [], 0, 0
    for block in chosen:
        if block.get("image"):
            images += 1
        if block["level"]:
            headings += 1
            continue
        text = compact(block["text"])
        if not parts:  # An inline label ("项目摘要：……") is a title, not counted text.
            text = re.sub(PREFIX + "?" + re.escape(target) + r"([（(][^）)]{0,40}[）)])?[：:]", "", text, count=1)
        parts.append(text)
    text = "".join(parts)
    pages = sorted({b["page"] for b in chosen})
    return {"text": text, "count": len(text), "pages": pages, "block_ids": [b["id"] for b in chosen],
            "unread_images": images, "headings": headings, "complete": images == 0 and bool(chosen)}


def preview(blocks, ids, section):
    value = read_range(blocks, ids, section)
    heading = next((b["text"] for b in blocks if b["id"] in set(ids)), "")
    return {"block_ids": value["block_ids"], "pages": value["pages"], "heading": heading[:80],
            "count": value["count"], "text": value["text"][:300], "complete": value["complete"],
            "unread_images": value["unread_images"]}


def auto_mapping(blocks, check):
    section = check["execution"]["section"]
    found = candidates(blocks, section)
    status = "found" if len(found) == 1 else ("ambiguous" if found else "not_found")
    return {"check_id": check["id"], "title": check["title"], "section": section, "status": status,
            "block_ids": found[0] if len(found) == 1 else [], "missing": False,
            "candidates": [preview(blocks, ids, section) for ids in found]}


def effective(blocks, rule, saved):
    """Saved choices apply only while the check still targets the same section."""
    saved = saved or {}
    rows = []
    for check in section_checks(rule):
        row = auto_mapping(blocks, check)
        choice = next((m for m in saved.get("mappings", []) if m["check_id"] == check["id"]), None)
        if choice and saved.get("targets", {}).get(check["id"]) == row["section"]:
            row.update(block_ids=choice["block_ids"], missing=choice["missing"], status="confirmed")
        row["selected"] = preview(blocks, row["block_ids"], row["section"]) if row["block_ids"] else None
        rows.append(row)
    return rows


DATE = (r"(20\d{2})\s*(?:年\s*(?:(\d{1,2})\s*月\s*(?:(\d{1,2})\s*日)?)?"
        r"|[.\-/／]\s*(\d{1,2})(?!\d)(?:\s*[.\-/／]\s*(\d{1,2})(?!\d))?)")


def span(year, month=None, day=None):
    """Partial dates keep their real precision as an interval, never an invented day."""
    year = int(year)
    if not month:
        return date(year, 1, 1), date(year, 12, 31), "年"
    month = int(month)
    if not 1 <= month <= 12:
        raise ValueError
    if not day:
        return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1]), "月"
    value = date(year, month, int(day))
    return value, value, "日"


def parse_date(text):
    match = re.fullmatch(r"(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?", (text or "").strip())
    try:
        return span(*match.groups()) if match else None
    except ValueError:
        return None


def dates_in(text):
    """Dates written with 年 or a separator; a bare number such as "2026个" is not a date."""
    out = []
    for match in re.finditer(DATE, text):
        year, m1, d1, m2, d2 = match.groups()
        try:
            out.append((*span(year, m1 or m2, d1 or d2), match.group(0).strip()))
        except ValueError:
            continue
    return out
