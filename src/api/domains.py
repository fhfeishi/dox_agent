"""研究领域全景 for 领域分析 (query 2026-1021 1629): every library as one research domain, in one read.

Three sections read it:
- the conclusions at the top: funding, technology items and mean maturity per domain.
- 02 技术谱系总览: each domain's technology systems; ``/tree`` adds directions, themes and projects.
- 03 缺口与机会: technologies the lineage review found uncovered, scene problems not yet solved, and
  scene × system combinations the domain uses elsewhere but not in that scene.

Everything is counted from stored records (project index, lineage, scene hierarchy, lineage blanks).
"""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict

from fastapi import APIRouter, HTTPException

from .. import lineage
from ..achievement_list import library_outputs
from ..agent.corpora import scan_corpora
from ..hierarchy import read as read_hierarchy
from .common import FUNDING_LABELS

SOLVED = "已解决"
PREFIX = "自然科学基金-"


def spread(levels) -> list[int]:
    """Six-level count; anything outside 0–5 counts as 0 (未判定), as src/lineage.py does."""
    counts = [0] * 6
    for level in levels:
        counts[level if isinstance(level, int) and 0 <= level <= 5 else 0] += 1
    return counts


def judged_mean(counts: list[int]) -> float | None:
    """Mean over judged items only: 未判定 is unknown, not level zero."""
    judged = sum(counts[1:])
    return round(sum(level * n for level, n in enumerate(counts) if level) / judged, 2) if judged else None


def share(part: float, whole: float) -> float:
    return part / whole if whole else 0.0


def amount(project: dict, scope: str) -> float | None:
    """The project's stated amount in 万元 for the scope, None when absent or conflicting."""
    if scope in (project.get("funding_conflicts") or []):
        return None
    for money in project.get("funding") or []:
        if money.get("scope") == scope and money.get("amount_yuan") is not None and money.get("currency") == "CNY":
            return float(money["amount_yuan"]) / 1e4
    return None


def system_owner(tree: dict) -> dict[str, str]:
    owner = {}
    for category in tree.get("categories") or []:
        if category.get("unplaced"):
            continue
        for child in category.get("children") or []:
            for theme in child.get("themes") or []:
                for key in theme.get("items") or []:
                    owner[key] = category.get("name") or ""
    return owner


def atlas_domain(info, library: dict, tree: dict, outputs: dict) -> dict:
    """Project-level facts for 01, so every selected window/layer can deduplicate project IDs."""
    kinds = {"期刊论文", "会议论文", "专利", "奖励", "专著"}
    records = outputs.get("projects") or {}
    projects = [{"id": p["project_id"], "title": p.get("title") or p["project_id"],
                 "year": p.get("start_year"), "amount": amount(p, "awarded"),
                 "outputs": sum(n for k, n in records[p["project_id"]].get("counts", {}).items() if k in kinds)
                 if p["project_id"] in records else None}
                for p in library["projects"] if p.get("identity_status") == "identified"]
    items = tree.get("items") or {}
    systems, covered = [], set()
    for i, category in enumerate(tree.get("categories") or []):
        if category.get("unplaced"):
            continue
        directions = []
        for j, child in enumerate(category.get("children") or []):
            keys = list(dict.fromkeys(k for t in child.get("themes") or [] for k in t.get("items") or [] if k in items))
            if keys:
                directions.append({"id": f"{info.id}/s{i}/d{j}", "name": child.get("name") or "未命名方向", "item_ids": keys})
        keys = list(dict.fromkeys(k for d in directions for k in d["item_ids"]))
        if keys:
            covered.update(keys)
            systems.append({"id": f"{info.id}/s{i}", "name": category.get("name") or "未命名体系",
                            "item_ids": keys, "directions": directions, "unplaced": False})
    unplaced = [k for k in items if k not in covered]
    if unplaced:
        systems.append({"id": f"{info.id}/unplaced", "name": "未归入体系", "item_ids": unplaced,
                        "directions": [], "unplaced": True})
    return {"id": info.id, "name": info.name.removeprefix(PREFIX), "projects": projects,
            "items": [{"id": k, "project_id": v.get("project_id"),
                       "maturity": v.get("maturity") if isinstance(v.get("maturity"), int) and 0 <= v["maturity"] <= 5 else 0}
                      for k, v in items.items()], "systems": systems}


def domain_payload(info, library: dict, tree: dict, scenes_record: dict, blanks: dict, scope: str) -> dict:
    projects = {p["project_id"]: p for p in library["projects"] if p.get("identity_status") == "identified"}
    items = tree.get("items") or {}
    owner = system_owner(tree)

    years: dict[int, dict] = defaultdict(lambda: {"projects": 0, "funding": 0.0, "funded": 0, "levels": [0] * 6})
    for project in projects.values():
        if project.get("start_year"):
            row = years[project["start_year"]]
            row["projects"] += 1
            if (value := amount(project, scope)) is not None:
                row["funding"] += value
                row["funded"] += 1
    for item in items.values():
        project = projects.get(item.get("project_id"))
        if project and project.get("start_year"):
            level = item.get("maturity")
            years[project["start_year"]]["levels"][level if isinstance(level, int) and 0 <= level <= 5 else 0] += 1
    by_year = [{"year": year, "projects": row["projects"], "funding": round(row["funding"], 1), "funded": row["funded"],
                "items": sum(row["levels"]), "maturity": judged_mean(row["levels"]), "levels": row["levels"]}
               for year, row in sorted(years.items())]

    counts = spread(item.get("maturity") for item in items.values())
    systems = []
    for category in tree.get("categories") or []:
        if category.get("unplaced"):
            continue
        keys = [key for key in items if owner.get(key) == category.get("name")]
        if not keys:
            continue
        directions = []
        for child in category.get("children") or []:
            child_keys = [key for theme in child.get("themes") or [] for key in theme.get("items") or [] if key in items]
            if child_keys:
                child_counts = spread(items[key].get("maturity") for key in child_keys)
                directions.append({"name": child.get("name") or "", "items": len(child_keys),
                                   "maturity": judged_mean(child_counts), "levels": child_counts})
        system_counts = spread(items[key].get("maturity") for key in keys)
        systems.append({"name": category.get("name") or "", "plain": category.get("plain") or "",
                        "items": len(keys), "projects": len({items[key].get("project_id") for key in keys}),
                        "maturity": judged_mean(system_counts), "levels": system_counts,
                        "directions": sorted(directions, key=lambda d: -d["items"])})
    systems.sort(key=lambda s: -s["items"])

    # Scene × system by project: scenes and lineage items do not share item ids (see the docstring).
    project_systems: dict[str, set[str]] = defaultdict(set)
    for key, item in items.items():
        if owner.get(key):
            project_systems[item.get("project_id")].add(owner[key])
    scenes, open_issues, solved = [], [], 0
    for scene in scenes_record.get("scenes") or []:
        used = set().union(*(project_systems.get(p, set()) for p in scene.get("project_ids") or [])) if scene.get("project_ids") else set()
        scenes.append({"name": scene.get("name") or "", "projects": len(scene.get("project_ids") or []),
                       "systems": sorted(used), "achievements": len(scene.get("achievements") or [])})
        for issue in scene.get("issues") or []:
            if issue.get("state") == SOLVED:
                solved += 1
            else:
                open_issues.append({"scene": scene.get("name") or "", "name": issue.get("name") or "",
                                    "state": issue.get("state") or "", "summary": issue.get("summary") or "",
                                    "projects": len(issue.get("project_ids") or [])})
    blank_nodes = [{"name": n.get("name") or "", "plain": n.get("plain") or "", "reason": n.get("reason") or ""}
                   for n in blanks.get("nodes") or [] if n.get("covered") == 0]
    combos = []
    if len(scenes) >= 3:
        for system in systems:
            holders = [s for s in scenes if system["name"] in s["systems"]]
            # A system the domain already uses in at least three scenes, missing from this one.
            if len(holders) >= 3:
                combos += [{"scene": s["name"], "system": system["name"], "used_in": len(holders), "scenes": len(scenes)}
                           for s in scenes if system["name"] not in s["systems"] and s["projects"]]
    combos.sort(key=lambda c: -c["used_in"])

    achievements = sum(len(p["facets"].get("成果", {}).get("items") or []) for p in projects.values())
    funded = [(amount(p, scope), p) for p in projects.values()]
    top = sorted(((value, p) for value, p in funded if value is not None), key=lambda pair: -pair[0])[:5]
    evidence = library["coverage"]["dimensions"]
    name = info.name.removeprefix(PREFIX)
    return {
        "id": info.id, "name": name, "projects": len(projects), "items": len(items), "levels": counts,
        "index": library.get("index"),
        "maturity": judged_mean(counts), "achievements": achievements,
        "achievements_per_project": round(share(achievements, len(projects)), 2),
        "funding": round(sum(value for value, _ in funded if value is not None), 1),
        "funded_projects": sum(1 for value, _ in funded if value is not None),
        "by_year": by_year, "systems": systems, "scenes": scenes,
        "dimension_evidence": {key: value["evidence_projects"] for key, value in evidence.items()},
        "open_issues": open_issues, "solved_issues": solved, "blanks": blank_nodes, "combos": combos[:40],
        # Without a lineage review there is no list of uncovered technologies: unknown, not zero.
        "blanks_checked": bool(blanks.get("nodes")),
        "top_funded": [{"title": p.get("title") or "", "number": p.get("number") or "", "unit": p.get("unit") or "",
                        "year": p.get("start_year"), "amount": round(value, 1)} for value, p in top],
    }


def lineage_tree(info, library: dict, tree: dict) -> dict:
    """One library as 技术体系 → 研究方向 → 主题 → 项目, for 02's radial road map (query 2026-1022 1606).

    Every level carries how many technology items it holds and their judged mean maturity; a theme
    lists the projects its items came from, each with the highest maturity it reached there, the
    items themselves (name, maturity, the model's stated basis) and the project's first document, so a
    project node can say what it contributed and open its source (query 2026-1022 1706). Items the
    lineage left unplaced stay in the tree as a separate 未归入体系 branch rather than disappearing.
    """
    projects = {p["project_id"]: p for p in library["projects"]}
    items = tree.get("items") or {}

    def node(name, keys, plain=""):
        levels = spread(items[k].get("maturity") for k in keys)
        return {"name": name, "plain": plain, "items": len(keys), "maturity": judged_mean(levels)}

    def document(pid):
        files = (projects.get(pid) or {}).get("files") or []
        return files[0].get("document") if files else None

    systems = []
    for category in tree.get("categories") or []:
        directions = []
        for child in category.get("children") or []:
            themes = []
            for theme in child.get("themes") or []:
                keys = [k for k in theme.get("items") or [] if k in items]
                if not keys:
                    continue
                best: dict[str, int] = {}
                held: dict[str, list[dict]] = {}
                for key in keys:
                    item = items[key]
                    pid, level = item.get("project_id"), item.get("maturity")
                    best[pid] = max(best.get(pid, 0), level if isinstance(level, int) else 0)
                    held.setdefault(pid, []).append({"name": item.get("name") or "", "maturity": level if isinstance(level, int) else 0,
                                                     "basis": item.get("basis") or ""})
                members = [{"id": pid, "title": (projects.get(pid) or {}).get("title") or pid,
                            "number": (projects.get(pid) or {}).get("number") or "",
                            "unit": (projects.get(pid) or {}).get("unit") or "",
                            "admin": (projects.get(pid) or {}).get("admin") or "",
                            "year": (projects.get(pid) or {}).get("start_year"), "maturity": level,
                            "items": sorted(held[pid], key=lambda i: -i["maturity"]), "document": document(pid)}
                           for pid, level in sorted(best.items(), key=lambda pair: -pair[1])]
                themes.append({**node(theme.get("name") or "", keys, theme.get("plain") or ""), "projects": members})
            if themes:
                keys = [k for t in child.get("themes") or [] for k in t.get("items") or [] if k in items]
                directions.append({**node(child.get("name") or "", keys, child.get("plain") or ""),
                                   "themes": sorted(themes, key=lambda t: -t["items"])})
        if directions:
            keys = [k for c in category.get("children") or [] for t in c.get("themes") or [] for k in t.get("items") or [] if k in items]
            unplaced = bool(category.get("unplaced"))
            systems.append({**node("未归入体系" if unplaced else category.get("name") or "", keys,
                                   "谱系生成时没有归入任何技术体系的条目" if unplaced else category.get("plain") or ""),
                            "unplaced": unplaced, "directions": sorted(directions, key=lambda d: -d["items"])})
    # Placed systems by size; the unplaced branch always last.
    systems.sort(key=lambda s: (s["unplaced"], -s["items"]))
    return {"id": info.id, "name": info.name.removeprefix(PREFIX), "items": len(items), "systems": systems}


def install(app, ctx):
    knowledge_for = ctx.knowledge_for
    router = APIRouter()

    def read_json(info, name):
        try:
            return json.loads((info.root / name).read_text(encoding="utf-8"))
        except (OSError, UnicodeError, ValueError):
            return {}

    @router.get("/api/domains/overview")
    async def domains_overview():
        """All libraries as research domains, for 领域分析 · 全景."""
        infos = [info for info in await asyncio.to_thread(scan_corpora, ctx.settings) if not info.missing and info.docs_count]
        sources = []
        for info in infos:
            library = await asyncio.to_thread(app.state.project_index.library, info, knowledge_for(info))
            tree = await lineage.read(info, library)
            scenes = await read_hierarchy(info, library)
            sources.append((info, library, tree, scenes, await asyncio.to_thread(read_json, info, "lineage_blanks.json")))
        # 01 and its page headline use the same approved-award measure; missing awards stay unknown.
        scope = "awarded"
        domains = [domain_payload(info, library, tree, scenes, blanks, scope)
                   for info, library, tree, scenes, blanks in sources]
        domains = [d for d in domains if d["projects"] and d["items"]]
        if not domains:
            raise HTTPException(409, "还没有可浏览的领域资料：请先导入资料并生成技术谱系。")
        domains.sort(key=lambda d: -d["items"])
        years = sorted({row["year"] for d in domains for row in d["by_year"]})
        return {
            "maturity_levels": lineage.MATURITY, "funding_label": FUNDING_LABELS[scope], "years": years,
            "totals": {"domains": len(domains), "projects": sum(d["projects"] for d in domains),
                       "items": sum(d["items"] for d in domains), "funding": round(sum(d["funding"] for d in domains), 1),
                       "funded_projects": sum(d["funded_projects"] for d in domains),
                       "high": sum(d["levels"][4] + d["levels"][5] for d in domains),
                       "open_issues": sum(len(d["open_issues"]) for d in domains),
                       "blanks": sum(len(d["blanks"]) for d in domains),
                       "combos": sum(len(d["combos"]) for d in domains)},
            "domains": domains,
        }

    @router.get("/api/domains/atlas")
    async def domains_atlas():
        """Read stored records only; project index and parsed outcome lists use their version caches."""
        domains = []
        for info in await asyncio.to_thread(scan_corpora, ctx.settings):
            if info.missing or not info.docs_count:
                continue
            knowledge = knowledge_for(info)
            library = await asyncio.to_thread(app.state.project_index.library, info, knowledge)
            tree = await lineage.read(info, library)
            if not tree.get("items"):
                continue
            outputs = await asyncio.to_thread(library_outputs, info.id, library, knowledge)
            domains.append(atlas_domain(info, library, tree, outputs))
        if not domains:
            raise HTTPException(409, "还没有可浏览的领域资料：请先导入资料并生成技术谱系。")
        return {"funding_label": FUNDING_LABELS["awarded"],
                "years": sorted({p["year"] for d in domains for p in d["projects"] if p["year"]}), "domains": domains}

    @router.get("/api/domains/{corpus_id}/tree")
    async def domain_tree(corpus_id: str):
        """One library's lineage down to projects, read when 02 opens that library."""
        info = await asyncio.to_thread(ctx.find_corpus, corpus_id)
        if info is None or info.missing:
            raise HTTPException(404, "资料库不存在")
        library = await asyncio.to_thread(app.state.project_index.library, info, knowledge_for(info))
        tree = await lineage.read(info, library)
        return await asyncio.to_thread(lineage_tree, info, library, tree)

    app.include_router(router)
