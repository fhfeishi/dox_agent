"""E MVP (R1): local report storage and markdown generation.

Reports are application-level immutable artifacts keyed by ``report_id`` (#10). The table keeps
``(id, created_at, session_key, run_id, corpus_id, params, markdown)``; ``(session_key, run_id)``
is idempotent (partial unique index). Known limits: no delete; ``reports.sqlite3`` shares
``STATE_DIR`` with ``workspace.sqlite3`` (single-user), and the list ``limit`` bounds reads.
"""

import asyncio
import json
import re
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

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
             limit: int = 20) -> list[dict]:
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
                "ORDER BY created_at DESC LIMIT ?", (*args, limit)).fetchall()
        items = []
        for row in rows:
            params = json.loads(row[5])
            items.append({"report_id": row[0], "created_at": row[1], "session_key": row[2],
                          "run_id": row[3], "corpus_id": row[4],
                          "template_id": params.get("template_id", ""),
                          "domain": params.get("domain", ""),
                          "year_from": params.get("year_from"), "year_to": params.get("year_to")})
        return items


async def generate_markdown(knowledge, settings, params: dict, *, llm=None) -> str:
    """Generate report Markdown from the selected reports and the template instruction."""
    template_id = params["template_id"]
    query = " ".join(part for part in (params.get("domain", ""), params.get("focus", "")) if part)
    selected_ids = set(params["doc_ids"]) if params.get("doc_ids") else None
    eligible_ids = []
    unknown_year = 0
    unknown_category = 0
    date_hits = category_hits = total = 0
    for doc in await asyncio.to_thread(knowledge.all):
        if selected_ids is not None and doc["doc_id"] not in selected_ids:
            continue
        total += 1
        year, category, date_status, category_status = report_metadata(
            await asyncio.to_thread(knowledge.read_markdown, doc["doc_id"]))
        date_hits += date_status == "matched"
        category_hits += category_status == "matched"
        if year is None:
            unknown_year += 1
        if category is None:
            unknown_category += 1
        if year is None:
            continue
        if not params["year_from"] <= year <= params["year_to"]:
            continue
        if params.get("fund_type") and (category is None or category != params["fund_type"]):
            continue
        eligible_ids.append(doc["doc_id"])
    if not eligible_ids:
        raise ValueError("所选范围内没有符合填表日期年份与基金类别的资料；缺少填表日期的资料不会纳入")
    result = await asyncio.to_thread(knowledge.retrieve, query, task_id="task4", allowed_doc_ids=eligible_ids)
    if not result.matched:
        raise ValueError("没有匹配的报告，无法生成")
    context = assemble_reports(result.reports, knowledge.read_markdown,
                               total_tokens=settings.retrieve_context_tokens,
                               report_tokens=settings.retrieve_report_tokens)
    model = llm or model_for(settings)
    header = (f"领域：{params['domain']}\n填表日期年份（报告提交时间）：{params['year_from']}–{params['year_to']}\n"
              "填表日期来源：文档解析文本，未逐份对照原 PDF\n"
              f"所选资料元数据覆盖：{total} 份；填表日期命中 {date_hits}、缺失/歧义 {total - date_hits}；"
              f"资助类别命中 {category_hits}、缺失/歧义 {total - category_hits}\n"
              f"填表日期缺失资料（未纳入，所选范围内）：{unknown_year}\n"
              f"资助类别缺失资料（所选范围内）：{unknown_category}\n"
              f"模板：{template_id}\n基金类别：{params.get('fund_type') or '不限'}\n"
              f"分析重点：{params.get('focus') or '无'}")
    reports_text = "\n\n".join(
        f"{report['header']}\n<report>\n{report['markdown']}\n</report>" for report in context.reports)
    messages = [
        SystemMessage(content=task_instruction("task4", phase="report")
                      + "\n\n模板章节：\n" + report_template(template_id)),
        HumanMessage(content=header + "\n\n可引用原文证据：\n" + reports_text),
    ]
    response = await model.ainvoke(messages)
    content = response.content
    return content if isinstance(content, str) else str(content)
