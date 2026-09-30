"""Versioned four-dimension extraction for one corpus document."""

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
from .prompts import target_instruction
from .reports import review_segments

DIMENSIONS = ("场景", "问题", "技术", "成果")
OUTCOME_STATUSES = ("已取得", "预期", "原文未明确")
SCHEMA_VERSION = 1
PROMPT_VERSION = 1
TARGET_DIRNAME = "target"


class TargetMissing(KeyError):
    """No extraction result exists for the requested document."""


class TargetStale(ValueError):
    """The saved result no longer matches the current parsed document."""


def _target_path(info, doc_id: str) -> Path:
    return info.root / TARGET_DIRNAME / f"{doc_id}.json"


def _load(info, doc_id: str) -> tuple[dict | None, str]:
    path = _target_path(info, doc_id)
    if not path.is_file():
        return None, ""
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict) or value.get("doc_id") != doc_id:
            raise ValueError("结果身份不匹配")
        if not isinstance(value.get("facets"), list) or not isinstance(value.get("process"), dict):
            raise ValueError("结果结构不完整")
        return value, ""
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        return None, f"四维结果文件损坏：{exc}"


def _save(info, record: dict) -> None:
    directory = info.root / TARGET_DIRNAME
    directory.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".target-", suffix=".json", dir=directory)
    temporary = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(record, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, _target_path(info, record["doc_id"]))
    finally:
        temporary.unlink(missing_ok=True)


def remove_target(info, doc_id: str | None) -> None:
    if doc_id:
        _target_path(info, doc_id).unlink(missing_ok=True)


def _record_state(record: dict | None, error: str, doc: dict) -> tuple[str, str]:
    if error:
        return "invalid", error
    if record is None:
        return "missing", ""
    if record.get("version") != doc["version"] or (
        record.get("source_hash") and doc.get("source_sha256")
        and record.get("source_hash") != doc.get("source_sha256")
    ):
        return "stale", "资料已更新"
    if record.get("schema_version") != SCHEMA_VERSION or record.get("prompt_version") != PROMPT_VERSION:
        return "stale", "四维提取规则已更新"
    return "current", ""


def _empty_facets(state: str) -> dict:
    return {key: {"state": state, "items": []} for key in DIMENSIONS}


def _summary(info, doc: dict) -> dict:
    record, error = _load(info, doc["doc_id"])
    state, message = _record_state(record, error, doc)
    if state == "current" and record is not None:
        # The list carries names/descriptions for filtering, never all document evidence.
        facets = {facet["key"]: {"state": facet["state"], "items": [
            {key: item[key] for key in ("id", "name", "desc", "status") if key in item}
            for item in facet.get("items", [])]} for facet in record["facets"]}
        process = record["process"]
    elif state == "invalid":
        facets = _empty_facets("异常")
        process = {"status": "未完成", "coverage": {"processed": 0, "total": 0}}
    else:
        facets = _empty_facets("未处理")
        process = {"status": "未处理", "coverage": {"processed": 0, "total": 0}}
    return {
        "doc_id": doc["doc_id"],
        "version": doc["version"],
        "schema_version": SCHEMA_VERSION,
        "prompt_version": PROMPT_VERSION,
        "title": doc["title"],
        "source_name": Path(doc.get("origin", "")).name or doc["title"],
        "index_status": "indexed",
        "process": process,
        "facets": facets,
        "stale": state == "stale",
        "message": message,
    }


def list_target_reports(info, knowledge) -> list[dict]:
    return [_summary(info, doc) for doc in knowledge.current()]


def target_detail(info, knowledge, doc_id: str) -> dict:
    current = {doc["doc_id"]: doc for doc in knowledge.current()}
    doc = current.get(doc_id)
    if doc is None:
        if any(item["doc_id"] == doc_id for item in knowledge.all()):
            raise TargetStale("资料已更新")
        raise TargetMissing("文档不存在")
    record, error = _load(info, doc_id)
    state, message = _record_state(record, error, doc)
    if state == "missing":
        raise TargetMissing("尚未生成四维信息")
    if state == "stale":
        raise TargetStale(message)
    if state == "invalid":
        record = {
            "doc_id": doc_id,
            "version": doc["version"],
            "source_hash": doc.get("source_sha256", ""),
            "schema_version": SCHEMA_VERSION,
            "prompt_version": PROMPT_VERSION,
            "process": {"status": "未完成", "coverage": {"processed": 0, "total": 0}},
            "facets": [{"key": key, "state": "异常", "items": []} for key in DIMENSIONS],
            "relations": [],
            "error": message,
        }
    return {
        **record,
        "title": doc["title"],
        "source_name": Path(doc.get("origin", "")).name or doc["title"],
        "document": {
            "doc_id": doc_id,
            "title": doc["title"],
            "origin": doc.get("origin", ""),
            "version": doc["version"],
            "captured_at": doc.get("captured_at", ""),
            "kind": doc.get("kind", "text"),
            "parser": doc.get("parser", ""),
            "pages": doc.get("page_count", 0),
        },
    }


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
        raise ValueError("模型返回的四维结果不是对象")
    return value


def _bounded_text(value: object, label: str, limit: int, *, required: bool = True) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{label}必须是文本")
    text = value.strip()
    if required and not text:
        raise ValueError(f"{label}不能为空")
    if len(text) > limit:
        raise ValueError(f"{label}过长")
    return text


def _locate(markdown: str, segment_start: int, segment_end: int, quote: str,
            chunks: list[dict], is_pdf: bool) -> dict:
    start = markdown.find(quote, segment_start, segment_end)
    if start < 0:
        # A section boundary can split a quote; accept it only when the full parsed body
        # still contains it verbatim, so nothing outside the document can be cited.
        start = markdown.find(quote)
        if start < 0:
            raise ValueError("证据引文不在解析正文中")
    chunk = next((item for item in chunks if quote in item["text"]), None)
    if is_pdf and chunk and int(chunk.get("page") or 0) > 0:
        locator = {"basis": "pdf_page", "page": int(chunk["page"])}
        if chunk.get("chunk_id"):
            locator["chunk_id"] = chunk["chunk_id"]
        if chunk.get("heading"):
            locator["heading"] = chunk["heading"]
        return locator
    return {"basis": "parsed_text", "start_char": start + 1, "end_char": start + len(quote)}


def _normalize_segment(raw: dict, markdown: str, start: int, end: int,
                       chunks: list[dict], is_pdf: bool) -> tuple[dict[str, list[dict]], list[dict]]:
    facets = raw.get("facets")
    if not isinstance(facets, list):
        raise ValueError("四维结果缺少 facets")
    by_key: dict[str, dict] = {}
    for facet in facets:
        if not isinstance(facet, dict) or facet.get("key") not in DIMENSIONS or facet["key"] in by_key:
            raise ValueError("四维字段缺失、重复或名称非法")
        by_key[facet["key"]] = facet
    if set(by_key) != set(DIMENSIONS):
        raise ValueError("四维字段缺失，属于提取异常")

    normalized: dict[str, list[dict]] = {key: [] for key in DIMENSIONS}
    local_ids: set[tuple[str, str]] = set()
    for key in DIMENSIONS:
        items = by_key[key].get("items")
        if not isinstance(items, list) or len(items) > 20:
            raise ValueError(f"{key}条目结构非法")
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                raise ValueError(f"{key}条目结构非法")
            local_id = _bounded_text(item.get("id", f"{key}-{index + 1}"), f"{key}条目 id", 120)
            if (key, local_id) in local_ids:
                raise ValueError(f"{key}条目 id 重复")
            local_ids.add((key, local_id))
            evidence = item.get("evidence")
            if not isinstance(evidence, list) or not evidence or len(evidence) > 5:
                raise ValueError(f"{key}条目必须包含证据")
            citations = []
            for proof in evidence:
                if not isinstance(proof, dict):
                    raise ValueError(f"{key}证据结构非法")
                quote = _bounded_text(proof.get("quote"), f"{key}证据引文", 2000)
                citations.append({"quote": quote,
                                  "locator": _locate(markdown, start, end, quote, chunks, is_pdf)})
            entry = {
                "name": _bounded_text(item.get("name"), f"{key}名称", 120),
                "_local_id": local_id,
                "desc": _bounded_text(item.get("desc", ""), f"{key}说明", 1000, required=False),
                "evidence": citations,
            }
            if key == "成果":
                status = item.get("status")
                if status not in OUTCOME_STATUSES:
                    raise ValueError("成果条目缺少已取得/预期/原文未明确状态")
                entry["status"] = status
            normalized[key].append(entry)

    relations = raw.get("relations", [])
    if not isinstance(relations, list):
        raise ValueError("relations 结构非法")
    checked_relations = []
    for relation in relations:
        # 只保留原文明示的关联：仅在同一段同时出现两个条目不构成关联。
        if not isinstance(relation, dict) or relation.get("basis") != "原文明示":
            continue
        source, target = relation.get("from"), relation.get("to")
        if not isinstance(source, dict) or not isinstance(target, dict):
            raise ValueError("关联端点结构非法")
        source_ref = (source.get("dimension"), source.get("item_id"))
        target_ref = (target.get("dimension"), target.get("item_id"))
        if source_ref not in local_ids or target_ref not in local_ids:
            raise ValueError("关联引用了不存在的条目")
        checked_relations.append({"from": source_ref, "to": target_ref, "basis": "原文明示"})
    return normalized, checked_relations


def _item_id(dimension: str, key: str) -> str:
    return "item-" + hashlib.sha256(f"{dimension}:{key}".encode()).hexdigest()[:12]


async def extract_target(info, knowledge, settings, doc_id: str, *, force: bool = False, llm=None) -> dict:
    docs = {doc["doc_id"]: doc for doc in await asyncio.to_thread(knowledge.current)}
    doc = docs.get(doc_id)
    if doc is None:
        raise TargetMissing("文档不存在或当前不可用于提取")
    previous, previous_error = await asyncio.to_thread(_load, info, doc_id)
    previous_state, _ = _record_state(previous, previous_error, doc)
    if not force and previous_state == "current" and previous and previous["process"].get("status") == "已完成":
        return previous

    markdown = await asyncio.to_thread(knowledge.read_markdown, doc_id, doc["version"])
    pieces = review_segments(markdown)
    if not pieces:
        raise ValueError("解析正文为空，无法生成四维信息")
    chunks = [item for item in await asyncio.to_thread(knowledge.chunk_rows)
              if item["doc_id"] == doc_id and item["version"] == doc["version"]]
    model = llm or model_for(settings)
    merged: dict[str, dict[str, dict]] = {key: {} for key in DIMENSIONS}
    relations: list[dict] = []
    processed = 0
    failure = ""
    deadline = asyncio.get_running_loop().time() + settings.run_timeout
    max_segments = min(len(pieces), settings.max_model_calls)
    try:
        async with asyncio.timeout_at(deadline):
            for segment_index, (start, end, piece) in enumerate(pieces[:max_segments], 1):
                response = await model.ainvoke([
                    SystemMessage(content=target_instruction()),
                    HumanMessage(content=(
                        f"文档：{doc['title']}\n正文分段：{segment_index}/{len(pieces)}\n"
                        f"解析正文字符：{start + 1}–{end}\n\n{piece}"
                    )),
                ])
                if (getattr(response, "response_metadata", None) or {}).get("finish_reason") == "length":
                    raise ValueError("模型输出被截断")
                facets, segment_relations = _normalize_segment(
                    _json_object(response.content), markdown, start, end, chunks, doc.get("kind") == "pdf")
                local_to_merged: dict[tuple[str, str], str] = {}
                for dimension, items in facets.items():
                    for item in items:
                        identity = re.sub(r"\s+", " ", item["name"]).strip().casefold()
                        if dimension == "成果":
                            identity += f"\0{item['status']}"
                        existing = merged[dimension].get(identity)
                        if existing is None:
                            existing = {"id": _item_id(dimension, identity),
                                        "name": item["name"], "desc": item["desc"],
                                        "evidence": [], **({"status": item["status"]} if dimension == "成果" else {})}
                            merged[dimension][identity] = existing
                        elif len(item["desc"]) > len(existing["desc"]):
                            existing["desc"] = item["desc"]
                        local_to_merged[(dimension, item["_local_id"])] = existing["id"]
                        # The per-segment id is merge bookkeeping, never part of the record.
                        item.pop("_local_id", None)
                        for proof in item["evidence"]:
                            proof = {**proof, "version": doc["version"]}
                            if proof not in existing["evidence"]:
                                existing["evidence"].append(proof)
                for relation in segment_relations:
                    value = {
                        "from": {"dimension": relation["from"][0],
                                 "item_id": local_to_merged[relation["from"]]},
                        "to": {"dimension": relation["to"][0],
                               "item_id": local_to_merged[relation["to"]]},
                        "basis": "原文明示",
                    }
                    if value not in relations:
                        relations.append(value)
                processed += 1
    except TimeoutError:
        # 超时不是模型结构问题：两者文案与可重试性不同，必须分开。
        failure = "四维提取超过本次运行时限"
    except ValueError as exc:
        failure = str(exc)
    if not failure and max_segments < len(pieces):
        failure = f"正文共 {len(pieces)} 段，本次最多处理 {max_segments} 段"

    complete = not failure and processed == len(pieces)
    facets = [{
        "key": dimension,
        "state": ("has" if items else "未提及") if complete else "异常",
        "items": list(items.values()),
    } for dimension, items in merged.items()]
    record = {
        "doc_id": doc_id,
        "version": doc["version"],
        "source_hash": doc.get("source_sha256", ""),
        "schema_version": SCHEMA_VERSION,
        "prompt_version": PROMPT_VERSION,
        "model": settings.model_name,
        "generated_at": datetime.now(UTC).isoformat(),
        "process": {"status": "已完成" if complete else "未完成",
                    "coverage": {"processed": processed, "total": len(pieces)}},
        "facets": facets,
        "relations": relations,
        **({"error": failure} if failure else {}),
    }
    # 发布前再核对一次：提取期间资料若已变化，不能用旧正文的结果冒充当前版本。
    fresh = {item["doc_id"]: item for item in await asyncio.to_thread(knowledge.current)}.get(doc_id)
    if fresh is None or fresh["version"] != doc["version"] or (
            doc.get("source_sha256") and fresh.get("source_sha256") != doc.get("source_sha256")):
        raise TargetStale("资料已更新")
    preserve_previous = previous_state == "current" and previous and previous["process"].get("status") == "已完成"
    if complete or not preserve_previous:
        await asyncio.to_thread(_save, info, record)
    return record
