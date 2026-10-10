"""Corpus-level four-dimension hierarchy: scenes → issues → tech routes, and achievement aspects.

Requirement: 需求文档-资料管理与分析审查 §17. One model call per library turns the project
index topics into a readable hierarchy. Every named entry must already exist as an extracted
four-dimension item, so the UI can always open the cited file version; anything the model
invents is dropped and reported as a gap instead of being shown as a conclusion (R-SCN-02/03).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from .agent.models import model_for
from .prompts import hierarchy_instruction
from .targets import DIMENSIONS, item_evidence

ASPECTS = ("论文", "专利", "人才/团队", "平台/基地", "数据与样本", "指标达成", "标准/许可", "转化与应用")
ASPECT_STAGES = ("已取得", "在研", "仅预期", "原文未提及")
ISSUE_STATES = ("已解决", "待解决")
TARGETS = {"scenes": 6, "issues_per_scene": 3, "routes_per_issue": 2, "achievements_per_scene": 3}
HIERARCHY_FILENAME = "hierarchy.json"


class HierarchyInvalid(ValueError):
    """The saved hierarchy cannot be matched to the current four-dimension topics."""


def _path(info) -> Path:
    return info.root / HIERARCHY_FILENAME


def _load(info) -> tuple[dict | None, str]:
    path = _path(info)
    if not path.is_file():
        return None, ""
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict) or value.get("corpus_id") != info.id:
            raise ValueError("结果身份不匹配")
        if not isinstance(value.get("scenes"), list) or not isinstance(value.get("coverage"), dict):
            raise ValueError("结果结构不完整")
        return value, ""
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        return None, f"层级结果文件损坏：{exc}"


def _save(info, record: dict) -> None:
    fd, temp_name = tempfile.mkstemp(prefix=".hierarchy-", suffix=".json", dir=info.root)
    temporary = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(record, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, _path(info))
    finally:
        temporary.unlink(missing_ok=True)


def topics(library: dict) -> dict[str, dict[str, dict]]:
    """Extracted topic names per dimension, keyed by the normalized name used for matching."""
    # Imported here: project_index imports targets, which imports reports, which imports this module.
    from .project_index import norm

    return {
        key: {norm(item["name"]): item for item in library["coverage"]["dimensions"][key]["items"]}
        for key in DIMENSIONS
    }


def fingerprint(library: dict) -> str:
    """Digest of the four-dimension topic supply; a change means the stored hierarchy is behind."""
    payload = [
        [key, sorted((name, item["count"]) for name, item in group.items())]
        for key, group in sorted(topics(library).items())
    ]
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def prompt_input(library: dict) -> str:
    header = (f"资料库已识别项目 {library['coverage']['identified_projects']} 个。"
              "下列条目名是本次可用的全部名称，逐字引用，不要新增或改写。")
    lines = [header]
    for key, group in topics(library).items():
        lines.append(f"\n## {key}主题清单")
        for item in sorted(group.values(), key=lambda value: (-value["count"], value["name"])):
            lines.append(f"- {item['name']}（覆盖去重项目 {item['count']} 个；条目ID：{'、'.join(item['item_ids'])}）")
    return "\n".join(lines)


def _text(value: object, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _json_object(content: object) -> dict:
    text = content if isinstance(content, str) else str(content)
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if match:
        text = match.group(1)
    try:
        value = json.loads(text.strip())
    except json.JSONDecodeError as exc:
        raise ValueError("模型未返回合法 JSON") from exc
    if not isinstance(value, dict):
        raise ValueError("模型返回的层级不是对象")
    return value


def _evidence(info, library: dict, item_ids: list[str]) -> list[dict]:
    """Current-version quotes for the cited items, so every entry can open its source file."""
    wanted = set(item_ids)
    proofs: dict[str, list[dict]] = {}
    if not wanted:
        return []
    per_doc: dict[tuple[str, str], set[str]] = {}
    for project in library["projects"]:
        for key in DIMENSIONS:
            for item in project["facets"][key]["items"]:
                if item["id"] in wanted:
                    per_doc.setdefault((item["doc_id"], item["version"]), set()).add(item["id"])
    for (doc_id, version), ids in per_doc.items():
        for item_id, quotes in item_evidence(info, doc_id, version, ids).items():
            proofs.setdefault(item_id, []).extend(
                {"item_id": item_id, "doc_id": doc_id, "version": version,
                 "quote": proof["quote"], "locator": proof["locator"]} for proof in quotes)
    evidence: list[dict] = []
    for item_id in item_ids:
        evidence.extend(proofs.get(item_id, []))
    return evidence


def _match(group: dict[str, dict], value: object) -> tuple[str, dict] | None:
    from .project_index import norm

    name = norm(value if isinstance(value, str) else "")
    return (name, group[name]) if name in group else None


def _category(group: dict[str, dict], entry: dict, used: set[str], drop, kind: str) -> tuple[str, dict] | None:
    """A named category over existing topics; projects and evidence are the union of its members.

    Extracted topics are close to one per project, so a library-level scene or issue must group
    them. The name may be new; every member must be an existing topic, used by one category only.
    """
    raw = entry.get("members") if isinstance(entry.get("members"), list) else [entry.get("name")]
    members = []
    for value in raw[:60 if kind == "场景" else 40]:
        found = _match(group, value)
        if found is None:
            drop(kind, f"清单外的{kind}成员：{_text(value, 60)}")
        elif found[0] in used:
            drop(kind, f"{found[0]} 已归入其他类别，未重复计入")
        else:
            used.add(found[0])
            members.append(found)
    if not members:
        return None
    name = _text(entry.get("name"), 24) or members[0][0]
    projects = list(dict.fromkeys(pid for _, topic in members for pid in topic["project_ids"]))
    items = list(dict.fromkeys(iid for _, topic in members for iid in topic["item_ids"]))
    return name, {"project_ids": projects, "item_ids": items, "count": len(projects),
                  "members": [member for member, _ in members]}


def _validate(raw: dict, library: dict, info) -> tuple[list[dict], dict]:
    """Keep only entries that name an existing topic; record every rejection as a gap."""
    available = topics(library)
    titles = {project["project_id"]: project["title"] for project in library["projects"]}
    gaps: list[dict] = []

    def drop(kind: str, detail: str) -> None:
        gaps.append({"kind": kind, "detail": detail[:200]})

    scenes: list[dict] = []
    used_scenes: set[str] = set()
    used_issues: set[str] = set()
    raw_scenes = raw.get("scenes")
    if not isinstance(raw_scenes, list) or not raw_scenes:
        raise ValueError("模型未返回场景列表")
    for entry in raw_scenes[:40]:
        if not isinstance(entry, dict):
            drop("scene", "场景条目结构非法")
            continue
        scene = _category(available["场景"], entry, used_scenes, drop, "场景")
        if scene is None:
            drop("scene", f"场景类别没有可回指的成员：{_text(entry.get('name'), 60)}")
            continue
        scene_name, scene_topic = scene
        issues = []
        for raw_issue in (entry.get("issues") if isinstance(entry.get("issues"), list) else [])[:6]:
            if not isinstance(raw_issue, dict):
                drop("issue", f"{scene_name} 的问题条目结构非法")
                continue
            issue = _category(available["问题"], raw_issue, used_issues, drop, "问题")
            state = raw_issue.get("state")
            if issue is None:
                drop("issue", f"{scene_name} 下的问题类别没有可回指的成员：{_text(raw_issue.get('name'), 60)}")
                continue
            if state not in ISSUE_STATES:
                drop("issue", f"{scene_name}/{issue[0]} 缺少已解决/待解决状态")
                continue
            issue_name, issue_topic = issue
            routes = []
            for raw_route in (raw_issue.get("routes") if isinstance(raw_issue.get("routes"), list) else [])[:4]:
                if not isinstance(raw_route, dict):
                    drop("route", f"{issue_name} 的技术路线结构非法")
                    continue
                route = _match(available["技术"], raw_route.get("title"))
                if route is None:
                    drop("route", f"{issue_name} 下清单外的技术名称：{_text(raw_route.get('title'), 60)}")
                    continue
                routes.append({"title": route[0], "summary": _text(raw_route.get("summary"), 300),
                               "project_ids": route[1]["project_ids"],
                               "item_ids": route[1]["item_ids"],
                               "evidence": _evidence(info, library, route[1]["item_ids"])})
            issues.append({
                "name": issue_name, "state": state, "summary": _text(raw_issue.get("summary"), 300),
                "members": issue_topic["members"],
                "project_ids": issue_topic["project_ids"], "item_ids": issue_topic["item_ids"],
                "evidence": _evidence(info, library, issue_topic["item_ids"]), "routes": routes,
            })
        if len(issues) > TARGETS["issues_per_scene"]:
            # Keep the required composition first (2 solved + 1 open), then fill from the rest.
            keep = [i for i in issues if i["state"] == "已解决"][:2] + [i for i in issues if i["state"] == "待解决"][:1]
            keep += [i for i in issues if i not in keep][:TARGETS["issues_per_scene"] - len(keep)]
            for extra in [i for i in issues if i not in keep]:
                drop("issue", f"{scene_name} 超出 3 个核心问题，未采用：{extra['name']}")
            issues = [i for i in issues if i in keep]
        solved = sum(1 for item in issues if item["state"] == "已解决")
        if issues and (len(issues) != TARGETS["issues_per_scene"] or solved != 2):
            drop("composition", f"{scene_name}：问题 {len(issues)} 个（已解决 {solved} 个），目标 3 个（2 已解决）")

        achievements = []
        for raw_item in (entry.get("achievements") if isinstance(entry.get("achievements"), list) else [])[:8]:
            if not isinstance(raw_item, dict):
                drop("achievement", f"{scene_name} 的成果条目结构非法")
                continue
            item = _match(available["成果"], raw_item.get("title"))
            if item is None:
                drop("achievement", f"{scene_name} 下清单外的成果名称：{_text(raw_item.get('title'), 60)}")
                continue
            title, topic = item
            # An aspect may only cite this achievement's own evidence.
            answered = {aspect["aspect"] for aspect in (raw_item.get("aspects") or []) if isinstance(aspect, dict)}
            stages: dict[str, dict] = {}
            for aspect in (raw_item.get("aspects") if isinstance(raw_item.get("aspects"), list) else []):
                if not isinstance(aspect, dict) or aspect.get("aspect") not in ASPECTS:
                    continue
                if aspect.get("stage") not in ASPECT_STAGES or aspect["stage"] == "原文未提及":
                    continue
                cited = [value for value in (aspect.get("item_ids") or []) if isinstance(value, str)]
                cited = [value for value in cited if value in topic["item_ids"]]
                if not cited:
                    continue
                stages[aspect["aspect"]] = {"stage": aspect["stage"], "note": _text(aspect.get("note"), 200),
                                            "item_ids": cited}
            aspects = []
            for aspect in ASPECTS:
                found = stages.get(aspect)
                aspects.append({
                    "aspect": aspect,
                    "stage": found["stage"] if found else "原文未提及",
                    "note": found["note"] if found else "",
                    "answered": aspect in answered,
                    "item_ids": found["item_ids"] if found else [],
                    "evidence": _evidence(info, library, found["item_ids"]) if found else [],
                })
            unanswered = [aspect["aspect"] for aspect in aspects if not aspect["answered"]]
            if unanswered:
                drop("aspect", f"{scene_name}/{title}：{len(unanswered)} 个方面未给出结论，按原文未提及显示")
            basis = raw_item.get("marker_basis") if isinstance(raw_item.get("marker_basis"), dict) else {}
            achievements.append({
                "title": title, "summary": _text(raw_item.get("summary"), 300),
                # Coverage count and representative project come from the index, never from the model.
                "marker_basis": {"projects": topic["count"],
                                 "representative": titles.get(topic["project_ids"][0], "")
                                 if topic["project_ids"] else "",
                                 "note": _text(basis.get("note"), 200)},
                "project_ids": topic["project_ids"], "item_ids": topic["item_ids"],
                "evidence": _evidence(info, library, topic["item_ids"]), "aspects": aspects,
            })
        if not achievements and available["成果"]:
            drop("achievement", f"{scene_name}：未给出标志性成果")
        elif achievements and not TARGETS["achievements_per_scene"] <= len(achievements) <= 5:
            drop("count", f"{scene_name}：标志性成果 {len(achievements)} 项，目标 3–5 项")
        scenes.append({
            "name": scene_name, "summary": _text(entry.get("summary"), 400), "members": scene_topic["members"],
            "project_ids": scene_topic["project_ids"], "item_ids": scene_topic["item_ids"],
            "evidence": _evidence(info, library, scene_topic["item_ids"]),
            "issues": issues, "achievements": achievements,
        })
    coverage = {
        "targets": TARGETS,
        "scenes": len(scenes),
        "issues": sum(len(scene["issues"]) for scene in scenes),
        "solved_issues": sum(1 for scene in scenes for issue in scene["issues"] if issue["state"] == "已解决"),
        "open_issues": sum(1 for scene in scenes for issue in scene["issues"] if issue["state"] == "待解决"),
        "routes": sum(len(issue["routes"]) for scene in scenes for issue in scene["issues"]),
        "achievements": sum(len(scene["achievements"]) for scene in scenes),
        "available_topics": {key: len(group) for key, group in available.items()},
        "gaps": gaps,
    }
    return scenes, coverage


async def synthesize(info, library: dict, settings, *, force: bool = False, llm=None) -> dict:
    """Run one corpus-level synthesis; a failure keeps the previous version (R-SCN-06)."""
    current = fingerprint(library)
    previous, error = await asyncio.to_thread(_load, info)
    if not force and not error and previous and previous.get("fingerprint") == current \
            and previous.get("process", {}).get("status") == "已完成":
        return previous

    # One long structured reply for the whole library: allow a slow response rather than fail at 60 s.
    model = llm or model_for(settings, timeout=180)
    deadline = asyncio.get_running_loop().time() + settings.run_timeout
    failure = ""
    try:
        async with asyncio.timeout_at(deadline):
            messages = [SystemMessage(content=hierarchy_instruction()), HumanMessage(content=prompt_input(library))]
            response = await model.ainvoke(messages)
            scenes, coverage = await asyncio.to_thread(
                _validate, _json_object(response.content), library, info)
            if scenes and not any(scene["achievements"] for scene in scenes) and topics(library)["成果"]:
                # A reply that drops the whole outcome layer gets one corrective retry.
                retry = await model.ainvoke(messages + [HumanMessage(content=(
                    "上次输出缺少全部 achievements。请按同样要求重新输出完整 JSON，"
                    "每个场景给出 3–5 项标志性成果，标题逐字取自成果主题清单。"))])
                try:
                    again = await asyncio.to_thread(_validate, _json_object(retry.content), library, info)
                except ValueError:
                    again = ([], {})  # Keep the first, otherwise valid, reply.
                if any(scene["achievements"] for scene in again[0]):
                    scenes, coverage = again
    except TimeoutError:
        failure = "层级综合超过本次运行时限"
        scenes, coverage = [], {}
    except ValueError as exc:
        failure = str(exc)
        scenes, coverage = [], {}
    except Exception as exc:  # noqa: BLE001 — provider timeout or API error: record it, keep the previous version
        failure = f"模型调用失败（{type(exc).__name__}）"
        scenes, coverage = [], {}
    record = {
        "corpus_id": info.id,
        "fingerprint": current,
        "model": settings.model_name,
        "generated_at": datetime.now(UTC).isoformat(),
        "process": {"status": "已完成" if not failure else "未完成", **({"error": failure} if failure else {})},
        "scenes": scenes,
        "coverage": coverage,
    }
    if failure and previous and previous.get("process", {}).get("status") == "已完成":
        # A failed update must not erase a readable hierarchy, but it must not look current either.
        record["scenes"] = previous["scenes"]
        record["coverage"] = {**previous.get("coverage", {}), "update_error": failure}
    await asyncio.to_thread(_save, info, record)
    return record


def _in_scope(evidence: list[dict], sources: dict[tuple[str, str], int]) -> list[int]:
    return sorted({sources[(item["doc_id"], item["version"])] for item in evidence
                   if (item.get("doc_id"), item.get("version")) in sources})


def render_section(record: dict | None, sources: list[dict]) -> str:
    """Render the stored hierarchy as a report section, filtered to the report's own sources.

    The section is machine-rendered from the index-backed record: entries the report cannot cite
    are marked instead of being dropped silently, and nothing here is regenerated by the model.
    """
    if not record or record.get("state") not in {"ready", "stale"} or not record.get("scenes"):
        return ""
    numbers = {(source["doc_id"], source["version"]): source["citation"] for source in sources}
    blocks: list[str] = []
    for scene in record["scenes"]:
        issues = [issue for issue in scene["issues"]
                  if _in_scope(issue.get("evidence", []), numbers)
                  or any(_in_scope(route.get("evidence", []), numbers) for route in issue["routes"])]
        achievements = [item for item in scene["achievements"]
                        if _in_scope(item.get("evidence", []), numbers)
                        or any(_in_scope(aspect.get("evidence", []), numbers) for aspect in item["aspects"])]
        if not (issues or achievements):
            continue
        lines = [f"### {scene['name']}（覆盖 {len(scene['project_ids'])} 个去重项目）"]
        if scene.get("summary"):
            lines.append(scene["summary"])
        lines.append("")
        if issues:
            lines.append("**核心问题与技术路线**")
            lines.append("")
            lines.append("| 核心问题 | 状态 | 典型技术路线 | 依据 |")
            lines.append("| --- | --- | --- | --- |")
            for issue in issues:
                routes = "；".join(f"{route['title']}：{route['summary']}" if route.get("summary")
                                   else route["title"] for route in issue["routes"]) or "本库暂无对应技术条目"
                cited = _in_scope(issue.get("evidence", []), numbers)
                for route in issue["routes"]:
                    cited.extend(number for number in _in_scope(route.get("evidence", []), numbers)
                                 if number not in cited)
                basis = "、".join(f"[{number}]" for number in sorted(set(cited))) or "本次报告范围未包含该条依据文件"
                lines.append(f"| {issue['name']} | {issue['state']} | {routes} | {basis} |")
            lines.append("")
        if achievements:
            lines.append("**标志性成果**")
            lines.append("")
            lines.append("| 标志性成果 | 覆盖项目 | 方面完成度 | 依据 |")
            lines.append("| --- | --- | --- | --- |")
            for item in achievements:
                stages = "；".join(f"{aspect['aspect']}：{aspect['stage']}" for aspect in item["aspects"])
                cited = _in_scope(item.get("evidence", []), numbers)
                for aspect in item["aspects"]:
                    cited.extend(number for number in _in_scope(aspect.get("evidence", []), numbers)
                                 if number not in cited)
                basis = "、".join(f"[{number}]" for number in sorted(set(cited))) or "本次报告范围未包含该条依据文件"
                projects = f"{item['marker_basis']['projects']} 个" + (
                    f"（代表项目 {item['marker_basis']['representative']}）"
                    if item["marker_basis"].get("representative") else "")
                lines.append(f"| {item['title']} | {projects} | {stages} | {basis} |")
            lines.append("")
        blocks.append("\n".join(lines))
    if not blocks:
        return ""
    coverage = record.get("coverage", {})
    gaps = coverage.get("gaps") or []
    fresh = "与当前四维归纳一致" if record.get("state") == "ready" else "四维归纳条目已变化，本章为上次生成结果"
    note = (f"覆盖说明：本章由程序按本库四维归纳结果渲染，只列出与本次报告资料范围有交集的场景、问题与成果；"
            f"范围外的条目不显示，也不由模型补写。层级生成时间 {record.get('generated_at', '未知')}（{fresh}）。"
            f"实际归纳：场景 {coverage.get('scenes', 0)} 类、核心问题 {coverage.get('issues', 0)} 个"
            f"（已解决 {coverage.get('solved_issues', 0)}、待解决 {coverage.get('open_issues', 0)}）、"
            f"技术路线 {coverage.get('routes', 0)} 条、标志性成果 {coverage.get('achievements', 0)} 项；"
            f"目标为 6 类场景、每类 3 个核心问题（2 已解决＋1 待解决）、每问题 2–3 条技术路线、每类 3–5 项成果，"
            f"数量不足按实际显示。"
            + (f"生成缺口 {len(gaps)} 项（名称无法回指或未达目标），已在资料库场景层级页列出。" if gaps else ""))
    return "## 场景层级（按四维归纳结果生成）\n\n" + "\n".join(blocks) + note + "\n"


async def read(info, library: dict) -> dict:
    """Saved hierarchy plus its freshness; missing and stale are distinct from an empty result."""
    record, error = await asyncio.to_thread(_load, info)
    current = fingerprint(library)
    if not record:
        return {"corpus_id": info.id, "state": "invalid" if error else "missing",
                "message": error, "scenes": [], "coverage": {},
                "fingerprint": current, "topics": {key: len(group) for key, group in topics(library).items()}}
    state = "ready" if record.get("fingerprint") == current else "stale"
    return {**record, "state": state, "current_fingerprint": current,
            "message": "" if state == "ready" else "四维归纳条目已变化，本层级需要重新生成",
            "topics": {key: len(group) for key, group in topics(library).items()}}