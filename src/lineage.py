"""Technology lineage (query 2026-1009 ④ and 1111): a five-level tree with maturity per item.

Levels: library branch → technology system → direction → theme → each project's own technique
item. The model first drafts systems and directions from the item names, then places items in
batches and rates how far each project took that technique (1–5, 0 = not determinable), citing
the project's own text. Item names, projects and years are never generated: they come from the
four-dimension extraction and the project index, so every leaf and every timeline bar traces
back to a report.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from .agent.models import model_for
from .hierarchy import _json_object, _text
from .prompts import lineage_assign_instruction, lineage_instruction

logger = logging.getLogger(__name__)

LINEAGE_FILENAME = "lineage.json"
UNPLACED = "未归入体系的条目"
MATURITY = {0: "未判定", 1: "理论与方法研究", 2: "算法与模型验证", 3: "原型与样机验证",
            4: "系统集成与场景试验", 5: "示范应用与转化"}
BATCH = 25
PARALLEL = 10
MAX_CATEGORIES = 8
MAX_CHILDREN = 6
MAX_THEMES = 6

# In-process generation jobs: one per corpus, readable while running.
_jobs: dict[str, dict] = {}


def items(library: dict) -> list[dict]:
    """Every technique item once per project, with the project's years and achieved outcomes."""
    out: list[dict] = []
    for project in library.get("projects", []):
        outcomes = [f"{o['name']}：{o.get('desc', '')[:50]}" for o in project.get("facets", {}).get("成果", {}).get("items", [])
                    if o.get("status") == "已取得"][:4]
        seen: set[str] = set()
        for item in project.get("facets", {}).get("技术", {}).get("items", []):
            if item["name"] in seen:
                continue
            seen.add(item["name"])
            # Item ids derive from the item name, so the key adds the project: equal names in two
            # projects are two leaves, not one.
            out.append({"id": f"{project['project_id']}|{item['id']}", "item_id": item["id"],
                        "name": item["name"], "desc": item.get("desc", ""),
                        "project_id": project["project_id"], "start": project.get("start_year"),
                        "end": project.get("end_year"), "outcomes": outcomes})
    return out


def fingerprint(entries: list[dict]) -> str:
    body = json.dumps(sorted((e["id"], e["project_id"], e["name"]) for e in entries), ensure_ascii=False)
    return hashlib.sha256(body.encode()).hexdigest()


def _path(info) -> Path:
    return info.root / LINEAGE_FILENAME


def _load(info) -> dict | None:
    try:
        value = json.loads(_path(info).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None
    if not isinstance(value, dict) or value.get("corpus_id") != info.id or "items" not in value:
        return None  # files from the earlier route-only lineage are not this structure
    return value


def _save(info, record: dict) -> None:
    fd, temp_name = tempfile.mkstemp(prefix=".lineage-", suffix=".json", dir=info.root)
    temporary = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(record, handle, ensure_ascii=False, indent=1)
            handle.write("\n")
        os.replace(temporary, _path(info))
    finally:
        temporary.unlink(missing_ok=True)


def _axis(raw: dict, key: str, limit: int) -> list[dict]:
    """Application fields or workflow stages: short distinct names with an optional plain line."""
    out, seen = [], set()
    for entry in (raw.get(key) or [])[:limit]:
        name = _text(entry.get("name") if isinstance(entry, dict) else entry, 16)
        if name and name not in seen:
            seen.add(name)
            out.append({"name": name, "plain": _text(entry.get("plain"), 60) if isinstance(entry, dict) else ""})
    return out


def _scenes(info) -> list[str]:
    """Scene names of the corpus hierarchy, reused as the application fields so both views agree."""
    try:
        value = json.loads((info.root / "hierarchy.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return []
    return [scene["name"] for scene in value.get("scenes") or [] if isinstance(scene, dict) and scene.get("name")]


def _framework(raw: dict) -> tuple[str, list[dict]]:
    """Systems › directions › themes; duplicate or empty names are dropped."""
    categories, used = [], set()
    for category in (raw.get("categories") or [])[:MAX_CATEGORIES]:
        if not isinstance(category, dict):
            continue
        name = _text(category.get("name"), 20)
        children = []
        for child in (category.get("children") or [])[:MAX_CHILDREN]:
            if not isinstance(child, dict):
                continue
            direction = _text(child.get("name"), 24)
            themes = list(dict.fromkeys(t for t in (_text(v, 24) for v in (child.get("themes") or [])[:MAX_THEMES]) if t))
            if direction and direction not in used and themes:
                used.add(direction)
                children.append({"name": direction, "themes": themes, "plain": _text(child.get("plain"), 60),
                                 "foundation": child.get("foundation") is True})
        if name and children:
            categories.append({"name": name, "summary": _text(category.get("summary"), 120),
                               "plain": _text(category.get("plain"), 60), "children": children})
    if not categories:
        raise ValueError("模型没有给出可用的技术体系框架")
    return _text(raw.get("branch"), 24), categories


def _codes(categories: list[dict]) -> dict[str, tuple[int, int, str]]:
    """K1… → (system index, direction index, theme name); codes keep the model's choice exact."""
    codes, n = {}, 0
    for c, category in enumerate(categories):
        for d, child in enumerate(category["children"]):
            for theme in child["themes"]:
                n += 1
                codes[f"K{n}"] = (c, d, theme)
    return codes


def _batch_input(batch: list[dict], categories: list[dict], codes: dict[str, tuple[int, int, str]],
                 retry: bool = False, fields: list[dict] = (), stages: list[dict] = ()) -> str:
    hint = ("这些条目上一轮没有归入任何主题。除非是组织管理、研讨交流等非技术条目，请选最接近的主题，"
            "不要因为应用对象不同而填 K0。\n")
    lines = ([hint] if retry else []) + ["技术主题（编号 体系 › 方向 › 主题）："]
    for code, (c, d, theme) in codes.items():
        lines.append(f"{code} {categories[c]['name']} › {categories[c]['children'][d]['name']} › {theme}")
    if fields:
        lines.append("\n应用领域（编号 名称）：\n" + "\n".join(f"F{i} {f['name']}" for i, f in enumerate(fields, 1)))
    if stages:
        lines.append("\n业务环节（编号 名称）：\n" + "\n".join(f"S{i} {s['name']}" for i, s in enumerate(stages, 1)))
    lines.append("\n技术条目（编号｜名称｜说明｜项目起止年｜该项目已取得的成果）：")
    for index, entry in enumerate(batch, 1):
        years = f"{entry['start'] or '?'}–{entry['end'] or '?'}"
        outcomes = "；".join(entry["outcomes"]) or "无"
        lines.append(f"T{index}｜{entry['name']}｜{entry['desc'][:80]}｜{years}｜{outcomes}")
    return "\n".join(lines)


def _pick(value, names: list[dict], prefix: str) -> str:
    """Code like F2/S3 → its name; anything else (F0, unknown, missing) → empty."""
    text = str(value or "").strip()
    if text.startswith(prefix) and text[1:].isdigit() and 1 <= int(text[1:]) <= len(names):
        return names[int(text[1:]) - 1]["name"]
    return ""


def _assignments(raw: dict, batch: list[dict], codes: dict, fields: list[dict] = (),
                 stages: list[dict] = ()) -> dict[str, dict]:
    """Valid rows only; an unknown theme stays unplaced and a bad level stays undetermined."""
    result: dict[str, dict] = {}
    for row in raw.get("items") or []:
        if not isinstance(row, dict) or not str(row.get("ref", "")).startswith("T"):
            continue
        try:
            entry = batch[int(str(row["ref"])[1:]) - 1]
        except (ValueError, IndexError):
            continue
        maturity = row.get("maturity")
        result[entry["id"]] = {
            "theme": codes.get(str(row.get("theme", "")).strip()),
            "maturity": maturity if isinstance(maturity, int) and 0 <= maturity <= 5 else 0,
            "basis": _text(row.get("basis"), 60),
            "field": _pick(row.get("field"), fields, "F"),
            "stage": _pick(row.get("stage"), stages, "S"),
        }
    return result


def _tree(categories: list[dict], entries: list[dict], placed: dict[str, dict]) -> list[dict]:
    members: dict[tuple, list[str]] = {}
    for entry in entries:
        members.setdefault((placed.get(entry["id"]) or {}).get("theme") or UNPLACED, []).append(entry["id"])
    tree = []
    for c, category in enumerate(categories):
        children = []
        for d, child in enumerate(category["children"]):
            themes = [{"name": theme, "items": members[(c, d, theme)]} for theme in child["themes"] if members.get((c, d, theme))]
            if themes:
                children.append({"name": child["name"], "plain": child["plain"], "foundation": child["foundation"],
                                 "themes": sorted(themes, key=lambda t: -len(t["items"]))})
        if children:
            tree.append({"name": category["name"], "summary": category["summary"], "plain": category["plain"],
                         "children": children})
    if members.get(UNPLACED):
        # Kept last and marked, never hidden: its size shows where the scheme does not fit yet.
        tree.append({"name": UNPLACED, "summary": "两轮归类后仍未归入上述体系的条目，如实列出，可逐条查看。",
                     "plain": "", "unplaced": True,
                     "children": [{"name": UNPLACED, "plain": "", "foundation": False,
                                   "themes": [{"name": UNPLACED, "items": members[UNPLACED]}]}]})
    return tree


async def synthesize(info, library: dict, settings, *, llm=None) -> dict:
    """Framework call, then batched placement; a failure keeps the previous tree and says so."""
    entries = items(library)
    if not entries:
        raise ValueError("本库还没有技术维度的整理条目，请先完成四维整理")
    job = _jobs[info.id] = {"status": "进行中", "done": 0, "total": len(entries), "started_at": datetime.now(UTC).isoformat()}
    # Long structured replies: allow a slower single response instead of timing out and retrying.
    model = llm or model_for(settings, timeout=180)
    previous = await asyncio.to_thread(_load, info)
    scenes = await asyncio.to_thread(_scenes, info)
    try:
        given = ("应用领域已给定（与场景归纳一致），不要修改，`fields` 原样输出：" + "、".join(scenes) + "\n") if scenes else ""
        async with asyncio.timeout(settings.run_timeout):
            response = await model.ainvoke([
                SystemMessage(content=lineage_instruction()),
                HumanMessage(content=(f"资料库：{info.name}\n{given}技术条目 {len(entries)} 个；技术主题总数建议不超过 "
                                      f"{max(6, min(80, len(entries) // 5))} 个。\n技术条目名称：\n")
                             + "\n".join(sorted({e["name"] for e in entries}))),
            ])
        raw = _json_object(response.content)
        branch, categories = _framework(raw)
        # Application axis (query 2026-1009 1720): fields follow the scene hierarchy when it exists,
        # stages are the domain's classic workflow steps; both are fixed for the whole placement.
        fields = [{"name": name, "plain": ""} for name in scenes] if scenes else _axis(raw, "fields", 8)
        stages = _axis(raw, "stages", 6)
        codes = _codes(categories)
        placed: dict[str, dict] = {}
        batches = [entries[i:i + BATCH] for i in range(0, len(entries), BATCH)]
        failed = 0

        async def place(batch: list[dict], retry: bool = False) -> None:
            nonlocal failed
            for attempt in (1, 2):  # one retry: a slow or malformed reply should not drop the batch
                try:
                    async with asyncio.timeout(settings.run_timeout):
                        reply = await model.ainvoke([SystemMessage(content=lineage_assign_instruction()),
                                                     HumanMessage(content=_batch_input(batch, categories, codes, retry,
                                                                                       fields, stages))])
                    found = _assignments(_json_object(reply.content), batch, codes, fields, stages)
                    if retry:  # a second look may place an item, never un-place or re-rate one
                        found = {key: value for key, value in found.items() if value["theme"]}
                        for key, value in found.items():
                            first = placed.get(key, value)
                            placed[key] = {**value, "maturity": first["maturity"], "basis": first["basis"] or value["basis"],
                                           "field": first.get("field") or value["field"],
                                           "stage": first.get("stage") or value["stage"]}
                    else:
                        placed.update(found)
                    break
                except Exception as exc:  # noqa: BLE001 — timeout, bad JSON or provider error: only this batch is lost
                    logger.warning("lineage batch attempt %s failed for %s: %s", attempt, info.id, exc)
            else:
                failed += not retry
            job["done"] += 0 if retry else len(batch)

        for start in range(0, len(batches), PARALLEL):
            await asyncio.gather(*(place(batch) for batch in batches[start:start + PARALLEL]))
        # Second pass for items the first pass left out (query 2026-1009 1544: an "unclassified"
        # trunk reads as a loose scheme to reviewers); what still does not fit stays listed.
        left = [e for e in entries if not (placed.get(e["id"]) or {}).get("theme")]
        retries = [left[i:i + BATCH] for i in range(0, len(left), BATCH)]
        for start in range(0, len(retries), PARALLEL):
            await asyncio.gather(*(place(batch, retry=True) for batch in retries[start:start + PARALLEL]))
        if failed == len(batches):
            raise ValueError("全部归类批次均失败")
        record = {
            "corpus_id": info.id, "fingerprint": fingerprint(entries), "model": settings.model_name,
            "generated_at": datetime.now(UTC).isoformat(), "branch": branch or info.name,
            "categories": _tree(categories, entries, placed), "fields": fields, "stages": stages,
            "items": {e["id"]: {"name": e["name"], "desc": e["desc"], "project_id": e["project_id"], "item_id": e["item_id"],
                                **{k: v for k, v in placed.get(e["id"], {"maturity": 0, "basis": "", "field": "", "stage": ""}).items()
                                   if k in ("maturity", "basis", "field", "stage")}} for e in entries},
            "gaps": [f"{failed} 批条目归类失败，列入“{UNPLACED}”"] if failed else [],
        }
    except Exception as exc:  # noqa: BLE001 — background job: every failure must end the job visibly
        logger.warning("lineage generation failed for %s: %s", info.id, exc)
        error = ("技术谱系框架生成超时" if isinstance(exc, TimeoutError)
                 else str(exc) if isinstance(exc, ValueError) else f"模型调用失败（{type(exc).__name__}）")
        record = {**previous, "error": error} if previous else {
            "corpus_id": info.id, "branch": info.name, "categories": [], "items": {}, "gaps": [], "error": error}
    await asyncio.to_thread(_save, info, record)
    _jobs.pop(info.id, None)
    return record


def start(info, library: dict, settings) -> None:
    """Run generation in the background; at most one job per corpus."""
    if _jobs.get(info.id, {}).get("status") == "进行中":
        return
    if not items(library):
        raise ValueError("本库还没有技术维度的整理条目，请先完成四维整理")
    _jobs[info.id] = {"status": "进行中", "done": 0, "total": len(items(library))}
    asyncio.get_running_loop().create_task(synthesize(info, library, settings))


async def read(info, library: dict) -> dict:
    record = await asyncio.to_thread(_load, info)
    job = _jobs.get(info.id)
    base = {"corpus_id": info.id, "maturity_levels": MATURITY, **({"job": job} if job else {})}
    if not record:
        return {**base, "state": "missing", "branch": info.name, "categories": [], "items": {}, "gaps": []}
    # Stale when the technique items changed, or when the scene hierarchy was rebuilt with other
    # scene names than the fields this lineage was placed into (fields follow the scenes).
    scenes = await asyncio.to_thread(_scenes, info)
    reason = ("四维技术条目已变化" if record.get("fingerprint") != fingerprint(items(library))
              else "场景归纳已重新生成，应用领域需要随之更新"
              if record.get("fields") and scenes and [f["name"] for f in record["fields"]] != scenes else "")
    return {**record, **base, "state": "stale" if reason else "ready", **({"stale_reason": reason} if reason else {})}
