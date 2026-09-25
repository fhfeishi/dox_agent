"""E MVP (R1): local report storage and markdown generation.

Reports are application-level immutable artifacts keyed by ``report_id`` (#10). The table keeps
``(id, created_at, session_key, run_id, corpus_id, params, markdown)``; ``(session_key, run_id)``
is idempotent (partial unique index). Known limits: no delete; ``reports.sqlite3`` shares
``STATE_DIR`` with ``workspace.sqlite3`` (single-user), and the list ``limit`` bounds reads.
"""

import asyncio
import hashlib
import json
import re
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from .agent.evidence import validate_citations
from .agent.models import model_for
from .prompts import report_template, task_instruction
from .retrieval import assemble_reports

COLUMNS = ("session_key", "run_id", "corpus_id")
_YEAR = re.compile(r"(?<!\d)(\d{4})(?!\d)")
_LABELS = {
    "填表日期": "date", "填报日期": "date",
    "资助类别": "category", "项目类别": "category", "类别": "category",
}


def _plain_markdown(value: str) -> str:
    value = re.sub(r"^\s*(?:>\s*|[-+*]\s+|\d+[.)]\s+)+", "", value)
    value = re.sub(r"(?:\*\*|__|[*_`])", "", value)
    return value.strip()


def _label_and_value(cell: str) -> tuple[str, str] | None:
    text = _plain_markdown(cell).strip().strip("|").strip()
    match = re.match(r"^([^:：|]+?)\s*[:：]\s*(.*)$", text)
    if match:
        label = re.sub(r"[\s\u3000]", "", match.group(1))
        return (_LABELS[label], match.group(2).strip()) if label in _LABELS else None
    label = re.sub(r"[\s\u3000]", "", text)
    return (_LABELS[label], "") if label in _LABELS else None


def report_metadata(markdown: str) -> tuple[int | None, str | None, str, str]:
    """Read labelled fields from the document header, keeping repeated conflicts ambiguous."""
    values: dict[str, list[str]] = {"date": [], "category": []}
    title_block_started = False
    title_block_open = False
    for line_number, line in enumerate(markdown.splitlines()):
        if line_number >= 64:
            break
        heading = re.match(r"^\s{0,3}(#{1,6})(?:\s+|$)", line)
        if heading:
            if (len(heading.group(1)) == 1 and not any(values.values())
                    and (not title_block_started or title_block_open)):
                title_block_started = title_block_open = True
                continue
            break
        if line.strip() and title_block_started:
            title_block_open = False
        cells = line.split("|") if "|" in line else [line]
        parsed = [_label_and_value(cell) for cell in cells]
        for index, item in enumerate(parsed):
            if item is None:
                continue
            field, value = item
            if not value and index + 1 < len(cells):
                value = _plain_markdown(cells[index + 1].strip())
            if value:
                values[field].append(value)

    years: set[int] = set()
    for value in values["date"]:
        year = next((int(match.group(1)) for match in _YEAR.finditer(value)
                     if 1900 <= int(match.group(1)) <= 2100), None)
        if year is not None:
            years.add(year)
    categories = {re.sub(r"\s+", " ", value).strip() for value in values["category"] if value.strip()}
    year_status = ("ambiguous" if len(years) > 1 else "matched" if years else
                   "invalid" if values["date"] else "missing")
    category_status = ("ambiguous" if len(categories) > 1 else "matched" if categories else
                       "missing")
    year = next(iter(years)) if year_status == "matched" else None
    category = next(iter(categories)) if category_status == "matched" else None
    return year, category, year_status, category_status


def _report_metadata(markdown: str) -> tuple[int | None, str | None]:
    """Compatibility helper used by report selection."""
    year, category, _, _ = report_metadata(markdown)
    return year, category


def summarize_report_metadata(knowledge, corpus_id: str) -> dict:
    """Return field coverage and a content-free list of documents needing review."""
    docs = knowledge.all()
    date_hits = category_hits = 0
    unmatched = []
    for doc in docs:
        _, _, date_status, category_status = report_metadata(knowledge.read_markdown(doc["doc_id"]))
        date_hits += date_status == "matched"
        category_hits += category_status == "matched"
        if date_status != "matched" or category_status != "matched":
            unmatched.append({"doc_id": doc["doc_id"], "title": doc["title"], "corpus_id": corpus_id,
                              "date": date_status, "category": category_status})
    return {"corpus_id": corpus_id, "total": len(docs),
            "date": {"hits": date_hits, "missing": len(docs) - date_hits},
            "category": {"hits": category_hits, "missing": len(docs) - category_hits},
            "unmatched": unmatched}


def preflight_report(knowledge, params: dict) -> dict:
    """Select report candidates once with mutually exclusive exclusion reasons."""
    docs = knowledge.all()
    selected = set(params["doc_ids"]) if params.get("doc_ids") else None
    scoped = [doc for doc in docs if selected is None or doc["doc_id"] in selected]
    excluded = {"date": 0, "year": 0, "category": 0}
    date_hits = category_hits = 0
    eligible = []
    for doc in scoped:
        year, category, date_status, category_status = report_metadata(knowledge.read_markdown(doc["doc_id"]))
        date_hits += date_status == "matched"
        category_hits += category_status == "matched"
        if year is None:
            excluded["date"] += 1
        elif not params["year_from"] <= year <= params["year_to"]:
            excluded["year"] += 1
        elif params.get("fund_type") and category != params["fund_type"]:
            excluded["category"] += 1
        else:
            eligible.append({"doc_id": doc["doc_id"], "version": doc["version"],
                             "title": doc["title"], "corpus_id": params.get("corpus_id") or ""})
    scope = {"corpus_id": params.get("corpus_id") or "", "doc_ids": sorted(selected) if selected else None,
             "year_from": params["year_from"], "year_to": params["year_to"],
             "fund_type": params.get("fund_type") or "",
             "eligible": sorted((doc["corpus_id"], doc["doc_id"], doc["version"]) for doc in eligible)}
    fingerprint = hashlib.sha256(json.dumps(scope, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return {"total": len(scoped), "corpus_total": len(docs), "excluded": excluded,
            "date_hits": date_hits, "category_hits": category_hits,
            "eligible_count": len(eligible), "eligible": eligible, "fingerprint": fingerprint}


class ReportStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS reports ("
                "id TEXT PRIMARY KEY, created_at TEXT NOT NULL, params TEXT NOT NULL, markdown TEXT NOT NULL)")
            # M1: migrate older tables in place (idempotent; no column is missed).
            existing = {row[1] for row in db.execute("PRAGMA table_info(reports)")}
            for column in COLUMNS:
                if column not in existing:
                    db.execute(f"ALTER TABLE reports ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
            # M2: partial unique index; rows with empty run_id (legacy/manual) are excluded.
            db.execute("CREATE UNIQUE INDEX IF NOT EXISTS reports_run "
                       "ON reports(session_key, run_id) WHERE run_id != ''")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def find(self, session_key: str, run_id: str) -> dict | None:
        """M3: idempotency lookup by ``(session_key, run_id)``; empty run_id never matches."""
        if not run_id:
            return None
        with self.connect() as db:
            row = db.execute("SELECT id FROM reports WHERE session_key=? AND run_id=?",
                             (session_key or "", run_id)).fetchone()
        return self.get(row[0]) if row else None

    def save(self, report_id: str, params: dict, markdown: str, *, session_key: str = "",
             run_id: str = "", corpus_id: str = "") -> None:
        with self.connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO reports "
                "(id, created_at, params, markdown, session_key, run_id, corpus_id) VALUES (?,?,?,?,?,?,?)",
                (report_id, datetime.now(UTC).isoformat(), json.dumps(params, ensure_ascii=False),
                 markdown, session_key or "", run_id or "", corpus_id or ""))

    def get(self, report_id: str) -> dict:
        with self.connect() as db:
            row = db.execute(
                "SELECT id, created_at, params, markdown, session_key, run_id, corpus_id "
                "FROM reports WHERE id=?", (report_id,)).fetchone()
        if not row:
            raise KeyError("报告不存在")
        return {"report_id": row[0], "created_at": row[1], "params": json.loads(row[2]),
                "markdown": row[3], "session_key": row[4], "run_id": row[5], "corpus_id": row[6]}

    def list(self, *, session_key: str | None = None, run_id: str | None = None,
             limit: int = 20, offset: int = 0) -> list[dict]:
        """M4: metadata only (no markdown), ``created_at DESC``; misses return ``[]``."""
        limit = max(1, min(limit, 100))
        clauses, args = [], []
        if session_key is not None:
            clauses.append("session_key=?")
            args.append(session_key)
        if run_id is not None:
            clauses.append("run_id=?")
            args.append(run_id)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self.connect() as db:
            rows = db.execute(
                f"SELECT id, created_at, session_key, run_id, corpus_id, params FROM reports {where} "
                "ORDER BY created_at DESC LIMIT ? OFFSET ?", (*args, limit, max(0, offset))).fetchall()
        items = []
        for row in rows:
            params = json.loads(row[5])
            items.append({"report_id": row[0], "created_at": row[1], "session_key": row[2],
                          "run_id": row[3], "corpus_id": row[4],
                          "template_id": params.get("template_id", ""),
                          "template_version": params.get("template_version"),
                          "task_id": params.get("task_id", "task4"),
                          "task_version": params.get("task_version"),
                          "domain": params.get("domain", ""),
                          "year_from": params.get("year_from"), "year_to": params.get("year_to")})

        return items


async def generate_markdown(knowledge, settings, params: dict, *, llm=None,
                            template_content: str | None = None,
                            task_definition: dict | None = None,
                            visible_sources: list[dict] | None = None) -> str:
    """Generate report Markdown from the selected reports and the template instruction.

    ``template_content`` lets a published custom template's Markdown replace the built-in
    structure; variables already substituted by the caller.
    """
    template_id = params["template_id"]
    # Focus guides writing but must not silently narrow the already confirmed document scope.
    query = params.get("domain", "")
    preflight = await asyncio.to_thread(preflight_report, knowledge, params)
    if params.get("scope_fingerprint") and params["scope_fingerprint"] != preflight["fingerprint"]:
        raise ValueError("资料范围已变化，请重新预检后再生成")
    eligible_ids = [doc["doc_id"] for doc in preflight["eligible"]]
    if not eligible_ids:
        raise ValueError("所选范围内没有符合填表日期年份与基金类别的资料；缺少填表日期的资料不会纳入")
    result = await asyncio.to_thread(knowledge.retrieve, query, task_id="task4", allowed_doc_ids=eligible_ids)
    if not result.matched:
        raise ValueError("没有匹配的报告，无法生成")
    context = assemble_reports(result.reports, knowledge.read_markdown,
                               total_tokens=settings.retrieve_context_tokens,
                               report_tokens=settings.retrieve_report_tokens)
    # Report generation reads packed full documents. Chunk citations from retrieval can
    # assign several [n] labels to one document, while the writer naturally numbers the
    # visible documents. Keep the report's labels one-to-one with the text actually sent.
    visible_reports = [report for report in context.reports if report["markdown"].strip()]
    if not visible_reports:
        raise ValueError("所选报告在上下文预算内没有可读正文，请缩小资料范围")
    sources = [{"citation": index, "doc_id": report["doc"].doc_id,
                "title": report["doc"].title, "version": report["doc"].version,
                "page": None,
                "url": f"/api/documents/{report['doc'].doc_id}?version={report['doc'].version}"}
               for index, report in enumerate(visible_reports, 1)]
    if visible_sources is not None:
        visible_sources.extend(sources)
    model = llm or model_for(settings)
    header = (f"领域：{params['domain']}\n填表日期年份（报告提交时间）：{params['year_from']}–{params['year_to']}\n"
              "填表日期来源：文档解析文本，未逐份对照原 PDF\n"
              f"所选资料元数据覆盖：{preflight['total']} 份；填表日期命中 {preflight['date_hits']}、缺失/歧义 {preflight['total'] - preflight['date_hits']}；"
              f"资助类别命中 {preflight['category_hits']}、缺失/歧义 {preflight['total'] - preflight['category_hits']}\n"
              f"填表日期缺失资料（未纳入，所选范围内）：{preflight['excluded']['date']}\n"
              f"资助类别缺失资料（所选范围内）：{preflight['total'] - preflight['category_hits']}\n"
              f"模板：{template_id}\n基金类别：{params.get('fund_type') or '不限'}\n"
              f"分析重点：{params.get('focus') or '无'}")
    brief = (f"写作目的：{params.get('purpose') or '研究进展梳理'}\n"
             f"目标读者：{params.get('audience') or '专业研究人员'}\n"
             f"预期篇幅：{params.get('length') or '标准篇幅'}\n"
             f"已核定候选资料：{preflight['eligible_count']} 份；本次实际入模全文 {len(visible_reports)} 份。"
             "实际引用须来自下方编号原文；每个 [n] 指向一份文档，不代表检索片段编号。"
             "未入模候选不得推断为正文为空或无成果。")
    reports_text = "\n\n".join(
        f"[{index}] {report['header']}\n<report>\n{report['markdown']}\n</report>"
        for index, report in enumerate(visible_reports, 1))
    custom_instruction = ""
    if task_definition:
        fields = (("背景", "background"), ("目标", "goal"), ("具体要求", "requirements"),
                  ("边界", "boundaries"), ("澄清条件", "clarification_conditions"),
                  ("输出要求", "output_instructions"))
        custom_instruction = "\n\n发布任务约束：\n" + "\n".join(
            f"{label}：{task_definition.get(key, '')}" for label, key in fields
            if task_definition.get(key))
        task_values = params.get("task_params") or {}
        if task_values:
            # The API has already resolved these against the immutable task version. They guide
            # writing, while the server's corpus/date/category filter remains authoritative.
            labels = {item["key"]: item["label"] for item in task_definition.get("parameters", [])}
            custom_instruction += "\n本次任务输入（仅影响写作，不放宽资料范围）：\n" + "\n".join(
                f"{labels.get(key, key)}（{key}）：{value}" for key, value in task_values.items())
    messages = [
        SystemMessage(content=task_instruction("task4", phase="report") + custom_instruction
                      + "\n\n直接完成最终 Markdown，由你在内部组织章节与执行摘要，无需用户审批大纲。"
                        "先写有来源的核心发现，说明筛选边界、相互冲突的证据和局限。"
                        "每个关键事实用下方存在的 [n] 编号引用；不能编造来源、数据或应用成效。"
                        "没有足够资料的结论写明资料不足，推断明确标注。提交前核对引用编号。"
                      + "\n\n模板章节：\n" + (template_content if template_content is not None
                                              else report_template(template_id))),
        HumanMessage(content=brief + "\n\n已核定范围：\n" + header + "\n\n可引用原文证据：\n" + reports_text),
    ]
    def valid(markdown: str) -> bool:
        return bool(re.search(r"(?m)^# .+\n", markdown) and re.search(r"(?m)^## .+", markdown)
                    and re.search(r"\[\d{1,3}\]", markdown)
                    and not validate_citations(markdown, sources))

    def with_sources(markdown: str) -> str:
        lines = []
        for source in sources:
            page = f"，第{source['page']}页" if source.get("page") else ""
            lines.append(f"[{source['citation']}] {source['title']}"
                         f"（文档 {source['doc_id']}，版本 {source['version']}{page}）")
        appendix = "\n\n## 来源附录（系统记录）\n" + "\n".join(lines)
        return markdown.rstrip() + appendix + "\n"

    async with asyncio.timeout(settings.run_timeout):
        response = await model.ainvoke(messages)
        if (getattr(response, "response_metadata", None) or {}).get("finish_reason") == "length":
            raise ValueError("报告达到模型输出长度上限，未保存截断正文；请缩小篇幅或资料范围")
        content = response.content if isinstance(response.content, str) else str(response.content)
        if valid(content):
            return with_sources(content)
        repair = HumanMessage(content="上一个报告存在标题、章节或来源编号问题。请依据同一批证据重写完整最终报告；"
                                      "标题使用 #、章节使用 ##，关键事实引用有效的 [n] 编号。"
                                      "上一稿仅作待修复草稿：\n" + content)
        response = await model.ainvoke([*messages, repair])
        if (getattr(response, "response_metadata", None) or {}).get("finish_reason") == "length":
            raise ValueError("报告达到模型输出长度上限，未保存截断正文；请缩小篇幅或资料范围")
        content = response.content if isinstance(response.content, str) else str(response.content)
    if not valid(content):
        raise ValueError("报告引用或结构校验失败，请检查来源与模型输出后重试")
    return with_sources(content)
