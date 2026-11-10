"""Project identity and funding facts for one document (2026-11-09).

The four-dimension template answers what a project did; this module answers which project it is and
what money the document states. It is deliberately separate from ``targets.py``: every value here
has a quote and a locator, no amount is computed, and no field falls back to the filename.

The default dictionary is NSFC-shaped because real client material is not here yet. Adding a
horizontal/vertical term is a dictionary change, not a new extraction pipeline.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import UTC, datetime
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from . import records
from .agent.models import model_for

SCHEMA_VERSION = 1
PROMPT_VERSION = 1
DICTIONARY_ID = "nsfc-facts"
DICTIONARY_VERSION = 1
MAX_TEXT = 40000

PROJECT_KEYS = ("project_name", "project_no", "project_scheme", "project_category", "lead_unit",
                "participant_units", "principal_investigator", "start_date", "end_date")
REQUIRED = ("project_name", "project_no", "project_scheme")
MODEL_TO_KEY = {
    "name": "project_name", "number": "project_no", "scheme": "project_scheme",
    "category": "project_category", "lead_unit": "lead_unit", "participants": "participant_units",
    "pi": "principal_investigator", "start": "start_date", "end": "end_date",
}
SCHEMES = ("NSFC", "HORIZONTAL", "VERTICAL", "OTHER")
SCHEME_WORDS = {
    "NSFC": ("国家自然科学基金", "自然科学基金", "基金委"),
    "HORIZONTAL": ("横向", "委托", "合同", "企业"),
    "VERTICAL": ("纵向", "重点研发", "专项", "课题", "省重点", "国家计划"),
}
DATE = re.compile(r"^\d{4}(?:[-./]\d{1,2}(?:[-./]\d{1,2})?)?$")
NUMBER = re.compile(r"^-?\d+(?:\.\d+)?$")
FUNDING_TERMS = {
    "total": ("项目总经费", "总经费", "经费总额", "项目总金额"),
    "awarded": ("批准资助", "资助金额", "批准金额", "资助经费", "批准资助金额"),
    "direct": ("直接费用", "直接经费"),
    "indirect": ("间接费用", "间接经费"),
}
TAX = ("含税", "不含税", "未说明")
MAX_QUOTE = 2000


class FactsMissing(KeyError):
    """The document is not available for fact extraction."""


def facts_instruction() -> str:
    return (Path(__file__).parent / "prompts" / "facts_extract.md").read_text(encoding="utf-8")


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
        raise ValueError("模型返回的项目事实不是对象")
    return value


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _locate(text: str, quote: str, chunks: list[dict]) -> tuple[dict, str]:
    quote = quote.strip()[:MAX_QUOTE]
    if not quote:
        raise ValueError("缺少原文引文")
    start = text.find(quote)
    if start < 0:
        raise ValueError("引文不在解析正文中")
    for chunk in chunks:
        if quote in str(chunk.get("text", "")) and int(chunk.get("page") or 0) > 0:
            return {"basis": "pdf_page", "page": int(chunk["page"])}, quote
    return {"basis": "parsed_text", "start_char": start + 1, "end_char": start + len(quote)}, quote


def _confidence(value: object) -> str:
    return value if value in ("high", "medium", "low") else "medium"


def _has_value(value: str, quote: str) -> bool:
    """A field value must be readable in its own quote; dates compare on digits."""
    value = value.strip()
    if not value:
        return False
    if value in quote:
        return True
    return bool(_digits(value)) and _digits(value) in _digits(quote)


def _field(raw: object, text: str, chunks: list[dict], *, label: str) -> dict:
    if not isinstance(raw, dict):
        raise ValueError(f"{label}结构非法")
    value = str(raw.get("value", "")).strip()
    quote = str(raw.get("quote", "")).strip()
    if not value:
        raise ValueError(f"{label}值为空")
    if len(value) > 500:
        raise ValueError(f"{label}值过长")
    locator, quote = _locate(text, quote, chunks)
    if not _has_value(value, quote):
        raise ValueError(f"{label}值不在引文中")
    return {"value": value, "source": "content", "confidence": _confidence(raw.get("confidence")),
            "evidence": [{"quote": quote, "locator": locator}]}


def _date(raw: object, text: str, chunks: list[dict], label: str) -> dict:
    value = _field(raw, text, chunks, label=label)
    normalized = value["value"].replace(".", "-").replace("/", "-")
    if not DATE.fullmatch(normalized):
        raise ValueError(f"{label}不是可识别的时间")
    parts = normalized.split("-")
    precision = "year" if len(parts) == 1 else "month" if len(parts) == 2 else "day"
    value["value"] = normalized
    value["precision"] = precision
    return value


def _scheme(raw: object, text: str, chunks: list[dict]) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("项目体系结构非法")
    value = str(raw.get("value", "")).strip()
    quote = str(raw.get("quote", "")).strip()
    if not value:
        raise ValueError("项目体系值为空")
    locator, quote = _locate(text, quote, chunks)
    scheme = value.upper()
    if scheme not in SCHEMES:
        # The model may quote a Chinese label; map it from the quote, never from the title.
        scheme = next((key for key, words in SCHEME_WORDS.items()
                       if any(word in quote for word in words)), "")
        if not scheme:
            raise ValueError("项目体系不在可识别范围内")
    return {"value": scheme, "source": "content", "confidence": _confidence(raw.get("confidence")),
            "evidence": [{"quote": quote, "locator": locator}]}


def _project(raw: object, text: str, chunks: list[dict]) -> tuple[dict, list[dict]]:
    if not isinstance(raw, dict):
        raise ValueError("project 结构非法")
    project, rejected = {}, []
    for model_key, key in MODEL_TO_KEY.items():
        if key not in raw and model_key not in raw:
            continue
        item = raw.get(model_key)
        if key == "participant_units":
            try:
                participants = [_field(entry, text, chunks, label="参与单位") for entry in (item or [])]
                if participants:
                    project[key] = participants
            except ValueError as exc:
                rejected.append({"field": key, "reason": str(exc)})
            continue
        try:
            if key in ("start_date", "end_date"):
                project[key] = _date(item, text, chunks, "开始时间" if key == "start_date" else "结束时间")
            elif key == "project_scheme":
                project[key] = _scheme(item, text, chunks)
            else:
                project[key] = _field(item, text, chunks, label={
                    "project_name": "项目名称", "project_no": "项目编号",
                    "project_category": "项目类别", "lead_unit": "承担单位",
                    "principal_investigator": "负责人",
                }[key])
        except ValueError as exc:
            rejected.append({"field": key, "reason": str(exc)})
    scheme = project.get("project_scheme", {}).get("value", "")
    number = project.get("project_no", {}).get("value", "")
    project["identity"] = f"{scheme}:{number}" if scheme and number else ""
    return project, rejected


def _unit(quote: str, raw: object) -> str:
    unit = str(raw or "").strip()
    if unit in ("元", "万元"):
        return unit
    return "万元" if "万元" in quote else "元" if "元" in quote else ""


def _funding(raw: object, text: str, chunks: list[dict]) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("funding 结构非法")
    out = []
    for entry in raw:
        if not isinstance(entry, dict):
            raise ValueError("资金条目结构非法")
        term = str(entry.get("term", "")).strip()
        if term not in FUNDING_TERMS:
            raise ValueError("资金口径不在字典内")
        amount = str(entry.get("amount", "")).strip().replace(",", "")
        if not NUMBER.fullmatch(amount):
            raise ValueError("资金金额不是数字")
        locator, quote = _locate(text, str(entry.get("quote", "")), chunks)
        if _digits(amount) not in _digits(quote):
            raise ValueError("资金金额不在引文中")
        unit = _unit(quote, entry.get("unit"))
        if not unit:
            raise ValueError("资金金额没有单位")
        tax = str(entry.get("tax") or "未说明")
        if tax not in TAX:
            tax = "未说明"
        out.append({
            "term": term, "term_raw": str(entry.get("term_raw", "")).strip()[:80],
            "amount": amount, "unit": unit, "currency": "CNY", "tax": tax,
            "evidence": [{"quote": quote, "locator": locator}], "source": "content",
            "status": "stated", "confidence": _confidence(entry.get("confidence")),
        })
    return out


def _read_text(text: str) -> str:
    if len(text) <= MAX_TEXT:
        return text
    # Project identity is usually on the cover; funding can appear in a later statement. Read both
    # ends rather than silently dropping the tail.
    return text[:MAX_TEXT - 12000] + "\n\n[中间正文省略]\n\n" + text[-10000:]


async def extract_facts(info, knowledge, settings, doc_id: str, *, force: bool = False, llm=None) -> dict:
    docs = {doc["doc_id"]: doc for doc in await asyncio.to_thread(knowledge.current)}
    doc = docs.get(doc_id)
    if doc is None:
        raise FactsMissing("文档不存在或当前不可用")
    existing, _error = await asyncio.to_thread(records.load, info, doc_id)
    previous = records.metadata_of(existing)
    if not force and previous.get("status") == "completed" and (
            (existing or {}).get("doc_version") or (existing or {}).get("version")) == doc["version"]:
        return previous
    text, text_sha, corrections_sha, invalidated = await asyncio.to_thread(
        records.corrected_text, info, knowledge, doc)
    chunks = [item for item in await asyncio.to_thread(knowledge.chunk_rows)
              if item["doc_id"] == doc_id and item["version"] == doc["version"]]
    started = datetime.now(UTC).isoformat()
    model = llm or model_for(settings)
    metadata: dict = {
        "status": "failed", "schema_version": SCHEMA_VERSION, "dictionary_id": DICTIONARY_ID,
        "dictionary_version": DICTIONARY_VERSION, "prompt_version": PROMPT_VERSION,
        "project": {"identity": ""}, "funding": [], "candidates": {}, "missing": list(REQUIRED),
        "rejected": [], "process": {"model": settings.model_name, "started_at": started,
                                    "ended_at": "", "error": ""},
    }
    try:
        response = await model.ainvoke([
            SystemMessage(content=facts_instruction()),
            HumanMessage(content=f"文档：{doc['title']}\n\n{_read_text(text)}"),
        ])
        raw = _json_object(response.content)
        project, rejected = _project(raw.get("project", {}), text, chunks)
        funding = _funding(raw.get("funding"), text, chunks)
        missing = [key for key in REQUIRED if not project.get(key)]
        metadata.update({
            "project": project, "funding": funding, "rejected": rejected, "missing": missing,
            "status": "completed" if not rejected and not missing else "partial" if project else "failed",
        })
    except ValueError as exc:
        metadata["process"]["error"] = str(exc)
    except Exception as exc:  # noqa: BLE001 — provider error: keep the previous readable record
        metadata["process"]["error"] = f"模型调用失败（{type(exc).__name__}）"
    metadata["process"]["ended_at"] = datetime.now(UTC).isoformat()
    metadata["parse"] = {"text_sha256": text_sha, "corrections_hash": corrections_sha,
                         "corrections_invalidated": invalidated}
    keep_previous = previous.get("status") == "completed" and metadata["status"] == "failed"
    if not keep_previous:
        await asyncio.to_thread(records.write_metadata, info, knowledge, doc, metadata, settings)
    return metadata


def facts_state(record: dict | None, doc: dict) -> tuple[str, str]:
    """``current`` / ``stale`` / ``missing`` / ``partial`` / ``failed`` for the metadata section."""
    metadata = records.metadata_of(record)
    if not metadata:
        return "missing", ""
    if (record or {}).get("doc_version") != doc["version"]:
        return "stale", "资料已更新"
    status = metadata.get("status")
    if status == "completed":
        return "current", ""
    if status == "partial":
        return "partial", "部分字段未提取"
    if status == "failed":
        return "failed", str((metadata.get("process") or {}).get("error") or "提取失败")
    return "missing", ""
