"""E MVP (R1): local report storage and markdown generation.

Consumes the L retrieval output (selected reports + full markdown) and a report template to
generate Markdown. Storage is app-level, keyed by ``report_id``; an optional ``session_key`` is
recorded but not required (design item #10 is still open — see .logsdev/ITERATION.md §4).
"""

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from .agent.models import model_for
from .prompts import report_template, task_instruction
from .retrieval import assemble_reports


class ReportStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS reports ("
                "id TEXT PRIMARY KEY, created_at TEXT NOT NULL, params TEXT NOT NULL, markdown TEXT NOT NULL)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def save(self, report_id: str, params: dict, markdown: str) -> None:
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO reports VALUES (?, ?, ?, ?)",
                       (report_id, datetime.now(UTC).isoformat(),
                        json.dumps(params, ensure_ascii=False), markdown))

    def get(self, report_id: str) -> dict:
        with self.connect() as db:
            row = db.execute("SELECT id, created_at, params, markdown FROM reports WHERE id=?",
                             (report_id,)).fetchone()
        if not row:
            raise KeyError("报告不存在")
        return {"report_id": row[0], "created_at": row[1], "params": json.loads(row[2]), "markdown": row[3]}


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
