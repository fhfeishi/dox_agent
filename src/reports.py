"""Report scope validation and generation; outcomes live in ArtifactStore."""

import asyncio
import hashlib
import json
import re
from itertools import pairwise
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from .agent.evidence import validate_citations
from .agent.models import model_for
from .prompts import report_template, task_instruction
from .retrieval import ReportDoc, assemble_reports, estimate_tokens, metadata_from_filename

COLUMNS = ("session_key", "run_id", "corpus_id")


class ScopeChanged(ValueError):
    """The confirmed evidence scope changed before the model could use it."""


_LABELS = {
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


def report_category(markdown: str) -> tuple[str | None, str]:
    """Read the explicit fund category from the header; conflicting labels stay ambiguous."""
    values: list[str] = []
    title_block_started = False
    title_block_open = False
    for line_number, line in enumerate(markdown.splitlines()):
        if line_number >= 64:
            break
        heading = re.match(r"^\s{0,3}(#{1,6})(?:\s+|$)", line)
        if heading:
            if (len(heading.group(1)) == 1 and not values
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
            _, value = item
            if not value and index + 1 < len(cells):
                value = _plain_markdown(cells[index + 1].strip())
            if value:
                values.append(value)

    categories = {re.sub(r"\s+", " ", value).strip() for value in values if value.strip()}
    category_status = ("ambiguous" if len(categories) > 1 else "matched" if categories else
                       "missing")
    category = next(iter(categories)) if category_status == "matched" else None
    return category, category_status


def project_period(origin: str) -> tuple[int | None, int | None]:
    """Use only the current filename contract for project years."""
    meta = metadata_from_filename(Path(origin).name)
    start, end = meta.get("year_from"), meta.get("year_to")
    if start is None or end is None or not 1900 <= start <= end <= 2100:
        return None, None
    return start, end


def review_segments(markdown: str, max_chars: int = 6000) -> list[tuple[int, int, str]]:
    """Cover parsed text by section, splitting oversized sections without dropping chars."""
    boundaries = sorted({0, len(markdown), *[match.start() for match in
                                           re.finditer(r"(?m)^#{1,6}\s", markdown)]})
    pieces = []
    for left, right in pairwise(boundaries):
        for start in range(left, right, max_chars):
            end = min(start + max_chars, right)
            if markdown[start:end].strip():
                pieces.append((start, end))
    # One model call per tiny heading is prohibitively slow on real reports. Pack adjacent
    # sections while preserving their exact character ranges for evidence tracing.
    packed: list[tuple[int, int]] = []
    for start, end in pieces:
        if packed and start == packed[-1][1] and end - packed[-1][0] <= max_chars:
            packed[-1] = (packed[-1][0], end)
        else:
            packed.append((start, end))
    return [(start, end, markdown[start:end]) for start, end in packed]


def summarize_report_metadata(knowledge, corpus_id: str) -> dict:
    """Return field coverage and a content-free list of documents needing review."""
    docs = knowledge.current()
    period_hits = category_hits = 0
    unmatched = []
    for doc in docs:
        start, end = project_period(doc["origin"])
        _, category_status = report_category(knowledge.read_markdown(doc["doc_id"]))
        period_status = "matched" if start is not None and end is not None else "missing"
        period_hits += period_status == "matched"
        category_hits += category_status == "matched"
        if period_status != "matched" or category_status != "matched":
            unmatched.append({"doc_id": doc["doc_id"], "title": doc["title"], "corpus_id": corpus_id,
                              "period": period_status, "category": category_status})
    return {"corpus_id": corpus_id, "total": len(docs),
            "period": {"hits": period_hits, "missing": len(docs) - period_hits},
            "category": {"hits": category_hits, "missing": len(docs) - category_hits},
            "unmatched": unmatched}


def preflight_report(knowledge, params: dict) -> dict:
    """Select report candidates once with mutually exclusive exclusion reasons."""
    docs = knowledge.current()
    stored = knowledge.all()
    selected = set(params["doc_ids"]) if params.get("doc_ids") else None
    scoped = [doc for doc in docs if selected is None or doc["doc_id"] in selected]
    current_ids = {doc["doc_id"] for doc in docs}
    stale = [doc for doc in stored if doc["doc_id"] not in current_ids
             and (selected is None or doc["doc_id"] in selected)]
    excluded = {"period": 0, "year": 0, "category": 0, "stale": len(stale)}
    period_hits = category_hits = 0
    eligible = []
    reasons: list[dict] = [{"doc_id": doc["doc_id"], "title": doc["title"], "reason": "stale", "period": ""}
                           for doc in stale]
    observed: set[int] = set()
    for doc in scoped:
        try:
            markdown = knowledge.read_markdown(doc["doc_id"], doc["version"])
        except (KeyError, ValueError) as exc:
            raise ScopeChanged("资料在预检期间发生变化，请重新预检") from exc
        start, end = project_period(doc["origin"])
        category, category_status = report_category(markdown)
        period_hits += start is not None
        category_hits += category_status == "matched"
        if start is not None and end is not None:
            observed.update((start, end))
        if start is None or end is None:
            excluded["period"] += 1
            reason = "period"
        elif end < params["year_from"] or start > params["year_to"]:
            excluded["year"] += 1
            reason = "year"
        elif params.get("fund_type") and category != params["fund_type"]:
            excluded["category"] += 1
            reason = "category"
        else:
            eligible.append({"doc_id": doc["doc_id"], "version": doc["version"],
                             "source_sha256": doc.get("source_sha256", ""),
                             "title": doc["title"], "corpus_id": params.get("corpus_id") or "",
                             "project_year_from": start, "project_year_to": end})
            continue
        reasons.append({"doc_id": doc["doc_id"], "title": doc["title"], "reason": reason,
                        "period": f"{start}–{end}" if start and end else ""})
    scope = {"corpus_id": params.get("corpus_id") or "", "doc_ids": sorted(selected) if selected else None,
             "year_basis": "project_period_overlap",
             "year_from": params["year_from"], "year_to": params["year_to"],
             "fund_type": params.get("fund_type") or "",
             "eligible": sorted((doc["corpus_id"], doc["doc_id"], doc["version"], doc["source_sha256"])
                                for doc in eligible),
             "stale": sorted((doc["doc_id"], doc["version"]) for doc in stale)}
    fingerprint = hashlib.sha256(json.dumps(scope, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    observed_years = sorted(observed)
    hint = ""
    if scoped:
        if eligible and excluded["period"]:
            hint = (f"另有 {excluded['period']} 份资料因文件名缺少有效项目起止年份未纳入；"
                    "请按项目起止年份重命名文件后刷新资料。")
        elif eligible:
            hint = ""
        elif excluded["period"] == len(scoped):
            hint = ("所选资料的文件名都没有有效项目起止年份；"
                    "请按 <起年>_<止年>_<项目号>_<负责人>_<标题> 命名后刷新资料。")
        elif excluded["year"]:
            span = f"{min(observed_years)}–{max(observed_years)}" if observed_years else "无"
            hint = (f"有 {excluded['year']} 份资料的项目区间与 {params['year_from']}–{params['year_to']} 不相交"
                    f"（库中项目起止年份覆盖 {span}）；请调整年份或资料范围。")
        elif excluded["category"]:
            hint = (f"有 {excluded['category']} 份资料因资助类别与「{params.get('fund_type')}」不符被排除；"
                    "可将类别改为不限后重试。")
    if stale and not hint:
        hint = f"另有 {len(stale)} 份源文件已变化或不可用，需刷新或修复后才能用于新报告。"
    return {"total": len(scoped) + len(stale), "corpus_total": len(stored), "excluded": excluded,
            "period_hits": period_hits, "category_hits": category_hits,
            "eligible_count": len(eligible), "eligible": eligible, "fingerprint": fingerprint,
            "reasons": reasons, "observed_years": observed_years, "hint": hint}


async def generate_markdown(knowledge, settings, params: dict, *, llm=None,
                            template_content: str | None = None,
                            task_definition: dict | None = None,
                            visible_sources: list[dict] | None = None) -> str:
    """Generate report Markdown from the selected reports and the template instruction.

    ``template_content`` lets a published custom template's Markdown replace the built-in
    structure; variables already substituted by the caller. ``params["hierarchy_record"]`` is the
    library's stored scene hierarchy (需求 §17 R-SCN-07); the server renders it from that frozen
    record and replaces the key with a small snapshot, so the model never rewrites it.
    """
    hierarchy_record = params.pop("hierarchy_record", None)
    template_id = params["template_id"]
    # Focus adds retrieval candidates inside the confirmed year/document scope; it is not a scope filter.
    query = params.get("domain", "")
    preflight = await asyncio.to_thread(preflight_report, knowledge, params)
    if params.get("scope_fingerprint") and params["scope_fingerprint"] != preflight["fingerprint"]:
        raise ScopeChanged("资料范围已变化，请重新预检后再生成")
    eligible_ids = [doc["doc_id"] for doc in preflight["eligible"]]
    if not eligible_ids:
        raise ValueError("所选范围内没有项目区间与年份窗口相交且符合基金类别的资料")
    model = llm or model_for(settings)
    deadline = asyncio.get_running_loop().time() + settings.run_timeout
    if params.get("report_mode", "theme") == "review":
        # Freeze all eligible parsed bodies before the first model call. A review cannot
        # quietly fall back to task4's top-10 retrieval or its excerpt budget.
        try:
            frozen = [(doc, await asyncio.to_thread(knowledge.read_markdown, doc["doc_id"], doc["version"]))
                      for doc in preflight["eligible"]]
        except (KeyError, ValueError) as exc:
            raise ScopeChanged("资料在读取期间发生变化，请重新预检后生成") from exc
        current = await asyncio.to_thread(preflight_report, knowledge, params)
        if current["fingerprint"] != preflight["fingerprint"]:
            raise ScopeChanged("资料在读取期间发生变化，请重新预检后生成")
        if any(not body.strip() for _, body in frozen):
            raise ValueError("合格资料存在空正文，不能标记为全集综述")
        visible_reports = []
        coverage_docs = []
        for doc, body in frozen:
            pieces = review_segments(body)
            summaries = []
            for index, (start, end, piece) in enumerate(pieces, 1):
                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    raise ValueError("资料摘要超过本次运行时限，不能标记为全集综述")
                try:
                    response = await asyncio.wait_for(model.ainvoke([
                        SystemMessage(content="仅概括提供的原文段落，保留具体事实、数字、分歧与不确定处。不得补充段落外事实。"),
                        HumanMessage(content=f"资料：{doc['title']}；章节段 {index}/{len(pieces)}；解析文本字符 {start + 1}–{end}。\n{piece}"),
                    ]), timeout=remaining)
                except TimeoutError as exc:
                    raise ValueError("资料摘要超过本次运行时限，不能标记为全集综述") from exc
                if (getattr(response, "response_metadata", None) or {}).get("finish_reason") == "length":
                    raise ValueError("资料摘要被截断，不能标记为全集综述")
                summary = response.content if isinstance(response.content, str) else str(response.content)
                if not summary.strip():
                    raise ValueError("资料摘要为空，不能标记为全集综述")
                summaries.append(f"原文字符 {start + 1}–{end}：{summary.strip()}")
            visible_reports.append({"doc": ReportDoc(doc["doc_id"], doc["version"], doc["title"]),
                                    "header": doc["title"], "markdown": "\n".join(summaries)})
            coverage_docs.append({"doc_id": doc["doc_id"], "version": doc["version"],
                                  "segments_total": len(pieces), "segments_processed": len(summaries),
                                  "source_ranges": [[start + 1, end] for start, end, _ in pieces]})
        if estimate_tokens("\n".join(item["markdown"] for item in visible_reports)) > settings.retrieve_context_tokens:
            raise ValueError("全部资料摘要超过本次模型上下文预算，请缩小年份或限定资料")
        params["coverage"] = {"eligible": len(frozen), "text_processed": len(frozen),
                              "segments_processed": sum(item["segments_processed"] for item in coverage_docs),
                              "summaries_in_model": len(visible_reports), "uncovered": 0,
                              "documents": coverage_docs}
    else:
        result = await asyncio.to_thread(
            knowledge.retrieve, query, task_id="task4", allowed_doc_ids=eligible_ids,
            extra_queries=[params["focus"]] if params.get("focus") else None)
        if not result.matched:
            raise ValueError("没有匹配的报告，无法生成；可选择合格资料综述")
        try:
            context = assemble_reports(result.reports, knowledge.read_markdown,
                                       total_tokens=settings.retrieve_context_tokens,
                                       report_tokens=settings.retrieve_report_tokens)
        except (KeyError, ValueError) as exc:
            raise ScopeChanged("资料在检索期间发生变化，请重新预检后生成") from exc
        current = await asyncio.to_thread(preflight_report, knowledge, params)
        if current["fingerprint"] != preflight["fingerprint"]:
            raise ScopeChanged("资料在检索期间发生变化，请重新预检后生成")
        # Match source numbers to the documents actually sent to the writer.
        visible_reports = [report for report in context.reports if report["markdown"].strip()]
        params["coverage"] = {"eligible": len(eligible_ids), "retrieval_matches": len(result.reports),
                              "documents_in_model": len(visible_reports)}
    if not visible_reports:
        raise ValueError("所选报告在上下文预算内没有可读正文，请缩小资料范围")
    sources = [{"citation": index, "doc_id": report["doc"].doc_id,
                "title": report["doc"].title, "version": report["doc"].version,
                "corpus_id": params.get("corpus_id", ""),
                "page": None,
                "url": f"/api/documents/{report['doc'].doc_id}?version={report['doc'].version}"}
               for index, report in enumerate(visible_reports, 1)]
    if visible_sources is not None:
        visible_sources.extend(sources)
    header = (f"领域：{params['domain']}\n项目年份窗口（与文件名中的项目起止区间相交）：{params['year_from']}–{params['year_to']}\n"
              f"报告范围：{'全部合格资料的已解析文本综述' if params.get('report_mode') == 'review' else '主题研究'}\n"
              "项目起止年份按文件名推断；不代表报告提交年份或成果实际发生时间\n"
              f"所选资料元数据覆盖：{preflight['total'] - preflight['excluded']['stale']} 份当前可用；项目区间可识别 {preflight['period_hits']}、缺失 {preflight['excluded']['period']}；"
              f"资助类别命中 {preflight['category_hits']}、缺失/歧义 {preflight['total'] - preflight['excluded']['stale'] - preflight['category_hits']}\n"
              f"项目区间缺失资料（未纳入，所选范围内）：{preflight['excluded']['period']}\n"
              f"资助类别缺失资料（所选范围内）：{preflight['total'] - preflight['excluded']['stale'] - preflight['category_hits']}\n"
              f"模板：{template_id}\n基金类别：{params.get('fund_type') or '不限'}\n"
              f"分析重点：{params.get('focus') or '无'}")
    brief = (f"写作目的：{params.get('purpose') or '研究进展梳理'}\n"
             f"目标读者：{params.get('audience') or '专业研究人员'}\n"
             f"预期篇幅：{params.get('length') or '标准篇幅'}\n"
             f"已核定候选资料：{preflight['eligible_count']} 份；本次实际入模资料 {len(visible_reports)} 份（正文可能按预算截断）。"
             "实际引用须来自下方编号原文；每个 [n] 指向一份文档，不代表检索片段编号。"
             "未入模候选不得推断为正文为空或无成果。")
    reports_text = "\n\n".join(
        f"[{index}] {report['header']}\n"
        + ("正文因预算截断，不能把未显示内容说成原文缺失。\n" if report.get("truncated") else "")
        + f"<report>\n{report['markdown']}\n</report>"
        for index, report in enumerate(visible_reports, 1))
    custom_instruction = ""
    if task_definition:
        fields = (("背景", "background"), ("目标", "goal"), ("具体要求", "requirements"),
                  ("边界", "boundaries"), ("澄清条件", "clarification_conditions"),
                  ("输出要求", "output_instructions"), ("任务大纲", "outline"))
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
    # Imported here because hierarchy reads the project index, which reads targets, which reads
    # this module; a module-level import would close the cycle.
    from .hierarchy import render_section as render_hierarchy

    hierarchy_section = render_hierarchy(hierarchy_record, sources)
    if hierarchy_section:
        params["hierarchy"] = {
            "state": hierarchy_record.get("state"), "fingerprint": hierarchy_record.get("fingerprint"),
            "generated_at": hierarchy_record.get("generated_at"),
            "scenes": len(hierarchy_record.get("scenes", [])),
            "coverage": hierarchy_record.get("coverage", {}).get("targets", {}),
        }
    messages = [
        SystemMessage(content=task_instruction("task4", phase="report") + custom_instruction
                      + "\n\n直接完成最终 Markdown，由你在内部组织章节与执行摘要，无需用户审批大纲。"
                        "先写有来源的核心发现，说明筛选边界、相互冲突的证据和局限。"
                        "每个关键事实用下方存在的 [n] 编号引用；不能编造来源、数据或应用成效。"
                        + ("\n\n系统会在正文末尾、来源附录之前附加一章“场景层级（按四维归纳结果生成）”，"
                           "其内容由程序按本库四维归纳结果渲染，与本章的编号引用同一份来源列表。"
                           "该章的场景、问题、技术路线、成果与方面完成度以它为准：正文可以解释这些条目，"
                           "但不得改写其名称、状态或数量，也不得声称库里没有它列出的条目。"
                           if hierarchy_section else "")
                        + "没有足够资料的结论写明资料不足，推断明确标注。提交前核对引用编号。"
                      + "\n\n模板章节：\n" + (template_content if template_content is not None
                                              else report_template(template_id))),
        HumanMessage(content=brief + "\n\n已核定范围：\n" + header + "\n\n可引用原文证据：\n" + reports_text),
    ]
    def valid(markdown: str) -> bool:
        return bool(re.search(r"(?m)^# .+\n", markdown) and re.search(r"(?m)^## .+", markdown)
                    and re.search(r"\[\d{1,3}\]", markdown)
                    and not validate_citations(markdown, sources))

    def with_sources(markdown: str) -> str:
        if hierarchy_section:
            marker = "\n## 来源附录（系统记录）"
            markdown = markdown.rstrip()
            markdown = (markdown.replace(marker, "\n" + hierarchy_section + "## 来源附录（系统记录）", 1)
                        if marker in markdown else markdown + "\n" + hierarchy_section)
        lines = []
        for source in sources:
            page = f"，第{source['page']}页" if source.get("page") else ""
            lines.append(f"[{source['citation']}] {source['title']}"
                         f"（文档 {source['doc_id']}，版本 {source['version']}{page}）")
        appendix = "\n\n## 来源附录（系统记录）\n" + "\n".join(lines)
        return markdown.rstrip() + appendix + "\n"

    try:
        # Segment summaries and final writing share one run budget. A fresh timeout here
        # could double the configured limit after a long review.
        async with asyncio.timeout_at(deadline):
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
    except TimeoutError as exc:
        raise ValueError("报告超过本次运行时限，未保存未完成正文；请缩小资料范围") from exc
    if not valid(content):
        raise ValueError("报告引用或结构校验失败，请检查来源与模型输出后重试")
    return with_sources(content)
