"""Research handoff contracts and deterministic routing (not a semantic judge)."""

import re
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, Field


class Assessment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=500)
    status: Literal["supported", "partial", "unsupported", "conflicting"]
    evidence_ids: list[str] = Field(default_factory=list, max_length=6)
    gap: Literal["none", "corpus_missing", "retrieval", "reading", "coverage", "output", "conditions", "conflict", "unknown"]
    next_action: Literal["answer", "search", "read", "clarify", "stop"]
    detail: str = Field(default="", max_length=600)


class ResearchReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answer_mode: Literal["consultation", "audit"] = "consultation"
    assessments: list[Assessment] = Field(min_length=1, max_length=8)


class CorpusBlocked(Exception):
    """End the inner agent immediately when a verified source cannot be acquired."""


def official_url(value: str) -> str | None:
    parsed = urlsplit(value)
    if parsed.scheme != "https" or parsed.netloc != "docs.langchain.com":
        return None
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/").removesuffix(".md"), "", ""))


def observed_urls(messages: list[dict], evidence: list[dict]) -> set[str]:
    # Assistant history is context, never authoritative proof of a page's identity.
    texts = [m["content"] for m in messages if m["role"] == "user"]
    texts.extend(e["text"] for e in evidence)
    return {url for text in texts for raw in re.findall(r'https://docs\.langchain\.com/[^\s<>"`\]\)]+', text)
            if (url := official_url(raw.rstrip(".,;，。；")))}


def validate_report(report: dict | None, evidence: list[dict]) -> dict | None:
    if report is None:
        return None
    checked = ResearchReport.model_validate(report).model_dump()
    valid_ids = {e["evidence_id"] for e in evidence}
    for item in checked["assessments"]:
        ids = item["evidence_ids"]
        if not ids or any(key not in valid_ids for key in ids):
            item["evidence_ids"] = [key for key in ids if key in valid_ids]
            if item["status"] in ("supported", "partial"):
                item.update(status="unsupported", gap="unknown", next_action="stop", detail="研究报告缺少有效的已读证据引用")
        # Only the inventory tool may establish a hard corpus gap.
        if item["gap"] == "corpus_missing":
            item.update(status="unsupported", gap="unknown", detail="模型报告缺页，但尚无目录核验证据；" + item["detail"])
        if item["status"] == "supported" and item["gap"] != "none":
            item["status"] = "partial"
        if item["gap"] == "output":
            item["next_action"] = "answer"
        elif item["gap"] == "conditions":
            item["next_action"] = "clarify"
    return checked


def merge_reports(previous: dict | None, current: dict | None) -> dict | None:
    """A repair round cannot silently drop a previously identified subquestion."""
    if current is None:
        return None
    items = {item["question"].strip().casefold(): item for item in (previous or {}).get("assessments", [])}
    items.update({item["question"].strip().casefold(): item for item in current["assessments"]})
    if len(items) > 8:
        return None  # Bounded handoff failed; do not infer full coverage.
    return {**current, "assessments": list(items.values())}


def preserve_blocked_report(report: dict | None, blocked: dict | None) -> dict | None:
    """Only a verified inventory/tool block may mark an unrepairable subquestion."""
    if not blocked:
        return report
    question = blocked.get("question") or blocked["source"]
    items = [item for item in (report or {}).get("assessments", []) if item["question"] != question]
    items.append({"question": question, "status": "unsupported", "evidence_ids": [],
                  "gap": "corpus_missing", "next_action": "stop", "detail": blocked["source"]})
    return {"answer_mode": (report or {}).get("answer_mode", "consultation"), "assessments": items}


def decide(report: dict | None, *, blocked: bool, rounds: int, max_rounds: int,
           new_evidence: int, evidence_count: int, searches: int, max_searches: int,
           max_reads: int = 6) -> str:
    if blocked:
        return "corpus_unavailable"
    if report is None:
        return "handoff_missing"
    items = report["assessments"]
    if all(item["status"] == "supported" for item in items):
        return "covered"
    if rounds >= max_rounds:
        return "round_limit"
    if rounds > 1 and new_evidence == 0:
        return "no_progress"
    if evidence_count >= max_reads:
        return "read_limit"
    actions = [item["next_action"] for item in items if item["status"] != "supported"]
    if "read" in actions or ("search" in actions and searches < max_searches):
        return "repair"
    return "search_limit" if "search" in actions else "partial_or_clarify"
