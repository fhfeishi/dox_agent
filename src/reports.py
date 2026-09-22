"""E MVP (R1): local report storage and markdown generation.

Reports are application-level immutable artifacts keyed by ``report_id`` (#10). The table keeps
``(id, created_at, session_key, run_id, corpus_id, params, markdown)``; ``(session_key, run_id)``
is idempotent (partial unique index). Known limits: no delete; ``reports.sqlite3`` shares
``STATE_DIR`` with ``workspace.sqlite3`` (single-user), and the list ``limit`` bounds reads.
"""

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from .agent.models import model_for
from .prompts import report_template, task_instruction
from .retrieval import assemble_reports

COLUMNS = ("session_key", "run_id", "corpus_id")


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
    result = knowledge.retrieve(query, task_id="task4", allowed_doc_ids=params.get("doc_ids") or None)
    if not result.matched:
        raise ValueError("没有匹配的报告，无法生成")
    context = assemble_reports(result.reports, knowledge.read_markdown,
                               total_tokens=settings.retrieve_context_tokens,
                               report_tokens=settings.retrieve_report_tokens)
    model = llm or model_for(settings)
    header = (f"领域：{params['domain']}\n年份：{params['year_from']}–{params['year_to']}\n"
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
