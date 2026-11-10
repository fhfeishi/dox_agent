"""Scope analysis for a personal library (2026-11-06): one task's materials, read in one range.

A personal library collects references to system-library documents and its own uploads
(``personal_libraries.py``). The analysis page answers "what do I have for this task" from what is
already stored: each system document's archive record (``archive/<doc_id>.json``), each
document's project row (``project_index.py``) and its own upload library (``mine-<id>``).

Three rules keep this honest:

- Nothing here is inferred. A reference whose document, library or extraction is gone keeps its
  reference and is counted as a gap; the counts behind each number are returned with it.
- A system library's per-document records already exist, so references cost no model calls. This
  module never writes into a system library and never touches its index rows: aggregation runs in
  memory over one project row per document.
- "Too few to say anything" is shown as such. A mean over fewer than three projects, or a relation
  between fewer than two, is not computed and the reason is returned instead.

Only the owner sees a personal library; the caller passes the account it resolved.
"""

from collections import defaultdict
from decimal import Decimal

from .personal_libraries import MINE, PersonalLibraries, uploads_info
from .project_index import DIMENSIONS, ProjectIndex
from .prompts import list_tasks
from .targets import PROMPT_VERSION, SCHEMA_VERSION, _load, _record_state

MIN_PROJECTS_FOR_RELATION = 2


def _project_row(index: ProjectIndex, info, doc: dict, corpus_id: str, knowledge) -> dict:
    """The document's project row, read the same way ``ProjectIndex.refresh`` builds it.

    Reuse, not regeneration: ``ProjectIndex.document`` reads the stored archive record and the
    markdown header, and writes nothing. The row keeps ``corpus_id`` so a document found in two
    libraries still says where it came from.
    """
    text = knowledge.read_markdown(doc["doc_id"], doc["version"]) if knowledge is not None else ""
    row = index.document(info, doc, text or "")
    row["corpus_id"] = corpus_id
    return row


def _target_state(info, doc_id: str, doc: dict) -> tuple[str, str]:
    """The stored four-dimension record's state for one current document.

    ``_load`` takes the document id, not the document row: the record file is
    ``archive/<doc_id>.json`` (legacy ``target/`` is read the same way) and the version it was made
    from is compared inside the record.
    """
    record, error = _load(info, doc_id)
    return _record_state(record, error, doc)


def _file_extracted(row: dict) -> bool:
    """True when the document's stored record is current and completed (any dimension extracted)."""
    return row.get("state") == "current" and any(facet["items"] for facet in row["facets"].values())


def _aggregate(rows: list[dict], corpus_ids: list[str], extraction_documents: int, unreadable: list[str]) -> dict:
    """Projects grouped by approval number across the scope, counting each project once.

    The grouping rule matches ``ProjectIndex.aggregate``: the same number in two libraries is one
    project, and a document without a number is its own pending record rather than merged into
    another. ``sources`` counts which library a project came from, so the page can say
    "来自 N 个库" without losing where each file lives.
    """
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        identity = (row["family"] + ":" + row["number"]) if row["number"] else "pending:" + row["file"]["doc_id"]
        groups[identity].append(row)
    projects = []
    for identity, sources in groups.items():
        starts = {s["start_year"] for s in sources if s["start_year"] is not None}
        ends = {s["end_year"] for s in sources if s["end_year"] is not None}
        funding = [m for s in sources for m in s["funding"]]
        # A project whose files state two different amounts for one scope has a conflict there;
        # that scope is not summed rather than picking one. Same rule as ProjectIndex.aggregate.
        conflicts = sorted({
            scope for scope in {m["scope"] for m in funding}
            if len({m["amount_yuan"] for m in funding if m["scope"] == scope and m["amount_yuan"] is not None}) > 1
        })
        facets = {}
        for key in DIMENSIONS:
            items = [item for s in sources for item in s["facets"][key]["items"]]
            facets[key] = {
                "items": items,
                "documents": sum(bool(s["facets"][key]["items"]) for s in sources),
                "missing": sum(not s["facets"][key]["items"] for s in sources),
            }
        projects.append(
            {
                "project_id": identity,
                "number": sources[0]["number"],
                "title": sources[0]["title"],
                "identity_status": "identified" if sources[0]["number"] else "pending",
                "identity_conflict": any(s["identity_conflict"] for s in sources),
                "start_year": next(iter(starts)) if len(starts) == 1 else None,
                "end_year": next(iter(ends)) if len(ends) == 1 else None,
                "year_conflict": len(starts) > 1 or len(ends) > 1,
                **{key: next((s[key] for s in sources if s.get(key)), "") for key in ("code", "admin", "unit")},
                "corpus_ids": sorted({s["corpus_id"] for s in sources}),
                # How many of the project's files carry a current four-dimension record; the page
                # shows it per project so "extracted" is never inferred from the file count.
                "extracted_files": sum(_file_extracted(s) for s in sources),
                "files": [
                    {
                        "corpus_id": s["corpus_id"],
                        "doc_id": s["file"]["doc_id"],
                        "version": s["file"]["version"],
                        "title": s["file"]["title"],
                        "origin": s["file"].get("origin", ""),
                        "state": s["state"],
                        "notice": s["notice"],
                        "completed": s["completed"],
                    }
                    for s in sources
                ],
                "facets": facets,
                "funding": funding,
                "funding_conflicts": conflicts,
            }
        )

    identified = [p for p in projects if p["identity_status"] == "identified"]
    years = sorted({p["start_year"] for p in identified if p["start_year"] is not None})
    by_year = defaultdict(int)
    for project in identified:
        if project["start_year"] is not None:
            by_year[str(project["start_year"])] += 1
    year_reason = ("范围内还没有识别出项目，年度分布不计算。" if not identified
                   else "范围内项目没有可用的立项年，年度分布不计算。" if not years else "")
    dimensions = {}
    for key in DIMENSIONS:
        tagged: dict[str, list[str]] = defaultdict(list)
        for project in identified:
            seen = set()
            for item in project["facets"][key]["items"]:
                if item["name"] not in seen:
                    seen.add(item["name"])
                    tagged[item["name"]].append(project["project_id"])
        dimensions[key] = {
            "evidence_projects": sum(bool(p["facets"][key]["items"]) for p in identified),
            "missing_projects": sum(not p["facets"][key]["items"] for p in identified),
            "items": [{"name": name, "project_ids": ids, "count": len(ids)}
                      for name, ids in sorted(tagged.items(), key=lambda pair: (-len(pair[1]), pair[0]))],
        }

    # Charts use 项目总金额 (总经费, else 批准资助; never 直接费用), 2026-11-09.
    amounts = []
    for project in identified:
        if project["start_year"] is None or "project_total" in project["funding_conflicts"]:
            continue
        values = {m["amount_yuan"] for m in project["funding"]
                  if m["scope"] == "project_total" and m["amount_yuan"] is not None}
        if len(values) == 1:
            amounts.append(Decimal(next(iter(values))))
    return {
        "projects": projects,
        "counts": {
            "projects": len(identified),
            "pending_identity": len(projects) - len(identified),
            "documents": extraction_documents,
            "corpora": len(corpus_ids),
            "cross_library_projects": sum(1 for p in projects if len(p["corpus_ids"]) > 1),
            "unreadable": len(set(unreadable)),
        },
        "years": {
            "labels": years,
            "by_year": {str(year): by_year[str(year)] for year in years},
            "reason": year_reason,
        },
        "funding": {
            "projects": len(amounts),
            "total_yuan": str(sum(amounts, Decimal(0)).to_integral_value()) if amounts else "0",
            "reason": "" if amounts else "范围内没有写总经费或批准资助金额的项目；直接费用不作总额替代。",
        },
        "dimensions": dimensions,
    }


def _relations(projects: list[dict]) -> dict:
    """Which projects share extracted topics; a count, not a similarity score.

    Similarity here is "both projects were credited with the same technology / scene / problem
    item". It is not duplicate funding, and with fewer than two identified projects it is not
    computed at all.
    """
    identified = [p for p in projects if p["identity_status"] == "identified"]
    if len(identified) < MIN_PROJECTS_FOR_RELATION:
        return {"nodes": [], "edges": [],
                "reason": f"范围内只有 {len(identified)} 个项目，项目关系需要至少 {MIN_PROJECTS_FOR_RELATION} 个。"}
    shared: dict[tuple[str, str], list[str]] = defaultdict(list)
    for key in DIMENSIONS:
        by_item: dict[str, list[str]] = defaultdict(list)
        for project in identified:
            for item in {i["name"] for i in project["facets"][key]["items"]}:
                by_item[item].append(project["project_id"])
        for name, ids in by_item.items():
            for i, left in enumerate(ids):
                for right in ids[i + 1:]:
                    shared[(left, right)].append(f"{key}·{name}")
    edges = [{"source": left, "target": right, "shared": items, "count": len(items)}
             for (left, right), items in shared.items()]
    edges.sort(key=lambda edge: (-edge["count"], edge["source"], edge["target"]))
    return {
        "nodes": [{"project_id": p["project_id"], "title": p["title"], "number": p["number"],
                   "year": p["start_year"]} for p in identified],
        "edges": edges,
        "reason": "" if edges else "范围内项目没有共享的技术、场景或问题条目。",
    }


def scope_sources(settings, owner: str, library: dict, find_corpus, uploads_info, knowledge_for) -> list[dict]:
    """The scope's sources: each system library or upload library, with the documents it contributes.

    A system reference is kept even when its library or document is gone, so the page can say
    "原资料已不在"; the analysis counts only what is still readable.
    """
    wanted: dict[str, set[str]] = defaultdict(set)
    for ref in library["refs"]:
        wanted[ref["corpus_id"]].add(ref["doc_id"])
    upload_id = uploads_info(settings, owner, library).id
    sources = []
    for corpus_id, doc_ids in wanted.items():
        # References to an upload of another personal library resolve through that library's
        # upload corpus, which find_corpus only returns to its owner.
        info = find_corpus(corpus_id)
        if info is None:
            sources.append({"corpus_id": corpus_id, "kind": "personal" if corpus_id.startswith(MINE) else "system",
                            "name": "", "state": "missing", "documents": sorted(doc_ids), "readable": []})
            continue
        knowledge = knowledge_for(info)
        current = {doc["doc_id"]: doc for doc in knowledge.current()}
        readable = [current[doc_id] for doc_id in sorted(doc_ids) if doc_id in current]
        sources.append({
            "corpus_id": corpus_id,
            "kind": "upload" if corpus_id == upload_id else "personal" if corpus_id.startswith(MINE) else "system",
            "name": info.name,
            "state": "partial" if len(readable) < len(doc_ids) else "ready",
            "documents": sorted(doc_ids),
            "readable": readable,
        })
    return sources


def analyze_library(app, owner: str, library_id: str) -> dict:
    """One personal library's task picture, built from stored records only.

    Nothing is generated: no model call, no write outside the caller's own upload index (which the
    normal project-index refresh may schedule, exactly as asking about an upload does today).
    """
    store: PersonalLibraries = app.state.personal_libraries
    settings = app.state.settings
    library = store.get(owner, library_id)
    find_corpus = app.state.corpus_ctx.find_corpus
    knowledge_for = app.state.corpus_ctx.knowledge_for
    sources = scope_sources(settings, owner, library, find_corpus, uploads_info, knowledge_for)
    index: ProjectIndex = app.state.project_index
    rows: list[dict] = []
    extraction = {"current": 0, "missing": 0, "stale": 0, "invalid": 0, "documents": 0}
    unreadable = []
    for source in sources:
        if source["state"] == "missing":
            continue  # its references stay listed with "library_missing"; nothing to read
        info = find_corpus(source["corpus_id"])
        knowledge = knowledge_for(info)
        for doc in source["readable"]:
            extraction["documents"] += 1
            state, _notice = _target_state(info, doc["doc_id"], doc)
            if state in extraction:
                extraction[state] += 1
            else:  # "unavailable" and any future state count as not extracted, never as current
                extraction["missing"] += 1
            try:
                rows.append(_project_row(index, info, doc, source["corpus_id"], knowledge))
            except Exception:  # noqa: BLE001 — one unreadable document must not hide the rest
                unreadable.append(doc["doc_id"])
    aggregated = _aggregate(rows, [source["corpus_id"] for source in sources], extraction["documents"], unreadable)
    relations = _relations(aggregated["projects"])
    task_id = library.get("task_id") or "task4"
    task_version = library.get("task_version", 0)
    builtin = next((task for task in list_tasks() if task["id"] == task_id), None)
    task_name = builtin["name"] if builtin else ""
    task_engine_id = task_id if builtin else ""
    if not task_name:
        try:
            definition = app.state.custom_tasks.version(task_id, task_version or None)
            task_name = definition.get("name") or ""
            task_engine_id = definition.get("engine_task_id") or ""
        except Exception:  # noqa: BLE001 — a deleted or unpublished task leaves the id visible
            task_name = ""
    return {
        "library_id": library_id,
        "name": library["name"],
        "revision": library["revision"],
        "task_id": task_id,
        "task_name": task_name,
        "task_engine_id": task_engine_id,
        "task_version": task_version,
        "report_template_id": library.get("report_template_id") or "",
        "report_template_version": library.get("report_template_version", 0),
        "sources": [
            {"corpus_id": source["corpus_id"], "kind": source["kind"], "name": source["name"],
             "state": source["state"], "documents": len(source["documents"]),
             "readable": len(source.get("readable") or [])}
            for source in sources
        ],
        "extraction": {**extraction, "schema_version": SCHEMA_VERSION, "prompt_version": PROMPT_VERSION,
                       "unreadable": sorted(set(unreadable))},
        **aggregated,
        "relations": relations,
        "upload_corpus": MINE + library_id,
        "notes": [
            "分析只读系统资料库已存的结构化记录，不改系统资料库、不计入系统统计与领域全景。",
            "个人上传的文件在本人工作区解析与提取；本页不调用模型。",
            "项目年度按立项年统计；项目年份不是成果发生年。",
        ],
    }
