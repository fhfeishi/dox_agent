"""Technology lineage (query 2026-1009 ④): a two-level taxonomy over the hierarchy's tech routes.

The model only groups route titles that already exist in the saved hierarchy into categories;
anything it cannot place is listed as 未归类 instead of being forced or invented. Supporting
techniques are not generated: they are the other technique items that the same projects state in
their own reports, so every one of them can be traced back to an extracted item.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from .agent.models import model_for
from .hierarchy import _json_object, _text
from .prompts import lineage_instruction

LINEAGE_FILENAME = "lineage.json"
UNPLACED = "未归类"
MAX_CATEGORIES = 8
MAX_CHILDREN = 6
MAX_SUPPORTING = 6


def routes(hierarchy: dict) -> list[dict]:
    """Every tech route once, with the scene and issue it answers."""
    seen: dict[str, dict] = {}
    for scene in hierarchy.get("scenes", []):
        for issue in scene.get("issues", []):
            for route in issue.get("routes", []):
                entry = seen.setdefault(route["title"], {
                    "title": route["title"], "summary": route.get("summary", ""),
                    "project_ids": [], "item_ids": [], "issues": []})
                entry["issues"].append({"scene": scene["name"], "issue": issue["name"], "state": issue.get("state", "")})
                entry["project_ids"] = sorted({*entry["project_ids"], *route.get("project_ids", [])})
                entry["item_ids"] = sorted({*entry["item_ids"], *route.get("item_ids", [])})
    return list(seen.values())


def fingerprint(items: list[dict]) -> str:
    body = json.dumps(sorted((r["title"], r["summary"]) for r in items), ensure_ascii=False)
    return hashlib.sha256(body.encode()).hexdigest()


def _path(info) -> Path:
    return info.root / LINEAGE_FILENAME


def _load(info) -> dict | None:
    try:
        value = json.loads(_path(info).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) and value.get("corpus_id") == info.id else None


def _save(info, record: dict) -> None:
    fd, temp_name = tempfile.mkstemp(prefix=".lineage-", suffix=".json", dir=info.root)
    temporary = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(record, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary, _path(info))
    finally:
        temporary.unlink(missing_ok=True)


def _validate(raw: dict, titles: set[str]) -> tuple[str, list[dict], list[str]]:
    """Keep only exact route titles, each placed once; unknown names are dropped and reported."""
    placed: set[str] = set()
    gaps: list[str] = []
    categories = []
    for category in (raw.get("categories") or [])[:MAX_CATEGORIES]:
        if not isinstance(category, dict):
            continue
        name = _text(category.get("name"), 20)
        children = []
        for child in (category.get("children") or [])[:MAX_CHILDREN]:
            if not isinstance(child, dict):
                continue
            kept = []
            for title in child.get("routes") or []:
                if title not in titles:
                    gaps.append(f"“{title}”不在技术路线清单中，未采用")
                elif title in placed:
                    gaps.append(f"“{title}”被重复归类，只保留第一次")
                else:
                    placed.add(title)
                    kept.append(title)
            if kept and _text(child.get("name"), 24):
                children.append({"name": _text(child.get("name"), 24), "routes": kept})
        if name and children:
            categories.append({"name": name, "summary": _text(category.get("summary"), 120), "children": children})
    if not categories:
        raise ValueError("模型没有给出可用的技术谱系归类")
    rest = sorted(titles - placed)
    if rest:
        categories.append({"name": UNPLACED, "summary": "模型未能归入上述体系的路线，如实列出。",
                           "children": [{"name": UNPLACED, "routes": rest}]})
    return _text(raw.get("branch"), 24), categories, gaps


def supporting(library: dict, items: list[dict]) -> dict[str, list[dict]]:
    """Other technique items stated by the same projects, most shared first."""
    by_project = {p["project_id"]: p.get("facets", {}).get("技术", {}).get("items", []) for p in library.get("projects", [])}
    result: dict[str, list[dict]] = {}
    for route in items:
        own = set(route["item_ids"])
        counts: dict[str, set[str]] = {}
        for project_id in route["project_ids"]:
            for item in by_project.get(project_id, []):
                if item["id"] not in own and item["name"] != route["title"]:
                    counts.setdefault(item["name"], set()).add(project_id)
        ranked = sorted(counts.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:MAX_SUPPORTING]
        result[route["title"]] = [{"name": name, "project_ids": sorted(ids)} for name, ids in ranked]
    return result


def _input(items: list[dict], corpus_name: str) -> str:
    # Scene and issue names are left out so the model groups by method, not by application.
    lines = [f"资料库：{corpus_name}", "技术路线清单（标题｜概要）："]
    for route in items:
        lines.append(f"- {route['title']}｜{route['summary']}")
    return "\n".join(lines)


async def synthesize(info, hierarchy: dict, settings, *, force: bool = False, llm=None) -> dict:
    """One model call; a failed update keeps the previous tree and says so."""
    items = routes(hierarchy)
    if not items:
        raise ValueError("本库四维归纳中还没有技术路线，请先生成四维归纳")
    current = fingerprint(items)
    previous = await asyncio.to_thread(_load, info)
    if not force and previous and previous.get("fingerprint") == current and not previous.get("error"):
        return previous
    record = {"corpus_id": info.id, "fingerprint": current, "model": settings.model_name,
              "generated_at": datetime.now(UTC).isoformat()}
    try:
        async with asyncio.timeout(settings.run_timeout):
            response = await (llm or model_for(settings)).ainvoke([
                SystemMessage(content=lineage_instruction()),
                HumanMessage(content=_input(items, info.name)),
            ])
        branch, categories, gaps = _validate(_json_object(response.content), {r["title"] for r in items})
        record.update(branch=branch or info.name, categories=categories, gaps=gaps)
    except (TimeoutError, ValueError) as exc:
        error = "技术谱系归类超过本次运行时限" if isinstance(exc, TimeoutError) else str(exc)
        if previous and previous.get("categories"):
            record = {**previous, "error": error}
        else:
            record.update(branch=info.name, categories=[], gaps=[], error=error)
    await asyncio.to_thread(_save, info, record)
    return record


async def read(info, hierarchy: dict, library: dict) -> dict:
    """Saved tree with freshness, route details and data-derived supporting techniques."""
    items = routes(hierarchy)
    record = await asyncio.to_thread(_load, info)
    detail = {r["title"]: {k: r[k] for k in ("summary", "project_ids", "issues")} for r in items}
    base = {"corpus_id": info.id, "routes": detail, "supporting": supporting(library, items)}
    if not record:
        return {**base, "state": "missing", "branch": info.name, "categories": [], "gaps": []}
    state = "ready" if record.get("fingerprint") == fingerprint(items) else "stale"
    return {**record, **base, "state": state}
