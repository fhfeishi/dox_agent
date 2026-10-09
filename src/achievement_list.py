"""成果板块 (query 2026-1009 ④): parse each report's own “成果列表” section.

Outcomes extracted from abstracts are single sentences; the report's achievement list is the
authoritative record of papers, patents, awards and monographs. Parsing it is deterministic, so
the counts and titles shown are exactly what the report lists.
"""

from __future__ import annotations

import re

SECTION = re.compile(r"^##\s*成果列表[（(](\d+)[)）]\s*$", re.MULTILINE)
NEXT_SECTION = re.compile(r"^##\s", re.MULTILINE)
ITEM = re.compile(r"^\d+\.\s*\[(?P<type>[^\]]{1,12})\]\s*(?P<title>.+?)(?:\s+—\s+.*)?$", re.MULTILINE)


def parse(markdown: str) -> dict | None:
    """``None`` when the report has no achievement list (e.g. a PDF without that section)."""
    match = SECTION.search(markdown)
    if not match:
        return None
    body = markdown[match.end():]
    end = NEXT_SECTION.search(body)
    body = body[:end.start()] if end else body
    items = [{"type": m["type"].strip(), "title": m["title"].strip()} for m in ITEM.finditer(body)]
    counts: dict[str, int] = {}
    for item in items:
        counts[item["type"]] = counts.get(item["type"], 0) + 1
    return {"declared": int(match.group(1)), "counts": counts, "items": items}


_parsed: dict[tuple[str, str, str], dict | None] = {}


def _cached(corpus_id: str, doc_id: str, version: str, read) -> dict | None:
    # Keyed by file version only, so a changed report is parsed again and nothing else is retained.
    key = (corpus_id, doc_id, version)
    if key not in _parsed:
        _parsed[key] = parse(read(doc_id, version))
    return _parsed[key]


def library_outputs(corpus_id: str, library: dict, knowledge) -> dict:
    """Per project: the parsed list of its first file that has one, with the file it came from."""
    projects: dict[str, dict] = {}
    files = listed = 0
    for project in library.get("projects", []):
        for entry in project.get("files", []):
            document = entry["document"]
            files += 1
            parsed = _cached(corpus_id, document["doc_id"], document["version"], knowledge.read_markdown)
            if parsed is None:
                continue
            listed += 1
            projects.setdefault(project["project_id"], {**parsed, "doc_id": document["doc_id"],
                                                        "version": document["version"]})
    return {"corpus_id": corpus_id, "projects": projects, "coverage": {"files": files, "with_list": listed}}
