"""L 阶段检索核心：报告级混合检索（chunk → report → full markdown）。

只做检索，不改回答契约（HTTP/SSE 形状不变）。纯逻辑、与存储无关：调用方提供
已解析报告的块（mineru block 或等价结构），本模块负责

- L2 分块：以 block 为原子、带页号与标题，分块前剥离 base64 图片；
- L3b 报告级索引：由 title + heading + 文件名元数据（项目号/年份）构成；
- L4a 两级选择：Layer A 报告级召回 → Layer B 报告内 chunk 精排（加权 RRF）
  → 报告评分（每文档自身 top-m RRF 累计）→ 按项目去重 → 主题词覆盖率无匹配判据。

约定与边界：
- 默认参数多为 uncalibrated（见 .logsdev/ITERATION.md §7.7）；只校准 4 项。
- 本轮不含 dense / rerank / MMR / LLM 多查询（默认延后）；BM25-only 即可验收。
- 本模块尚未接线：L1 存储分离、L3 持久化、L5 装配、L6 图替换未落地，
  因此只提供可执行、可单测的检索核心，图与存储仍走既有路径。
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

from rank_bm25 import BM25Plus

from .knowledge import tokens

_BASE64_IMAGE = re.compile(r"data:image/[^;,]{0,80};base64,[A-Za-z0-9+/=]+", re.IGNORECASE)
_MARKDOWN_HEADING = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*$")
_HEADING_KINDS = frozenset({"title", "heading"})
# Plan L2: tables/code/formulas are kept whole, never split across chunks.
_ATOMIC_KINDS = frozenset({"table", "code", "formula", "equation", "image"})
# Generic terms that must not create "coverage" on their own (D-L6 no-match judgement).
_QUERY_STOP = frozenset({
    "的是", "是什么", "什么", "哪些", "哪个", "如何", "怎么", "怎样", "可以", "是否", "以及", "并且",
    "或者", "因为", "所以", "进行", "相关", "情况", "问题", "方面", "领域", "一个", "一种", "当前",
    "目前", "主要", "可能", "需要", "通过", "对于", "关于", "基于", "研究", "分析", "报告", "项目",
    "成果", "进展", "趋势", "介绍", "说明", "总结",
})


@dataclass(frozen=True)
class RetrievalConfig:
    """集中检索参数（D-L6）。``~`` 标记未校准，须由评测校准后才能当结论使用。"""

    report_recall_m: int = 40  # ~ Layer A 报告级召回数（报告数少时近乎全覆盖）
    kb_chunk_topk: int = 50  # ~ Layer B 每查询每报告候选 chunk 数
    per_doc_cand: int = 4  # 每报告保留的候选 chunk
    per_doc_top_m: int = 3  # ~ 报告评分取自身前 m 个 chunk
    rrf_k: int = 60
    question_weight: float = 1.0  # q0 权重
    keyword_weight: float = 0.8  # 规则补查询权重
    min_term_cover: float = 0.3  # ~ 无匹配主判据
    min_reports: dict[str, int] = field(
        default_factory=lambda: {"task1": 1, "task2": 2, "task3": 3, "task4": 3}
    )
    max_reports: dict[str, int] = field(
        default_factory=lambda: {"task1": 3, "task2": 5, "task3": 8, "task4": 10}
    )


@dataclass(frozen=True)
class RawBlock:
    """mineru middle_json 的原子块；``kind`` 为 text/title/table/image/equation 等。"""

    page: int
    text: str
    kind: str = "text"


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    doc_id: str
    version: str
    title: str
    heading: str
    page: int
    text: str


@dataclass(frozen=True)
class ReportDoc:
    """报告级索引的输入：标题、各级 heading 与文件名元数据。"""

    doc_id: str
    version: str
    title: str
    headings: tuple[str, ...] = ()
    project_no: str = ""
    year_from: int | None = None
    year_to: int | None = None
    rel_path: str = ""


@dataclass
class SelectedReport:
    doc: ReportDoc
    score: float
    term_cover: float
    chunks: list[Chunk]  # 可引用集 = per_doc_cand（RRF 降序）；评分仅用 top_m


@dataclass
class RetrievalResult:
    reports: list[SelectedReport]
    matched: bool
    reason: str = ""  # "" | "no_reports" | "direct"
    partial: bool = False  # 命中但不足该任务的 MIN_REPORTS（D-L4 coverage_partial 场景）
    candidates: int = 0


def strip_base64(text: str) -> str:
    """L2：分块前把内嵌 base64 图片替换为 ``[图片]``，只对文本做检索。"""
    return _BASE64_IMAGE.sub("[图片]", text or "")


def _heading_of(kind: str, text: str) -> str:
    match = _MARKDOWN_HEADING.match(text)
    if match:
        return match.group(2).strip()
    return text.strip() if kind in _HEADING_KINDS else ""


def _chunk_id(doc_id: str, version: str, page: int, heading: str, sequence: int, text: str) -> str:
    raw = f"{doc_id}|{version}|{page}|{heading}|{sequence}|{text}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _windows(text: str, size: int, overlap: int):
    if size <= 0:
        yield text
        return
    step = max(1, size - overlap)
    for start in range(0, len(text), step):
        piece = text[start : start + size]
        if piece.strip():
            yield piece
        if start + size >= len(text):
            break


def chunk_blocks(
    doc_id: str,
    version: str,
    title: str,
    blocks: list[RawBlock],
    *,
    max_chars: int = 900,
    overlap: int = 120,
) -> list[Chunk]:
    """按 heading 切 section，section 内按字符预算合并/切分；原子块不拆。"""
    chunks: list[Chunk] = []
    parts: list[str] = []
    heading = ""
    page = 1
    sequence = 0

    def emit() -> None:
        nonlocal sequence
        body = "\n".join(parts).strip()
        parts.clear()
        if not body:
            return
        sequence += 1
        text = f"{heading}\n{body}" if heading else body
        chunks.append(Chunk(_chunk_id(doc_id, version, page, heading, sequence, text),
                            doc_id, version, title, heading, page, text))

    for block in blocks:
        kind = (block.kind or "text").strip().lower()
        text = strip_base64(block.text).strip()
        if not text:
            continue
        heading_text = _heading_of(kind, text)
        if heading_text:
            emit()
            heading, page = heading_text, block.page
            if kind in _HEADING_KINDS:
                continue
            lines = text.splitlines()
            text = "\n".join(lines[1:]).strip() if _MARKDOWN_HEADING.match(lines[0]) else text
            if not text:
                continue
        if kind in _ATOMIC_KINDS:
            if parts:
                emit()
            parts.append(text)
            page = block.page
            emit()
        elif len(text) <= max_chars:
            if parts and sum(len(part) + 1 for part in parts) + len(text) > max_chars:
                emit()
            if not parts:
                page = block.page
            parts.append(text)
        else:
            if parts:
                emit()
            for window in _windows(text, max_chars, overlap):
                sequence += 1
                body = f"{heading}\n{window}" if heading else window
                chunks.append(Chunk(_chunk_id(doc_id, version, block.page, heading, sequence, body),
                                    doc_id, version, title, heading, block.page, body))
            page = block.page
    emit()
    return chunks


def metadata_from_filename(name: str) -> dict:
    """文件名 ``<year_from>_<year_to>_<project_no>_...`` → 项目号与年份区间（H9 前置）。"""
    parts = Path(name).stem.split("_")
    if len(parts) >= 3 and parts[0].isdigit() and parts[1].isdigit():
        return {"year_from": int(parts[0]), "year_to": int(parts[1]), "project_no": parts[2]}
    return {}


def report_index_text(doc: ReportDoc) -> str:
    """Layer A 的报告级索引文本：标题 + heading + 项目号/年份。"""
    pieces = [doc.title, doc.project_no, doc.rel_path, *doc.headings]
    if doc.year_from and doc.year_to:
        pieces.append(f"{doc.year_from} {doc.year_to}")
    return " ".join(piece for piece in pieces if piece)


def _query_terms(text: str) -> list[str]:
    seen: set[str] = set()
    terms: list[str] = []
    for token in tokens(text):
        if len(token) < 2 or token in _QUERY_STOP or token in seen:
            continue
        seen.add(token)
        terms.append(token)
    return terms


def select_reports(
    chunks_by_doc: dict[str, list[Chunk]],
    reports: list[ReportDoc],
    query: str,
    *,
    config: RetrievalConfig | None = None,
    task_id: str = "task1",
    allowed_doc_ids: list[str] | None = None,
    extra_queries: list[str] | None = None,
) -> RetrievalResult:
    """两级检索主路径：报告级召回 → 报告内 chunk 精排 → 报告评分 → 去重 → 选报告。"""
    config = config or RetrievalConfig()
    terms = _query_terms(query)
    docs = [doc for doc in reports if allowed_doc_ids is None or doc.doc_id in allowed_doc_ids]
    if not terms:
        return RetrievalResult(reports=[], matched=False, reason="direct")
    if not docs:
        return RetrievalResult(reports=[], matched=False, reason="no_reports")
    queries = [terms]
    queries.extend(extra for extra in (_query_terms(text) for text in extra_queries or []) if extra)

    # S3: Layer A 的 BM25 查询词用全部查询的并集，避免只命中扩展查询的报告被漏。
    layer_a_terms = list(dict.fromkeys(term for query_terms in queries for term in query_terms))
    corpus = [tokens(report_index_text(doc)) or ["_empty_"] for doc in docs]
    scores = [float(value) for value in BM25Plus(corpus).get_scores(layer_a_terms)]
    recalled = [docs[index] for index in
                sorted(range(len(docs)), key=lambda i: (-scores[i], i))[: max(1, config.report_recall_m)]]

    # Layer B：在候选报告池内做一次 chunk 级精排，RRF 的 rank 是**池内全局排名**。
    # 若改为“每文档各自排名”，每个文档第 1 名都会得到相同 RRF，无法区分强弱命中。
    pool = [chunk for doc in recalled for chunk in chunks_by_doc.get(doc.doc_id, [])
            if chunk.version == doc.version]
    chunks_by_id = {chunk.chunk_id: chunk for chunk in pool}
    fused: dict[str, float] = {}
    if pool:
        pool_tokens = [tokens(chunk.text) or ["_empty_"] for chunk in pool]
        bm25 = BM25Plus(pool_tokens)
        for index, query_terms in enumerate(queries):
            weight = config.question_weight if index == 0 else config.keyword_weight
            query_set = set(query_terms)
            values = [float(value) for value in bm25.get_scores(query_terms)]
            ranked = sorted(range(len(pool)), key=lambda i: (-values[i], i))
            # BM25Plus adds a delta, so non-matching chunks still score > 0; require real
            # token overlap (planner: no arbitrary 2-gram intersection).
            hits = [i for i in ranked if query_set & set(pool_tokens[i])][: config.kb_chunk_topk]
            for rank, position in enumerate(hits, 1):
                chunk_id = pool[position].chunk_id
                fused[chunk_id] = fused.get(chunk_id, 0.0) + weight / (config.rrf_k + rank)
    per_doc: dict[str, list[str]] = {}
    for chunk in pool:
        if chunk.chunk_id in fused:
            per_doc.setdefault(chunk.doc_id, []).append(chunk.chunk_id)
    for doc in recalled:
        per_doc[doc.doc_id] = sorted(per_doc.get(doc.doc_id, []),
                                     key=lambda cid: (-fused[cid], cid))[: config.per_doc_cand]

    scored: list[tuple[float, float, ReportDoc, list[str]]] = []
    for doc in recalled:
        candidates = sorted(per_doc.get(doc.doc_id, []), key=lambda cid: (-fused[cid], cid))
        if not candidates:
            continue
        # 评分只用 per_doc_top_m；可引用集（SelectedReport.chunks）为 per_doc_cand。
        top = candidates[: config.per_doc_top_m]
        # S6b: 覆盖率基于 per_doc_cand（含 heading/正文）。
        hit_tokens: set[str] = set()
        for cid in candidates:
            hit_tokens.update(tokens(chunks_by_id[cid].text))
        cover = len(set(terms) & hit_tokens) / len(terms)
        scored.append((sum(fused[cid] for cid in top), cover, doc, candidates))
    if not scored:
        return RetrievalResult(reports=[], matched=False, reason="no_reports")

    if max(cover for _, cover, _, _ in scored) < config.min_term_cover:
        return RetrievalResult(reports=[], matched=False, reason="no_reports", candidates=len(scored))

    kept: list[SelectedReport] = []
    seen_projects: set[str] = set()
    for score, cover, doc, ids in sorted(scored, key=lambda row: (-row[0], row[2].doc_id)):
        project = doc.project_no or doc.doc_id  # 同项目去重：保留分最高一篇
        if project in seen_projects:
            continue
        seen_projects.add(project)
        kept.append(SelectedReport(doc=doc, score=score, term_cover=cover,
                                   chunks=[chunks_by_id[cid] for cid in ids]))
    limit = config.max_reports.get(task_id, config.max_reports.get("task1", 3))
    kept = kept[:limit]
    partial = len(kept) < config.min_reports.get(task_id, config.min_reports.get("task1", 1))
    return RetrievalResult(reports=kept, matched=True, partial=partial, candidates=len(scored))
