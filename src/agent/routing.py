"""Fixed professional Q&A policy: corpus-grounded answers with optional document scope.

Intent classification and the user-facing strategy switches (``query_routing`` /
``evidence_level`` / ``execution_mode``) are intentionally removed.  Every turn is a
professional, evidence-bound question; the only per-turn variable is the document scope.
"""

import asyncio

from pydantic import BaseModel, ConfigDict, Field


class TurnOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    allowed_doc_ids: list[str] | None = Field(default=None, min_length=1, max_length=20)


async def resolve_policy(options: TurnOptions, knowledge, preparation: str = "ready",
                         has_web_sources: bool = False) -> dict:
    """Return the fixed professional policy; only document scope or corpus state can change it.

    ``has_web_sources`` (W6-A) keeps a confirmed web snapshot usable when the selected corpus
    is not ready: the run still reports the real corpus state via ``stop_reason``, but the
    "cannot verify" notice no longer short-circuits the answer, so the snapshot is not dropped.
    """
    policy = options.model_dump()
    if policy["allowed_doc_ids"] is not None:
        docs = await asyncio.to_thread(knowledge.all)
        ids = {doc["doc_id"] for doc in docs}
        if not set(policy["allowed_doc_ids"]) <= ids:
            return {**policy, "route": "clarify", "stop_reason": "scope_missing",
                    "notice": "所选文档已不可用，请重新选择资料。"}
    if preparation != "ready" and has_web_sources:
        return {**policy, "route": "research", "stop_reason": "corpus_" + preparation, "notice": ""}
    if preparation != "ready":
        return {**policy, "route": "research", "stop_reason": "corpus_" + preparation,
                "notice": "知识库正在准备，暂时不能查证；仍可进行一般交流。" if preparation == "running"
                else "该知识库尚未导入文档，暂时不能查证；仍可进行一般交流。" if preparation in {"empty", "uninitialized"}
                else "知识库加载失败，暂时不能查证；仍可进行一般交流。"}
    return {**policy, "route": "research", "stop_reason": "professional", "notice": ""}


def answer_policy(policy: dict) -> str:
    # Derivation permission is decided by the task contract (plan 待定设计 #11), not by this baseline:
    # task1/task2 narrow it to read evidence only, task3 opens it with mandatory labelling.
    return "事实结论仅依据本轮有效已读资料；是否允许推导由本轮任务契约决定，允许时必须标明前提。缺失部分明确保留，不使用一般知识补齐。"
