"""Period work summaries for the leader and admin views (query 2026-1013 1801).

The server gathers what happened in a period — analysis reports and review tasks — and counts it
into charts. The model only writes the text sections from those facts (``prompts/period_summary.md``);
every number in the saved report comes from the counting here, drawn as ```dox-chart blocks.
"""
import asyncio
import json
import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from .hierarchy import _json_object

# One set of rolling windows ending today (query 2026-1014 1716): days counted back, today included.
PERIODS = {"week": "一周内", "month": "一个月内", "quarter": "一个季度内", "half": "半年内", "year": "一年内"}
DAYS = {"week": 7, "month": 30, "quarter": 90, "half": 180, "year": 365}
# Long windows are charted by month, short ones by day.
MONTHLY = ("quarter", "half", "year")
PROMPT = (Path(__file__).parent / "prompts" / "period_summary.md").read_text(encoding="utf-8")
SECTIONS = (("focus", "关注重点"), ("connections", "结论之间的联系"), ("done", "已形成结论的工作"),
            ("in_progress", "进行中与尚无结论的工作"), ("gaps", "遗漏与待完善"))
TASK_ID = "period_summary"


def period_start(period: str, now: datetime) -> datetime:
    """Local midnight of the window's first day: the last 7, 30, 90, 180 or 365 days including today."""
    if period not in DAYS:
        raise ValueError("未知时间段")
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return day - timedelta(days=DAYS[period] - 1)


def _when(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed.astimezone()  # stored UTC times and naive local times both become local time


def local_day(value: str | None) -> str:
    """The local calendar day of a stored time; stored UTC times otherwise land on yesterday before 08:00."""
    when = _when(value)
    return when.date().isoformat() if when else ""


def _excerpt(markdown: str, limit: int = 800) -> str:
    text = re.sub(r"```[\s\S]*?```", "", markdown)
    text = re.sub(r"\[\d+\]", "", text)
    return re.sub(r"\s+", " ", text).strip()[:limit]


KINDS = {"formal": "形式审查", "professional": "专业审查"}
REPORT_KINDS = ("分析报告", "情报分析", "保存的回答")


def report_kind(row: dict) -> str:
    if row.get("type") == "answer_snapshot":
        return "保存的回答"
    return "情报分析" if row.get("task_id") == "intelligence" else "分析报告"


def in_period(period: str, now: datetime, value: str | None) -> bool:
    start = period_start(period, now)
    return (t := _when(value)) is not None and start <= t <= now


def owned_runs(runs: list[dict], owners: list[str] | None) -> list[dict]:
    return runs if owners is None else [r for r in runs if (r.get("created_by") or "") in owners]


def owner_label(owners: list[str] | None) -> str:
    if owners is None:
        return "全部账户"
    named = [o for o in owners if o]
    return f"账户 {'、'.join(named)}" + ("（含未记录生成人的早期记录）" if "" in owners else "")


def gather(period: str, now: datetime, reports: list[dict], runs: list[dict], names: dict[str, str], owner: str = "全部账户") -> dict:
    """Facts of the period: reports (with body excerpts) and review tasks, newest first.

    节点审查 A4: repeated reviews of one application (same file content) in one kind count once (the
    newest, with how many runs it took). The caller passes one account's records (query 2026-1023
    1044); an answer saved to 报告中心 is work of the period as much as a generated report.
    """
    start = period_start(period, now)
    inside = lambda value: in_period(period, now, value)
    short = lambda cid: names.get(cid, cid).replace("自然科学基金-", "")
    report_date = lambda r: r.get("updated_at") or r.get("created_at")
    run_date = lambda r: r.get("finished_at") or r.get("created_at")
    picked_reports = [{"id": r.get("artifact_id", ""), "title": r.get("title") or "分析报告", "kind": report_kind(r),
                       "domains": [short(c) for c in r.get("corpus_ids") or []],
                       "date": local_day(report_date(r)),
                       "state": "已完成" if r.get("status") == "completed" else "未完成" if r.get("status") == "failed" else "进行中",
                       "excerpt": _excerpt(r.get("markdown") or "")}
                      for r in reports if r.get("task_id") != TASK_ID and inside(report_date(r))]
    latest: dict[tuple, dict] = {}
    for r in sorted((r for r in runs if inside(run_date(r))), key=lambda r: run_date(r) or "", reverse=True):
        document = r.get("document") or {}
        kind = KINDS.get((r.get("request") or {}).get("kind"), "资料审查")  # runs from before the two kinds
        # The same file uploaded again gets a new document id; its content hash says it is one application.
        versions = r.get("input_versions") or [{}]
        key = (versions[0].get("sha256") or document.get("id") or r.get("id"), kind)
        if key in latest:
            latest[key]["runs"] += 1
            continue
        latest[key] = {"id": r.get("id", ""), "title": document.get("metadata", {}).get("title") or document.get("filename") or "申请书",
                       "kind": kind, "domains": [short(c) for c in (r.get("request") or {}).get("corpus_ids") or []],
                       "date": local_day(run_date(r)),
                       "state": {"completed": "已完成", "failed": "未完成"}.get(r.get("status"), "进行中"),
                       "issues": (r.get("summary") or {}).get("issue"), "runs": 1}
    return {"period": PERIODS[period], "start": start.date().isoformat(), "end": now.date().isoformat(), "owner": owner,
            "reports": sorted(picked_reports, key=lambda r: r["date"], reverse=True),
            "reviews": sorted(latest.values(), key=lambda r: r["date"], reverse=True)}


def charts(facts: dict, scenes_of) -> list[dict]:
    """Counted charts: work by domain, by kind, over time, and the busiest domain's field focus."""
    items = facts["reports"] + facts["reviews"]
    by_domain: dict[str, int] = {}
    for item in items:
        for domain in item["domains"]:
            by_domain[domain] = by_domain.get(domain, 0) + 1
    out = []
    if len(by_domain) > 1:  # one bar says nothing a sentence does not (节点审查 A4)
        ranked = sorted(by_domain.items(), key=lambda kv: (-kv[1], kv[0]))[:8]
        out.append({"type": "bar", "title": "各领域的工作量", "labels": [k for k, _ in ranked], "values": [v for _, v in ranked], "unit": " 项",
                    "note": "分析报告与审查任务按所涉资料库计；形式审查不关联资料库"})
    # 分析报告 and the two review kinds always show; 情报分析 and saved answers only when there are some.
    reported = [(k, sum(r["kind"] == k for r in facts["reports"])) for k in REPORT_KINDS]
    kinds = [*[(k, v) for k, v in reported if v or k == "分析报告"],
             *[(k, sum(r["kind"] == k for r in facts["reviews"])) for k in ("形式审查", "专业审查")]]
    if any(r["kind"] == "资料审查" for r in facts["reviews"]):
        kinds.append(("资料审查", sum(r["kind"] == "资料审查" for r in facts["reviews"])))
    if sum(1 for _, v in kinds if v) > 1:
        out.append({"type": "bar", "title": "工作类型", "labels": [k for k, _ in kinds], "values": [v for _, v in kinds], "unit": " 项"})
    dates = sorted({item["date"] for item in items if item["date"]})
    if len(dates) > 1:
        monthly = facts["period"] in {PERIODS[key] for key in MONTHLY}
        key = (lambda d: d[:7]) if monthly else (lambda d: d)
        buckets: dict[str, int] = {}
        for item in items:
            if item["date"]:
                buckets[key(item["date"])] = buckets.get(key(item["date"]), 0) + 1
        out.append({"type": "bar", "title": "按月产出" if monthly else "按日产出", "labels": list(buckets), "values": list(buckets.values()), "unit": " 项"})
    if by_domain:
        busiest = max(by_domain.items(), key=lambda kv: (kv[1], kv[0]))[0]
        focus = scenes_of(busiest)
        scenes = focus.get("fields") or []
        if len(scenes) >= 3:
            out.append({"type": "radar", "title": f"{busiest} · 应用领域分布", "labels": [s for s, _ in scenes], "values": [n for _, n in scenes], "unit": " 项",
                        # The outer ring is the library's project total, so the radius is a real share (query 2026-1016 1613).
                        "max": focus.get("total") or None,
                        "note": f"该资料库有技术服务于各应用领域的项目数，一个项目可计入多处；{focus.get('outside', 0)} 个项目的技术都未判定领域，"
                                f"不在图中（共 {focus.get('total', 0)} 个项目）。反映本期工作所在领域的整体结构"})
    return out


def markdown(facts: dict, text: dict, figures: list[dict]) -> str:
    """The saved report: headline, charts, the model's sections, then how it was counted."""
    lines = [f"# 工作总结 · {facts['period']}（{facts['start']} 至 {facts['end']}）", "", str(text.get("headline") or "").strip(), ""]
    lines += ["## 数据概览", ""] if figures else []
    for figure in figures:
        lines += ["```dox-chart", json.dumps(figure, ensure_ascii=False), "```", ""]
    for key, title in SECTIONS:
        points = [str(p).strip() for p in text.get(key) or [] if str(p).strip()]
        lines += [f"## {title}", ""] + ([f"- {p}" for p in points] or ["- 本期无可写内容。"]) + [""]
    suggestions = [s for s in text.get("suggestions") or [] if isinstance(s, dict) and s.get("issue")]
    lines += ["## 问题与建议", ""] + ([f"- **{s['issue']}**：{s.get('proposal', '')}" for s in suggestions] or ["- 本期无。"]) + [""]
    lines += ["## 统计口径", "",
              f"- 时间段按真实日期计：{facts['start']} 至 {facts['end']}；报告 {len(facts['reports'])} 份（含保存的回答），审查任务 {len(facts['reviews'])} 项。",
              f"- 统计范围：{facts['owner']}。",
              "- 图表数字由系统统计；文字部分由模型依据上述报告与任务撰写，需人工核对。", ""]
    return "\n".join(lines)


def report_rows(store, owners: list[str] | None) -> list[dict]:
    """Every active report and saved answer of these accounts, page by page: a period count must not
    stop at a list limit (节点审查 A5)."""
    rows, cursor = [], None
    while True:
        page = store.list(limit=200, cursor=cursor, owners=owners)
        rows += page
        if len(page) < 200:
            return rows
        cursor = page[-1]["cursor"]


async def generate(app, period: str, model, owners: list[str] | None) -> dict:
    """Gather, count, ask the model for the text, and save the summary as a report.

    The summary is a report record from the moment it starts (card B1): 报告中心 shows it as 生成中, a
    page closed meanwhile does not lose it, a failure says why, and a restart marks it 已中断."""
    from .agent.corpora import scan_corpora
    from .review import storage as review_db

    settings = app.state.settings
    store = app.state.artifacts
    infos = scan_corpora(settings)
    names = {info.id: info.name for info in infos}
    now = datetime.now().astimezone()
    rows = [r for r in report_rows(store, owners) if r["status"] == "completed"
            and in_period(period, now, r.get("updated_at") or r.get("created_at"))]
    reports = [store.get(row["artifact_id"]) for row in rows]  # bodies for the excerpts
    facts = gather(period, now, reports, owned_runs(review_db.all_items("run"), owners), names, owner_label(owners))

    def scenes_of(short_name: str) -> dict:
        info = next((i for i in infos if i.name.replace("自然科学基金-", "") == short_name), None)
        if not info:
            return {}
        try:
            value = json.loads((info.root / "lineage.json").read_text(encoding="utf-8"))
        except (OSError, UnicodeError, ValueError):
            return {}
        # Same base as the views: unique projects with technique items serving each field.
        items = list((value.get("items") or {}).values())
        names = {f.get("name") for f in value.get("fields") or []}
        projects = {i.get("project_id") for i in items}
        placed = {i.get("project_id") for i in items if i.get("field") in names}
        return {"fields": [(f.get("name", ""), len({i.get("project_id") for i in items if i.get("field") == f.get("name")}))
                           for f in value.get("fields") or []],
                "outside": len(projects - placed), "total": len(projects)}

    figures = charts(facts, scenes_of)
    for_model = {**facts, **{key: [{k: v for k, v in item.items() if k != "id"} for item in facts[key]]
                                for key in ("reports", "reviews")}}
    domains = {d for item in facts["reports"] + facts["reviews"] for d in item["domains"]}
    corpus_ids = [info.id for info in infos if info.name.replace("自然科学基金-", "") in domains]
    run_id = "summary-" + uuid.uuid4().hex
    params = {"focus": f"工作总结 · {facts['period']}（{facts['start']} 至 {facts['end']}）", "domain": "工作总结",
              "task_id": TASK_ID, "period": period, "corpus_ids": corpus_ids}
    artifact = await asyncio.to_thread(store.begin_report, run_id, params)
    try:
        response = await model.ainvoke([SystemMessage(content=PROMPT), HumanMessage(content=json.dumps(for_model, ensure_ascii=False))])
        body = markdown(facts, _json_object(response.content), figures)
        await asyncio.to_thread(store.finish_report, run_id, params, body, [])
    except BaseException as exc:  # timeouts and cancellation included: the record must not stay 生成中
        reason = str(exc) if isinstance(exc, ValueError) else "生成已中断" if isinstance(exc, (asyncio.CancelledError, TimeoutError)) else "模型调用失败"
        await asyncio.shield(asyncio.to_thread(store.record_failed_report, run_id=run_id, reason=reason))
        raise
    return await asyncio.to_thread(store.get, artifact["artifact_id"])
