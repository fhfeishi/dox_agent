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
from . import achievement_list
from .prompts import target_instruction
from .reports import review_segments

DIMENSIONS = ("场景", "问题", "技术", "成果")
OUTCOME_STATUSES = ("已取得", "在研", "预期", "原文未明确")
SCHEMA_VERSION = 2
PROMPT_VERSION = 2
TARGET_DIRNAME = "target"

TECH_ROLES = ("关键创新", "配套-感知", "配套-控制", "配套-数据", "配套-通信", "配套-制造", "配套-验证", "未标明")
ATTRIBUTIONS = ("本项目", "前期成果", "参考文献", "待核对")
_PUBLICATION = ("已投稿", "已录用", "已发表", "原文未明确")
_GENERIC = ("已取得", "在研", "预期", "原文未明确")
OUTPUT_KINDS = {
    "期刊论文": _PUBLICATION, "会议论文": _PUBLICATION,
    "专利": ("申请", "公开", "授权", "原文未明确"),
    "软件/数据": _GENERIC, "样机/系统": _GENERIC, "平台/基地": _GENERIC, "标准/许可": _GENERIC,
    "人才/团队": _GENERIC, "转化/应用": _GENERIC, "指标": _GENERIC, "奖励/专著": _GENERIC,
}
EVENT_TYPES = ("试验", "样机", "部署", "论文发表", "专利申请", "专利授权", "其他")
EVENT_DATE = re.compile(r"\d{4}(?:-\d{2}(?:-\d{2})?)?(?:/\d{4}(?:-\d{2}(?:-\d{2})?)?)?")
# relation type -> allowed (from, to) dimensions
RELATION_TYPES = {
    "场景-问题": {("场景", "问题")},
    "针对": {("技术", "问题")},
    "配套": {("技术", "技术")},
    "验证": {("成果", "技术"), ("成果", "问题")},
}


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


def _clean(value: object, limit: int) -> str:
    """Optional free text: anything non-text or oversized is dropped rather than trusted."""
    return value.strip() if isinstance(value, str) and len(value.strip()) <= limit else ""


def _citations(raw: dict, label: str, markdown: str, start: int, end: int,
               chunks: list[dict], is_pdf: bool) -> list[dict]:
    evidence = raw.get("evidence")
    if not isinstance(evidence, list) or not evidence or len(evidence) > 8:
        raise ValueError(f"{label}必须包含 1–8 条证据")
    citations = []
    for proof in evidence:
        if not isinstance(proof, dict):
            raise ValueError(f"{label}证据结构非法")
        quote = _bounded_text(proof.get("quote"), f"{label}证据引文", 2000)
        citations.append({"quote": quote, "locator": _locate(markdown, start, end, quote, chunks, is_pdf)})
    return citations


def _quoted(value: str, citations: list[dict]) -> bool:
    return bool(value) and any(value in proof["quote"] for proof in citations)


def _event_date(raw: object, citations: list[dict]) -> tuple[str, str]:
    date = raw.strip() if isinstance(raw, str) else ""
    if not date:
        return "", "未知"
    if not EVENT_DATE.fullmatch(date):
        raise ValueError("事件日期格式非法")
    # A year the model supplies must be readable in the quoted text, never inferred.
    for year in re.findall(r"\d{4}", date):
        if not _quoted(year, citations):
            raise ValueError("事件日期在引文中找不到")
    first = date.split("/")
    return date, "区间" if len(first) == 2 else {4: "年", 7: "月", 10: "日"}[len(date)]


def _normalize_output(raw: dict, local_id: str, citations: list[dict]) -> dict:
    kind, attribution = raw.get("kind"), raw.get("attribution")
    if kind not in OUTPUT_KINDS or attribution not in ATTRIBUTIONS:
        raise ValueError("成果类别或归属非法")
    status = raw.get("status")
    if status not in OUTPUT_KINDS[kind]:
        raise ValueError(f"{kind}状态必须是 {'/'.join(OUTPUT_KINDS[kind])}")
    entry = {"_local_id": local_id, "kind": kind, "attribution": attribution, "status": status,
             "title": _bounded_text(raw.get("title"), "成果题名", 300),
             "status_raw": _clean(raw.get("status_raw"), 60), "evidence": citations}
    year = raw.get("year")
    if year not in (None, ""):
        year = str(year)
        if not re.fullmatch(r"(19|20)\d{2}", year) or not _quoted(year, citations):
            raise ValueError("成果年份在引文中找不到")
        entry["year"] = year
    identifiers = raw.get("identifiers", {})
    if not isinstance(identifiers, dict) or len(identifiers) > 6:
        raise ValueError("成果标识结构非法")
    entry["identifiers"] = {}
    for name, value in identifiers.items():
        if not isinstance(name, str) or not isinstance(value, str) or not _quoted(value.strip(), citations):
            raise ValueError("成果标识在引文中找不到")
        entry["identifiers"][name.strip()[:30]] = value.strip()
    for field in ("authors", "venue", "unit", "basis"):
        text = _clean(raw.get(field), 300)
        if text and _quoted(text, citations):
            entry[field] = text
    if kind == "指标":
        value = raw.get("value")
        value = str(value).strip() if isinstance(value, (str, int, float)) else ""
        if not _quoted(value, citations):
            raise ValueError("指标数值在引文中找不到")
        entry["value"] = value
    return entry


def _normalize_event(raw: dict, local_id: str, citations: list[dict]) -> dict:
    if raw.get("type") not in EVENT_TYPES:
        raise ValueError("事件类型非法")
    if raw.get("status") not in OUTCOME_STATUSES:
        raise ValueError("事件缺少状态")
    date, precision = _event_date(raw.get("date"), citations)
    return {"_local_id": local_id, "type": raw["type"], "status": raw["status"], "date": date,
            "precision": precision, "desc": _bounded_text(raw.get("desc"), "事件说明", 1000),
            "result": _clean(raw.get("result"), 1000), "environment": _clean(raw.get("environment"), 300),
            "self_reported": raw.get("self_reported") is True,
            "tech_refs": [r for r in raw.get("tech_ids", []) if isinstance(r, str)][:10]
            if isinstance(raw.get("tech_ids", []), list) else [],
            "output_refs": [r for r in raw.get("output_ids", []) if isinstance(r, str)][:10]
            if isinstance(raw.get("output_ids", []), list) else [],
            "evidence": citations}


def _normalize_segment(raw: dict, markdown: str, start: int, end: int,
                       chunks: list[dict], is_pdf: bool) -> dict:
    """Validate one model reply. Structure errors abort the segment; a single bad entry
    (missing/forged quote, unreadable date, illegal enum) is rejected and logged, so one
    forged fact never discards the rest of the segment."""
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
    for name in ("relations", "outputs", "events"):
        if not isinstance(raw.get(name, []), list):
            raise ValueError(f"{name} 结构非法")

    rejected: list[dict] = []

    def attempt(label: str, name: object, build):
        try:
            return build()
        except ValueError as exc:
            rejected.append({"kind": label, "name": str(name)[:120], "reason": str(exc),
                             "span": [start + 1, end]})
            return None

    normalized: dict[str, list[dict]] = {key: [] for key in DIMENSIONS}
    local_ids: set[tuple[str, str]] = set()
    for key in DIMENSIONS:
        items = by_key[key].get("items")
        if not isinstance(items, list):
            raise ValueError(f"{key}条目结构非法")
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                raise ValueError(f"{key}条目结构非法")

            def build_item(key=key, index=index, item=item):
                local_id = _bounded_text(item.get("id", f"{key}-{index + 1}"), f"{key}条目 id", 120)
                if (key, local_id) in local_ids:
                    raise ValueError(f"{key}条目 id 重复")
                entry = {"name": _bounded_text(item.get("name"), f"{key}名称", 120),
                         "_local_id": local_id,
                         "desc": _bounded_text(item.get("desc", ""), f"{key}说明", 1000, required=False),
                         "evidence": _citations(item, key, markdown, start, end, chunks, is_pdf)}
                if key == "成果":
                    if item.get("status") not in OUTCOME_STATUSES:
                        raise ValueError("成果条目缺少已取得/在研/预期/原文未明确状态")
                    entry["status"] = item["status"]
                    entry["status_raw"] = _clean(item.get("status_raw"), 60)
                    entry["self_reported"] = item.get("self_reported") is True
                if key == "技术":
                    role = item.get("role", "未标明")
                    if role not in TECH_ROLES:
                        raise ValueError("技术角色非法")
                    entry["role"] = role
                local_ids.add((key, local_id))
                return entry

            entry = attempt(key, item.get("name"), build_item)
            if entry:
                normalized[key].append(entry)

    outputs, events = [], []
    for index, item in enumerate(raw.get("outputs", [])):
        if not isinstance(item, dict):
            raise ValueError("outputs 条目结构非法")
        entry = attempt("可枚举成果", item.get("title"), lambda item=item, index=index: _normalize_output(
            item, _bounded_text(item.get("id", f"out-{index + 1}"), "成果 id", 120),
            _citations(item, "可枚举成果", markdown, start, end, chunks, is_pdf)))
        if entry:
            outputs.append(entry)
    for index, item in enumerate(raw.get("events", [])):
        if not isinstance(item, dict):
            raise ValueError("events 条目结构非法")
        entry = attempt("事件", item.get("desc"), lambda item=item, index=index: _normalize_event(
            item, _bounded_text(item.get("id", f"evt-{index + 1}"), "事件 id", 120),
            _citations(item, "事件", markdown, start, end, chunks, is_pdf)))
        if entry:
            events.append(entry)

    relations = []
    for relation in raw.get("relations", []):
        if not isinstance(relation, dict) or relation.get("basis") != "原文明示":
            continue  # same-paragraph co-occurrence is not a relation

        def build_relation(relation=relation):
            ends = []
            for side in ("from", "to"):
                ref = relation.get(side)
                if not isinstance(ref, dict) or (ref.get("dimension"), ref.get("item_id")) not in local_ids:
                    raise ValueError("关联引用了不存在或已被拒绝的条目")
                ends.append((ref["dimension"], ref["item_id"]))
            kind = relation.get("type")
            if kind not in RELATION_TYPES or (ends[0][0], ends[1][0]) not in RELATION_TYPES[kind]:
                raise ValueError("关联类型与端点维度不符")
            return {"from": ends[0], "to": ends[1], "type": kind, "basis": "原文明示",
                    "evidence": _citations(relation, "关联", markdown, start, end, chunks, is_pdf)}

        built = attempt("关系", relation.get("type"), build_relation)
        if built:
            relations.append(built)
    return {"facets": normalized, "relations": relations, "outputs": outputs, "events": events,
            "rejected": rejected}


def item_evidence(info, doc_id: str, version: str, item_ids: set[str]) -> dict[str, list[dict]]:
    """Current-version quotes for the given facet item ids, keyed by item id.

    A library-level synthesis cites item ids instead of re-reading documents; this keeps the
    citation bound to the same file version the index reports (需求 §17 R-SCN-03/05).
    """
    record, error = _load(info, doc_id)
    if error or not record or record.get("version") != version:
        return {}
    found: dict[str, list[dict]] = {}
    for facet in record.get("facets", []):
        for item in facet.get("items", []):
            if item.get("id") not in item_ids:
                continue
            found[item["id"]] = [
                {"quote": proof.get("quote", ""), "locator": proof.get("locator", {}),
                 "version": proof.get("version", "")}
                for proof in item.get("evidence", [])
                if proof.get("version") == version
            ]
    return found


def _item_id(dimension: str, key: str) -> str:
    return "item-" + hashlib.sha256(f"{dimension}:{key}".encode()).hexdigest()[:12]


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


def _output_identity(entry: dict) -> str:
    # A hard identifier (DOI, application number…) decides identity; look-alike titles
    # without one stay separate rather than being merged on a guess.
    ids = sorted(f"{k.casefold()}={_norm(v)}" for k, v in entry["identifiers"].items())
    if ids:
        return f"{entry['kind']}\0" + "\0".join(ids)
    return f"{entry['kind']}\0{entry['attribution']}\0{_norm(entry['title'])}"


class _Merge:
    """Accumulates validated segments into one record; ids are derived from content so a
    re-extraction of the same text yields the same ids downstream already reference."""

    def __init__(self, version: str):
        self.version = version
        self.facets: dict[str, dict[str, dict]] = {key: {} for key in DIMENSIONS}
        self.outputs: dict[str, dict] = {}
        self.events: dict[str, dict] = {}
        self.relations: list[dict] = []
        self.rejected: list[dict] = []

    def _evidence(self, target: dict, proofs: list[dict]) -> None:
        for proof in proofs:
            proof = {**proof, "version": self.version}
            if proof not in target["evidence"]:
                target["evidence"].append(proof)

    def add(self, segment: dict) -> None:
        local: dict[tuple[str, str], str] = {}
        for dimension, items in segment["facets"].items():
            for item in items:
                identity = _norm(item["name"])
                if dimension == "成果":
                    identity += f"\0{item['status']}"
                existing = self.facets[dimension].get(identity)
                if existing is None:
                    existing = {"id": _item_id(dimension, identity), "name": item["name"],
                                "desc": item["desc"], "evidence": [],
                                **{k: item[k] for k in ("status", "status_raw", "self_reported", "role")
                                   if k in item}}
                    self.facets[dimension][identity] = existing
                elif len(item["desc"]) > len(existing["desc"]):
                    existing["desc"] = item["desc"]
                local[(dimension, item["_local_id"])] = existing["id"]
                self._evidence(existing, item["evidence"])
        output_ids: dict[str, str] = {}
        for output in segment["outputs"]:
            identity = _output_identity(output)
            existing = self.outputs.get(identity)
            if existing is None:
                existing = {k: v for k, v in output.items() if k not in ("_local_id", "evidence")}
                existing["id"] = "out-" + hashlib.sha256(identity.encode()).hexdigest()[:12]
                existing["evidence"] = []
                self.outputs[identity] = existing
            elif existing["attribution"] == "待核对" and output["attribution"] != "待核对":
                existing["attribution"] = output["attribution"]
            output_ids[output["_local_id"]] = existing["id"]
            self._evidence(existing, output["evidence"])
        for event in segment["events"]:
            identity = f"{event['type']}\0{event['date']}\0{_norm(event['desc'])[:120]}"
            existing = self.events.get(identity)
            if existing is None:
                existing = {k: v for k, v in event.items()
                            if k not in ("_local_id", "evidence", "tech_refs", "output_refs")}
                existing.update(id="evt-" + hashlib.sha256(identity.encode()).hexdigest()[:12],
                                tech_ids=[], output_ids=[], evidence=[])
                self.events[identity] = existing
            for ref in event["tech_refs"]:
                merged = local.get(("技术", ref))
                if merged and merged not in existing["tech_ids"]:
                    existing["tech_ids"].append(merged)
            for ref in event["output_refs"]:
                merged = output_ids.get(ref)
                if merged and merged not in existing["output_ids"]:
                    existing["output_ids"].append(merged)
            self._evidence(existing, event["evidence"])
        for relation in segment["relations"]:
            value = {"from": {"dimension": relation["from"][0], "item_id": local[relation["from"]]},
                     "to": {"dimension": relation["to"][0], "item_id": local[relation["to"]]},
                     "type": relation["type"], "basis": "原文明示", "evidence": []}
            existing = next((r for r in self.relations if all(r[k] == value[k] for k in ("from", "to", "type"))), None)
            if existing is None:
                self.relations.append(value)
                existing = value
            self._evidence(existing, relation["evidence"])
        self.rejected.extend(segment["rejected"])


def _outputs_check(markdown: str, outputs: list[dict]) -> dict | None:
    """Reconcile extracted project outputs with the report's own 成果列表（N）, when it has one."""
    listed = achievement_list.parse(markdown)
    if listed is None:
        return None
    kinds = {"期刊论文": "期刊论文", "会议论文": "会议论文", "专利": "专利", "奖励": "奖励/专著", "专著": "奖励/专著"}
    per_kind: dict[str, dict] = {}
    for item in listed["items"]:
        kind = kinds.get(item["type"])
        if kind:
            per_kind.setdefault(kind, {"listed": 0, "extracted": 0})["listed"] += 1
    for output in outputs:
        if output["attribution"] == "本项目" and output["kind"] in kinds.values():
            per_kind.setdefault(output["kind"], {"listed": 0, "extracted": 0})["extracted"] += 1
    return {"declared": listed["declared"], "listed": len(listed["items"]), "by_kind": per_kind,
            "consistent": listed["declared"] == len(listed["items"])
            and all(v["listed"] == v["extracted"] for v in per_kind.values())}


class _Exhausted(Exception):
    """The per-document model-call budget ran out before the text was fully read."""


def needs_extraction(record: dict | None, error: str, doc: dict) -> bool:
    """True unless a completed record of the current schema already matches this document."""
    state, _ = _record_state(record, error, doc)
    return not (state == "current" and record["process"].get("status") == "已完成")


async def extract_target(info, knowledge, settings, doc_id: str, *, force: bool = False, llm=None,
                         max_calls: int | None = None, timeout: float | None = None) -> dict:
    docs = {doc["doc_id"]: doc for doc in await asyncio.to_thread(knowledge.current)}
    doc = docs.get(doc_id)
    if doc is None:
        raise TargetMissing("文档不存在或当前不可用于提取")
    previous, previous_error = await asyncio.to_thread(_load, info, doc_id)
    previous_state, _ = _record_state(previous, previous_error, doc)
    if not force and not needs_extraction(previous, previous_error, doc):
        return previous

    markdown = await asyncio.to_thread(knowledge.read_markdown, doc_id, doc["version"])
    pieces = review_segments(markdown)
    if not pieces:
        raise ValueError("解析正文为空，无法生成四维信息")
    chunks = [item for item in await asyncio.to_thread(knowledge.chunk_rows)
              if item["doc_id"] == doc_id and item["version"] == doc["version"]]
    model = llm or model_for(settings)
    is_pdf = doc.get("kind") == "pdf"
    merge = _Merge(doc["version"])
    budget = max_calls or settings.max_model_calls
    calls = processed = 0
    failed: list[dict] = []
    failure = ""

    async def read(start: int, end: int, depth: int = 0) -> None:
        nonlocal calls
        if calls >= budget:
            raise _Exhausted
        calls += 1
        response = await model.ainvoke([
            SystemMessage(content=target_instruction()),
            HumanMessage(content=(
                f"文档：{doc['title']}\n正文分段：{start + 1}–{end}（共 {len(markdown)} 字符）\n"
                f"解析正文字符：{start + 1}–{end}\n\n{markdown[start:end]}")),
        ])
        if (getattr(response, "response_metadata", None) or {}).get("finish_reason") == "length":
            middle = markdown.rfind("\n", start + 200, (start + end) // 2 + 200)
            if depth >= 2 or middle <= start or middle >= end:
                raise ValueError("模型输出被截断，且分块已无法再缩小")
            # Truncated output means this block holds more than one reply can carry: read halves.
            await read(start, middle, depth + 1)
            await read(middle, end, depth + 1)
            return
        merge.add(_normalize_segment(_json_object(response.content), markdown, start, end, chunks, is_pdf))

    try:
        async with asyncio.timeout(timeout or settings.run_timeout):
            for start, end, _ in pieces:
                try:
                    await read(start, end)
                    processed += 1
                except ValueError as exc:
                    # One bad block must not discard what other blocks already yielded.
                    failed.append({"span": [start + 1, end], "error": str(exc)})
    except TimeoutError:
        failure = "全文提取超过本次运行时限"
    except _Exhausted:
        failure = f"本次最多调用模型 {budget} 次，尚有正文未读完"
    if failed and not failure:
        failure = f"{len(failed)} 个正文块提取失败"

    complete = not failure and processed == len(pieces)
    outputs = list(merge.outputs.values())
    record = {
        "doc_id": doc_id,
        "version": doc["version"],
        "source_hash": doc.get("source_sha256", ""),
        "schema_version": SCHEMA_VERSION,
        "prompt_version": PROMPT_VERSION,
        "model": settings.model_name,
        "params": {"segment_chars": 6000, "model_calls": calls},
        "generated_at": datetime.now(UTC).isoformat(),
        "process": {"status": "已完成" if complete else "未完成",
                    "coverage": {"processed": processed, "total": len(pieces), "failed": failed}},
        "facets": [{"key": dimension, "state": ("has" if items else "未提及") if complete else "异常",
                    "items": list(items.values())} for dimension, items in merge.facets.items()],
        "relations": merge.relations,
        "outputs": outputs,
        "events": list(merge.events.values()),
        "rejected": merge.rejected,
        "outputs_check": _outputs_check(markdown, outputs),
        **({"error": failure} if failure else {}),
    }
    # 发布前再核对一次：提取期间资料若已变化，不能用旧正文的结果冒充当前版本。
    fresh = {item["doc_id"]: item for item in await asyncio.to_thread(knowledge.current)}.get(doc_id)
    if fresh is None or fresh["version"] != doc["version"] or (
            doc.get("source_sha256") and fresh.get("source_sha256") != doc.get("source_sha256")):
        raise TargetStale("资料已更新")
    # A failed run never replaces a readable record; a complete one always does.
    keep_previous = previous_state == "current" and previous["process"].get("status") == "已完成"
    if complete or not keep_previous:
        await asyncio.to_thread(_save, info, record)
    return record
