"""A library's structure: projects, overview, topics, lineage, outputs and hierarchy."""

import asyncio
import json
from typing import Literal

from fastapi import APIRouter, HTTPException

from .. import lineage, topic_summary
from ..achievement_list import library_outputs
from ..agent.corpora import scan_corpora
from ..auth import ADMIN_ONLY
from ..hierarchy import HierarchyInvalid
from ..hierarchy import read as read_hierarchy
from ..hierarchy import synthesize as synthesize_hierarchy
from ..reports import summarize_report_metadata
from .common import (
    FUNDING_LABELS,
    TopicMerge,
    TopicRef,
)


def lineage_metrics(tree: dict) -> dict:
    """Maturity spread, high-maturity samples and the systems that hold the items (首页 地形图, query
    2026-1021). Every number here counts stored items; nothing is inferred.

    Maturity is the model's own 0–5 rating per item (src/lineage.py MATURITY): 0 = not determinable,
    5 = demonstrated application. The mean includes 0, so a library that extracted many method names
    reads lower — the six-level spread next to it is what tells a long tail from a genuinely shallow one.
    """
    items = tree.get("items") or {}
    levels = [0] * 6
    for item in items.values():
        level = item.get("maturity")
        levels[level if isinstance(level, int) and 0 <= level <= 5 else 0] += 1
    total = sum(levels)
    high = sum(levels[4:])
    top = sorted((i for i in items.values() if (i.get("maturity") or 0) >= 4),
                 key=lambda i: (-(i.get("maturity") or 0), i.get("name") or ""))[:3]
    systems = []
    for category in tree.get("categories") or []:
        if category.get("unplaced"):
            continue
        members = [key for child in category.get("children") or [] for theme in child.get("themes") or []
                   for key in theme.get("items") or []]
        sample = max((items.get(key) or {} for key in members), key=lambda i: i.get("maturity") or 0, default={})
        systems.append({"name": category.get("name") or "", "plain": category.get("plain") or "",
                        "items": len(members), "sample": sample.get("name") or ""})
    systems.sort(key=lambda s: -s["items"])
    return {
        "maturity": levels,
        "avg_maturity": round(sum(level * count for level, count in enumerate(levels)) / total, 2) if total else 0.0,
        "high_maturity": high,
        "high_share": round(high / total * 100, 1) if total else 0.0,
        "top": [{"name": i.get("name") or "", "field": i.get("field") or "", "maturity": i.get("maturity") or 0,
                 "basis": i.get("basis") or ""} for i in top],
        "systems_detail": systems,
    }


MATURITY_NAMES = ("未判定", "理论与方法研究", "算法与模型验证", "原型与样机验证", "系统集成与场景试验", "示范应用与转化")
DOMAIN_TEMPLATE = "domain_analysis"  # 专项报告 · 领域分析: the tag 报告中心 shows next to the task


def domain_report(row: dict, today: str) -> tuple[str, str]:
    """领域分析 report from a library's 资料库预览 (query 2026-1023 1044): the same counted figures the
    preview shows — yearly projects, technology systems, maturity spread, items in real scenes — as a
    report with ```dox-chart blocks. Nothing is written by a model, so every line is a stored count."""
    name = row["name"].replace("自然科学基金-", "")
    lineage = row["lineage"]
    years = row.get("start_years") or []
    span = list(range(years[0], years[-1] + 1)) if years else []
    funding = row.get("funding") or {}
    chart = lambda spec: ["```dox-chart", json.dumps(spec, ensure_ascii=False), "```", ""]
    lines = [f"# 领域分析 · {name}", "",
             f"{name}资料库共 {row['projects']} 个项目、{row['files']} 份资料，技术谱系 {lineage.get('items', 0)} 条技术、"
             f"{lineage.get('systems', 0)} 个技术体系；成熟度 4 档以上 {lineage.get('high_maturity', 0)} 条，占 {lineage.get('high_share', 0)}%。", ""]
    if span:
        lines += ["## 年度立项", ""] + chart({"type": "bar", "title": "年度立项项目数", "labels": [str(y) for y in span],
                                            "values": [row.get("by_year", {}).get(str(y), 0) for y in span], "unit": " 个",
                                            "note": "按项目立项年份计；空柱表示该年没有立项记录"})
        if funding.get("projects"):
            lines += [f"已知{funding.get('label') or '经费'} {round(float(funding.get('total_yuan') or 0) / 10000):,} 万元"
                      f"（{funding['projects']} 个项目给出金额）。", ""]
    systems = lineage.get("systems_detail") or []
    if systems:
        lines += ["## 技术体系构成", ""] + chart({"type": "bar", "title": "各技术体系的技术条目数", "labels": [s["name"] for s in systems],
                                              "values": [s["items"] for s in systems], "unit": " 条"})
        lines += [f"- **{s['name']}**（{s['items']} 条）{('：' + s['plain']) if s.get('plain') else ''}" for s in systems] + [""]
    levels = lineage.get("maturity") or [0] * 6
    lines += ["## 成熟度分布", ""] + chart({"type": "bar", "title": "技术条目成熟度", "labels": [f"{i} {n}" for i, n in enumerate(MATURITY_NAMES)],
                                          "values": levels, "unit": " 条", "note": "0 未判定 → 5 示范转化，依据项目报告所述"})
    top = lineage.get("top") or []
    lines += ["## 进入场景试验或转化的条目", ""]
    lines += [f"- {t['name']}（{t['maturity']} 档{'，' + t['field'] if t.get('field') else ''}）{('：' + t['basis']) if t.get('basis') else ''}" for t in top] \
        or ["- 这个库还没有条目达到成熟度 4。"]
    lines += ["", "## 统计口径", "",
              f"- 数据取自 {today} 的技术谱系与项目索引，由系统统计，未经模型改写；成熟度为报告所述阶段，不是正式技术成熟度评定。", ""]
    return f"领域分析 · {name}（{today}）", "\n".join(lines)


def install(app, ctx):
    find_corpus = ctx.find_corpus
    knowledge_for = ctx.knowledge_for
    knowledge_for_request = ctx.knowledge_for_request
    settings = ctx.settings
    router = APIRouter()

    @router.get("/api/corpora/{corpus_id}/projects")
    async def library_projects(corpus_id: str):
        return (await project_library(corpus_id))[1]

    async def project_library(corpus_id):
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "资料库不存在")
        if info.missing:
            raise HTTPException(409, "资料库目录已缺失")
        return info, await asyncio.to_thread(app.state.project_index.library, info, knowledge_for(info))

    def per_year(library, value):
        """Sum value(project) over identified projects by start year, as {"2021": n}."""
        totals: dict[str, float] = {}
        for p in library["projects"]:
            if p.get("identity_status") == "identified" and p.get("start_year"):
                totals[str(p["start_year"])] = totals.get(str(p["start_year"]), 0) + value(p)
        return totals

    def library_overview(info, library):
        """One library's construction status: material, projects, four-dimension coverage, funding
        and when its scene hierarchy and technology lineage were generated (query 2026-1013 1637)."""
        def read(name):
            try:
                return json.loads((info.root / name).read_text(encoding="utf-8"))
            except (OSError, UnicodeError, ValueError):
                return {}
        hierarchy, lineage = read("hierarchy.json"), read("lineage.json")
        coverage = library["coverage"]
        identified = coverage["identified_projects"]
        return {
            "corpus_id": info.id, "name": info.name, "files": coverage["files"], "projects": identified,
            "dimensions": {key: value["fully_processed_projects"] for key, value in coverage["dimensions"].items()},
            # Projects whose material yielded something in that dimension (首页 地形图, query 2026-1021):
            # the map asks "is this dimension represented", not "was every file processed".
            "dimension_evidence": {key: value["evidence_projects"] for key, value in coverage["dimensions"].items()},
            "start_years": sorted({p["start_year"] for p in library["projects"] if p.get("start_year")}),
            # Per start year, for the leader's yearly charts (query 2026-1019 1458): identified projects.
            "by_year": per_year(library, lambda p: 1),
            # Known funding per measure (amounts stated without conflict, never a missing one as zero);
            # the endpoint keeps one measure for every library, see FUNDING_LABELS.
            "funding_scopes": {scope: {
                "total_yuan": coverage["funding"].get(scope, {}).get("total_yuan", "0"),
                "projects": coverage["funding"].get(scope, {}).get("eligible_projects", 0),
                "by_year": per_year(library, lambda p, scope=scope: next((float(m["amount_yuan"]) for m in p.get("funding") or []
                    if m.get("scope") == scope and m.get("amount_yuan") is not None and m.get("currency") == "CNY"
                    and scope not in (p.get("funding_conflicts") or [])), 0.0)),
            } for scope in FUNDING_LABELS},
            "hierarchy": {"generated_at": hierarchy.get("generated_at"), "scenes": len(hierarchy.get("scenes") or []),
                          "issues": sum(len(s.get("issues") or []) for s in hierarchy.get("scenes") or [])},
            "lineage": {"generated_at": lineage.get("generated_at"), "items": len(lineage.get("items") or {}),
                        "systems": sum(1 for c in lineage.get("categories") or [] if not c.get("unplaced"))},
        }

    @router.get("/api/overview/libraries")
    async def libraries_overview():
        items = [info for info in await asyncio.to_thread(scan_corpora, settings) if not info.missing and info.docs_count]
        result = []
        for info in items:
            library = await asyncio.to_thread(app.state.project_index.library, info, knowledge_for(info))
            row = await asyncio.to_thread(library_overview, info, library)
            # Maintenance state for the administrator view (query 2026-1013 1745).
            tree = await lineage.read(info, library)
            scenes = await read_hierarchy(info, library)
            row["lineage"].update(state=tree.get("state"), stale_reason=tree.get("stale_reason", ""),
                                  unplaced=sum(len(t["items"]) for c in tree.get("categories") or [] if c.get("unplaced")
                                               for d in c.get("children") or [] for t in d.get("themes") or []))
            # 首页地形图 (query 2026-1021): the maturity spread the axes need, and the systems the
            # preview drawer lists. Counted from the same lineage record, so no extra disk read.
            row["lineage"].update(lineage_metrics(tree))
            row["hierarchy"]["state"] = scenes.get("state")
            row["pending_identity"] = library["coverage"]["pending_identity_records"]
            # Where the projects concentrate, for the leader's table: projects per application field,
            # the same count as the domain radar and scene cards (节点审查 A1/D5).
            by_field: dict[str, set[str]] = {}
            for item in (tree.get("items") or {}).values():
                if item.get("field"):
                    by_field.setdefault(item["field"], set()).add(item.get("project_id"))
            row["fields"] = sorted(([name, len(ids)] for name, ids in by_field.items()), key=lambda f: -f[1])
            result.append(row)
        # One funding measure for all libraries, the one most projects state (query 2026-1015 1142), so
        # the leader's charts never add 批准资助金额 of one library to 直接费用 of another.
        scope = max(FUNDING_LABELS, key=lambda s: sum(r["funding_scopes"][s]["projects"] for r in result)) if result else "awarded"
        for row in result:
            chosen = row.pop("funding_scopes")[scope]
            row["funding"] = {"total_yuan": chosen["total_yuan"], "projects": chosen["projects"],
                              "scope": scope, "label": FUNDING_LABELS[scope]}
            row["funding_by_year"] = chosen["by_year"]
        return result

    @router.post("/api/domains/{corpus_id}/report", status_code=201)
    async def save_domain_report(corpus_id: str):
        """导出报告 from 资料库预览 (query 2026-1023 1044): saved to 报告中心 as the signed-in account's
        专项报告, tagged 领域分析."""
        from datetime import date
        from uuid import uuid4
        row = next((r for r in await libraries_overview() if r["corpus_id"] == corpus_id), None)
        if row is None:
            raise HTTPException(404, "资料库不存在或还没有资料")
        title, markdown = domain_report(row, date.today().isoformat())
        return await asyncio.to_thread(app.state.artifacts.create, uuid4().hex, type="report", title=title, markdown=markdown,
                                       corpus_ids=[corpus_id], task_id="task4", template_id=DOMAIN_TEMPLATE)

    @router.get("/api/corpora/{corpus_id}/topics")
    async def topic_merges(corpus_id: str):
        """G1: manual topic grouping log; original extracted names stay with each item."""
        return {"merges": await asyncio.to_thread(app.state.project_index.merges, corpus_id)}

    @router.post("/api/corpora/{corpus_id}/topics", dependencies=ADMIN_ONLY)
    async def merge_topics(corpus_id: str, payload: TopicMerge):
        _, library = await project_library(corpus_id)
        originals = {item["original_name"] for p in library["projects"] for item in p["facets"][payload.dimension]["items"]}
        try:
            await asyncio.to_thread(app.state.project_index.merge, corpus_id, payload.dimension,
                                    payload.names, payload.name, originals)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return {"merges": await asyncio.to_thread(app.state.project_index.merges, corpus_id)}

    @router.post("/api/corpora/{corpus_id}/topics/{merge_id}/undo", dependencies=ADMIN_ONLY)
    async def undo_topic_merge(corpus_id: str, merge_id: str):
        try:
            await asyncio.to_thread(app.state.project_index.undo, corpus_id, merge_id)
        except KeyError as exc:
            raise HTTPException(404, "整理记录不存在") from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        return {"merges": await asyncio.to_thread(app.state.project_index.merges, corpus_id)}

    @router.get("/api/corpora/{corpus_id}/relations")
    async def project_relations(corpus_id: str, dimension: Literal["场景", "问题", "技术"]):
        """Graded project relations by description similarity; 成果 is not a relation basis."""
        info, library = await project_library(corpus_id)
        if not settings.embedding_path.strip():
            raise HTTPException(409, "未配置本地向量模型，无法计算相似关联")
        try:
            return await asyncio.to_thread(app.state.similarity.relations, info.id, library, dimension)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.get("/api/corpora/{corpus_id}/lineage")
    async def read_lineage(corpus_id: str):
        """Five-level technology lineage with per-item maturity; includes a running job's progress."""
        info, library = await project_library(corpus_id)
        return await lineage.read(info, library)

    @router.post("/api/corpora/{corpus_id}/lineage", dependencies=ADMIN_ONLY, status_code=202)
    async def generate_lineage(corpus_id: str):
        """Starts (or joins) the background generation; poll GET for progress."""
        info, library = await project_library(corpus_id)
        if not settings.model_api_key:
            raise HTTPException(503, "模型未配置，无法生成技术谱系")
        try:
            lineage.start(info, library, settings)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        return await lineage.read(info, library)

    @router.get("/api/corpora/{corpus_id}/outputs")
    async def corpus_outputs(corpus_id: str):
        """Each project's own 成果列表 (papers, patents, awards…), parsed from the report text."""
        info, library = await project_library(corpus_id)
        return await asyncio.to_thread(library_outputs, info.id, library, knowledge_for(info))

    @router.get("/api/corpora/{corpus_id}/topic-summary")
    async def read_topic_summary(corpus_id: str, dimension: Literal["场景", "问题", "技术", "成果"], name: str):
        """G2: saved grounded summary of one topic and whether its member evidence changed."""
        info, library = await project_library(corpus_id)
        return await topic_summary.read(info, library, dimension, name)

    @router.post("/api/corpora/{corpus_id}/topic-summary")
    async def generate_topic_summary(corpus_id: str, payload: TopicRef):
        info, library = await project_library(corpus_id)
        try:
            return await topic_summary.summarize(info, library, settings, payload.dimension, payload.name)
        except topic_summary.NoEvidence as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.get("/api/corpora/{corpus_id}/hierarchy")
    async def corpus_hierarchy(corpus_id: str):
        """需求 §17: corpus-level scene → issue → tech route hierarchy and achievement aspects."""
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "资料库不存在")
        if info.missing:
            raise HTTPException(409, "资料库目录已缺失")
        library = await asyncio.to_thread(app.state.project_index.library, info, knowledge_for(info))
        return await read_hierarchy(info, library)

    @router.post("/api/corpora/{corpus_id}/hierarchy", dependencies=ADMIN_ONLY)
    async def generate_corpus_hierarchy(corpus_id: str, payload: dict | None = None):
        """One corpus-level synthesis call; the stored result is kept when the call fails."""
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "资料库不存在")
        if info.missing:
            raise HTTPException(409, "资料库目录已缺失")
        library = await asyncio.to_thread(app.state.project_index.library, info, knowledge_for(info))
        if not library["coverage"]["dimensions"]["场景"]["items"]:
            raise HTTPException(409, "本库尚无场景维度归纳，请先整理资料后再生成层级")
        try:
            await synthesize_hierarchy(info, library, settings,
                                       force=bool((payload or {}).get("force")))
        except HierarchyInvalid as exc:
            raise HTTPException(422, str(exc)) from exc
        return await read_hierarchy(info, library)

    @router.get("/api/corpora/{corpus_id}/report-metadata")
    async def report_metadata_coverage(corpus_id: str):
        """AC-12: per-corpus field coverage and content-free unmatched-document list."""
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        if info.missing:
            raise HTTPException(409, {"missing": True, "corpus_id": corpus_id,
                                      "message": "该知识库目录已缺失，请重新关联或解绑"})
        if info.sqlite is None:
            return {"corpus_id": corpus_id, "total": 0,
                    "period": {"hits": 0, "missing": 0}, "category": {"hits": 0, "missing": 0},
                    "unmatched": []}
        knowledge = await knowledge_for_request(corpus_id)
        return await asyncio.to_thread(summarize_report_metadata, knowledge, corpus_id)


    app.include_router(router)
