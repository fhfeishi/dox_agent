"""Grounded per-topic summaries (需求 §14.3–14.4, G2).

A topic summary is generated on request for one dimension/topic. Every point must cite the
numbered member items it rests on; achieved and expected outcomes never share a point.
Counts and representative projects come from the project index. Each summary keeps the
fingerprint of its own member items, so a source change only marks the affected topics
as needing an update, and a failed update keeps the previous readable version.
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
from .prompts import topic_summary_instruction
from .targets import DIMENSIONS, item_evidence

FILENAME = "topic_summaries.json"
ACHIEVED = "已取得"
_locks: dict[str, asyncio.Lock] = {}


class NoEvidence(ValueError):
    """The topic has no current-version evidence, so no conclusion may be generated."""


def _path(info) -> Path:
    return info.root / FILENAME


def _load_all(info) -> dict:
    try:
        value = json.loads(_path(info).read_text(encoding="utf-8"))
        return value if isinstance(value, dict) and value.get("corpus_id") == info.id else {"corpus_id": info.id, "topics": {}}
    except (OSError, UnicodeError, json.JSONDecodeError):
        return {"corpus_id": info.id, "topics": {}}


def _save_all(info, data: dict) -> None:
    fd, temp_name = tempfile.mkstemp(prefix=".topics-", suffix=".json", dir=info.root)
    temporary = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, _path(info))
    finally:
        temporary.unlink(missing_ok=True)


def members(library: dict, dimension: str, name: str) -> list[dict]:
    """Identified projects' items currently grouped under this topic, in index order."""
    refs = []
    for project in library["projects"]:
        if project["identity_status"] != "identified":
            continue
        for item in project["facets"][dimension]["items"]:
            if item["name"] == name:
                refs.append({"project_id": project["project_id"], "project": project["title"],
                             "doc_id": item["doc_id"], "version": item["version"], "item_id": item["id"],
                             "original_name": item.get("original_name", item["name"]),
                             "status": item.get("status", ""), "desc": item.get("desc", "")})
    return refs


def fingerprint(refs: list[dict]) -> str:
    payload = sorted((r["project_id"], r["doc_id"], r["version"], r["item_id"], r["original_name"]) for r in refs)
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False).encode()).hexdigest()


def _with_quotes(info, refs: list[dict]) -> list[dict]:
    """Attach current-version quotes; an item without a readable quote cannot support a point."""
    by_doc: dict[tuple[str, str], set[str]] = {}
    for ref in refs:
        by_doc.setdefault((ref["doc_id"], ref["version"]), set()).add(ref["item_id"])
    quotes = {key: item_evidence(info, key[0], key[1], ids) for key, ids in by_doc.items()}
    supported = []
    for ref in refs:
        proofs = quotes[(ref["doc_id"], ref["version"])].get(ref["item_id"], [])
        if proofs:
            supported.append({**ref, "ref": f"E{len(supported) + 1}", "quote": proofs[0]["quote"][:300],
                              "locator": proofs[0]["locator"]})
    return supported


def _input(dimension: str, name: str, refs: list[dict]) -> str:
    lines = [f"维度：{dimension}；主题：{name}；涉及项目 {len({r['project_id'] for r in refs})} 个。", ""]
    for r in refs:
        state = f"；状态：{r['status']}" if r["status"] else ""
        lines.append(f"- {r['ref']}｜项目：{r['project']}{state}｜描述：{r['desc']}｜原文：{r['quote']}")
    return "\n".join(lines)


def _points(raw: object, refs: dict[str, dict], kind: str, gaps: list[str]) -> list[dict]:
    points = []
    for entry in (raw if isinstance(raw, list) else [])[:8]:
        text = _text(entry.get("text") if isinstance(entry, dict) else None, 300)
        cited = [r for r in dict.fromkeys(entry.get("refs") or []) if isinstance(r, str) and r in refs] \
            if isinstance(entry, dict) and isinstance(entry.get("refs"), list) else []
        if not text or not cited:
            gaps.append(f"{kind}要点缺少可核对的依据编号，未采用：{text[:40]}")
            continue
        statuses = {refs[r]["status"] == ACHIEVED for r in cited if refs[r]["status"]}
        if len(statuses) > 1:
            gaps.append(f"{kind}要点把已取得与预期写成同一事实，未采用：{text[:40]}")
            continue
        projects = {refs[r]["project_id"] for r in cited}
        if kind == "共性" and len(projects) < 2:
            gaps.append(f"共性要点只有一个项目支持，未采用：{text[:40]}")
            continue
        points.append({"text": text, "refs": cited, "project_ids": sorted(projects)})
    return points


async def summarize(info, library: dict, settings, dimension: str, name: str, *, llm=None) -> dict:
    if dimension not in DIMENSIONS:
        raise ValueError("未知维度")
    refs = members(library, dimension, name)
    if not refs:
        raise NoEvidence("当前没有项目属于该主题")
    supported = await asyncio.to_thread(_with_quotes, info, refs)
    if not supported:
        raise NoEvidence("该主题没有可回读的当前版本原文，不生成归纳")
    key = f"{dimension}:{name}"
    async with _locks.setdefault(info.id, asyncio.Lock()):
        data = await asyncio.to_thread(_load_all, info)
        previous = data["topics"].get(key)
        failure, gaps, body = "", [], {}
        try:
            async with asyncio.timeout(settings.run_timeout):
                response = await (llm or model_for(settings)).ainvoke([
                    SystemMessage(content=topic_summary_instruction()),
                    HumanMessage(content=_input(dimension, name, supported)),
                ])
            raw = _json_object(response.content)
            table = {r["ref"]: r for r in supported}
            body = {"overview": _text(raw.get("overview"), 200),
                    "common": _points(raw.get("common"), table, "共性", gaps),
                    "differences": _points(raw.get("differences"), table, "差异", gaps)}
            if not body["overview"] and not body["common"] and not body["differences"]:
                raise ValueError("模型没有给出可核对的归纳内容")
        except TimeoutError:
            failure = "主题归纳超过本次运行时限"
        except ValueError as exc:
            failure = str(exc)
        counts: dict[str, int] = {}
        for ref in supported:
            counts[ref["project_id"]] = counts.get(ref["project_id"], 0) + 1
        record = {
            "dimension": dimension, "name": name, "fingerprint": fingerprint(refs),
            "generated_at": datetime.now(UTC).isoformat(), "model": settings.model_name,
            "status": "未完成" if failure else "已完成", **({"error": failure} if failure else {}),
            "project_count": len({r["project_id"] for r in refs}),
            "unsupported_items": len(refs) - len(supported),
            # Representatives are ranked by indexed evidence, never chosen by the model.
            "representatives": [{"project_id": pid, "title": next(r["project"] for r in supported if r["project_id"] == pid),
                                 "items": n} for pid, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:3]],
            **body, "gaps": gaps,
            # Snapshot of the cited sources, so an outdated summary can still show what it read.
            "sources": [{k: r[k] for k in ("ref", "project_id", "project", "doc_id", "version", "item_id", "status", "quote", "locator")}
                        for r in supported],
        }
        if failure and previous and previous.get("status") == "已完成":
            record = {**previous, "update_error": failure, "update_attempted_at": record["generated_at"]}
        data["topics"][key] = record
        await asyncio.to_thread(_save_all, info, data)
    return {**record, "state": "ready" if record["fingerprint"] == fingerprint(refs) else "stale"}


async def read(info, library: dict, dimension: str, name: str) -> dict:
    """Saved summary and freshness; opening a page never calls the model."""
    record = (await asyncio.to_thread(_load_all, info))["topics"].get(f"{dimension}:{name}")
    refs = members(library, dimension, name)
    if not record:
        return {"dimension": dimension, "name": name, "state": "missing", "project_count": len({r["project_id"] for r in refs})}
    return {**record, "state": "ready" if record["fingerprint"] == fingerprint(refs) else "stale"}
