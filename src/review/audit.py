"""五阶段审核管线：指南动态清单 + 确定性预算复算 + 校验后的引用回填。

删减说明（2026-09-29 裁决）：删除 legacy 手工规则分支（words/age/budget_cap 条款构造、
02_guidelines 阶段与 require({'words','eligibility','budget'}) 覆盖检查）；单引擎下
engine 恒为 guideline，规则与检查项只来自用户已确认启用的指南清单。
"""
import re

from .checks import budget_checks, finding, guideline_checks
from .compliance_output import repair_explanations
from .model_client import Client, ModelError, TruncatedModelError
from .parser import compact
from .research import redact, validate_model_result
from .verification import verify

STAGES = ["分块理解申请书", "核对指南检查项与预算", "模型规范性审核", "模型技术先进性评议", "复核并生成报告"]


def chunks(pages, limit):
    batch = []
    size = 0
    for p in pages:
        text = redact(p["text"])
        for start in range(0, len(text), limit):
            part = {"page": p["page"], "text": text[start:start + limit]}
            if batch and size + len(part["text"]) > limit:
                yield batch
                batch = []
                size = 0
            batch.append(part)
            size += len(part["text"])
    if batch:
        yield batch


def quote_valid(item, pages):
    q = item.get("quote")
    page = item.get("page")
    return isinstance(q, str) and bool(compact(q)) and any(
        p["page"] == page and compact(q) in compact(redact(p["text"])) for p in pages
    )


def require(ok, message):
    if not ok:
        raise ModelError("模型结果校验失败：" + message)


def review(doc, rule, evidence, cutoff, progress, client=None, guidelines=None, *, kind="formal", mode="historical"):
    client = client or Client()
    guides = guidelines or []
    all_pages = doc["pages"]
    cfg = client.settings
    require(kind in ("formal", "professional"), "请选择形式或专业审查任务。")
    active_checks = [c for c in rule.get("checks", []) if c.get("enabled", True)]
    require(bool(active_checks), "模板没有启用的检查项。")
    require(
        sum(len(p["text"]) for p in all_pages)
        + sum(len(p["text"]) for g in guides for p in g["pages"]) <= cfg["max_chars"],
        "材料超过字符上限，未截断审核。",
    )
    parts = list(chunks(all_pages, cfg["chunk"]))
    require(
        len(parts) + 1 + 3 + (len(active_checks) + 9) // 10 <= cfg["max_calls"],
        "材料超过调用预算，请提高 REVIEW_MAX_CALLS 或减少材料。",
    )
    require(bool(parts), "没有可读取的正文，请先进行 OCR。")

    facts = []
    overviews = []
    queue, i = list(parts), -1
    while queue:
        part, i = queue.pop(0), i + 1
        total = i + 1 + len(queue)
        progress(0, f"理解申请书 · {i + 1}/{total} 块")
        sources = {}
        for j, p in enumerate(part):
            for offset in range(0, len(p["text"]), 240):
                sid = f'b{i}-p{p["page"]}-{j}-{offset}'
                sources[sid] = {"source_id": sid, "page": p["page"], "text": p["text"][offset:offset + 240]}
        payload = {"sources": list(sources.values()), "metadata": doc["metadata"]}
        try:
            for attempt in range(2):
                result = client.ask("01_extract", payload)
                require(isinstance(result.get("overview"), str) and isinstance(result.get("items"), list), "材料理解格式不完整。")
                clean = []
                invalid = []
                for n, item in enumerate(result["items"]):
                    if not isinstance(item, dict):
                        invalid.append(n + 1)
                        continue
                    source = sources.get(item.get("source_id", ""))
                    if source:
                        # The server copies the exact supplied source; the model never reconstructs it.
                        clean.append({**item, "page": source["page"], "quote": source["text"]})
                    elif quote_valid(item, part):
                        clean.append(item)
                    else:
                        invalid.append(n + 1)
                if not invalid:
                    break
                if attempt == 0:
                    progress(0, f"理解申请书 · {i + 1}/{total} 块 · 修正引用")
                    payload = {
                        **payload,
                        "correction": f"上次第 {invalid} 项引用无效。重新输出完整 items，每项 source_id 必须逐字使用 sources 中的现有 ID。不要创造 ID 或自行重写引文。",
                    }
        except TruncatedModelError:
            # Dense text yields more facts than one reply holds: halve the chunk instead of failing.
            if len(part) > 1:
                queue[:0] = [part[:len(part) // 2], part[len(part) // 2:]]
            elif len(part[0]["text"]) > 480:
                text, half = part[0]["text"], len(part[0]["text"]) // 2
                queue[:0] = [[{**part[0], "text": text[:half]}], [{**part[0], "text": text[half:]}]]
            else:
                raise
            continue
        require(
            not invalid,
            f"第 {i + 1}/{total} 块引用修正后仍无法定位（事项 {invalid}）；请重试，申请书内容本身未被判定不合格。",
        )
        facts.extend(clean)
        overviews.append(result["overview"])

    anchors = {f["source_id"]: f for f in facts if f.get("source_id")}

    def attach_sources(result, key):
        """An item may rest on several passages; it is anchored on the first one that exists."""
        for item in result.get(key, []):
            if not isinstance(item, dict):
                continue
            refs = item.get("source_ids") if isinstance(item.get("source_ids"), list) else []
            refs = [r for r in refs if isinstance(r, str)]
            if isinstance(item.get("source_id"), str):
                refs += re.split(r"[;；,，、\s]+", item["source_id"])
            found = [anchors[r] for r in dict.fromkeys(refs) if r in anchors]
            if found:
                item["page"] = found[0]["page"]
                item["quote"] = found[0]["quote"]
                item["source_id"] = found[0]["source_id"]
                item["other_pages"] = sorted({f["page"] for f in found[1:]} - {found[0]["page"]})
        return result

    findings, calculations, budget, clauses, omitted, compliance_warnings, technical_warnings = [], [], {}, [], [], [], []
    eligible = []
    tech = {"summary": "", "cards": [], "context_pages": sorted({p["page"] for p in all_pages}), "evidence": []}
    if kind == "formal":
        progress(1, STAGES[1])
        clauses = [{**c, "topic": c["category"]} for c in active_checks]
        calculations = []
        if any((c.get("execution") or {}).get("field") in ("budget", "application_budget", "total_budget") for c in active_checks):
            calculations, budget = budget_checks(doc, rule)
        calculations.extend(guideline_checks(doc, rule))
        for field in doc.get("field_conflicts", []):
            calculations.append(finding("conflict-" + field, "scope", "正文与信息表字段冲突：" + field, "pending",
                "两个文件的确认值不同；本项没有用最新文件覆盖。", "材料一致性核对", suggestion="分别查看两份原文并修正输入。"))
        if not doc.get("information_sheet_present") and any("信息表" in m for c in active_checks for m in c.get("needed_materials", [])):
            calculations.append(finding("missing-sheet", "structure", "缺少申报信息表", "pending",
                "模板中有条目需要信息表；仅对已提供正文开展核对，不能声明完整申报材料通过。", "申报材料完整性", suggestion="补充申报信息表。"))
        tools = {f["id"]: f for f in calculations}
        authorities = {c["id"]: c for c in clauses}
        # Program-executed checks are owned by the executor; the model only reads the rest.
        clauses_for_model = [c for c in clauses if not (c.get("method") == "calculation" and c.get("execution"))]

        progress(2, STAGES[2])
        fs = []
        compliance_warnings = []
        clause_batches = [clauses_for_model[i:i + 10] for i in range(0, len(clauses_for_model), 10)]
        for batch_index, batch in enumerate(clause_batches):
            progress(2, f"模型规范性审核 · {batch_index + 1}/{len(clause_batches)} 组检查项")
            payload = {
                "rule": {k: v for k, v in rule.items() if k in ("name", "kind", "scope_note")},
                "checklist_driven": True,
                "clauses": batch,
                "facts": facts,
                "overview": overviews,
                "calculations": calculations,
                "metadata": doc["metadata"],
                "document_kind": doc["kind"],
                "instruction": "逐条回答本批次每个 clause，判断适用/不适用/待核实。不要添加模板未载明的数值限制。文字规范类条目逐条列出原句（quote 使用原文）、位置和建议改法，作为校对建议而非资格结论。",
            }
            result = client.ask("03_compliance", payload)
            result = attach_sources(result, "findings")
            rows = result.get("findings")
            require(isinstance(rows, list) and 1 <= len(rows) <= 35, "规范审核条目数量无效。")
            rows, notes = repair_explanations(client, payload, rows)
            compliance_warnings.extend(f"第 {batch_index + 1} 组：" + note for note in notes)
            fs.extend(rows)

        findings = []
        covered = set()
        for i, f in enumerate(fs):
            require(isinstance(f, dict), "规范条目格式无效。")
            tids = f.get("tool_ids", [])
            cids = f.get("clause_ids", [])
            require(
                isinstance(tids, list) and isinstance(cids, list)
                and all(x in tools for x in tids) and all(x in authorities for x in cids),
                "引用了未提供的规则或计算结果。",
            )
            f["group"] = "guideline" if cids else f.get("group", "scope")
            require(
                f.get("status") in ("pass", "issue", "warning", "pending", "na")
                and f.get("group") in ("words", "eligibility", "budget", "structure", "scope", "guideline"),
                "规范条目状态无效。",
            )
            require(
                all(isinstance(f.get(k), str) and bool(f[k].strip()) for k in ("title", "detail", "suggestion")),
                "规范条目缺少解释。",
            )
            if f["status"] in ("pass", "issue", "warning", "na") and not tids and not quote_valid(f, all_pages):
                f.update(status="pending", quote="", page=None)
                f["detail"] = "申请书原文依据未定位，待核实。" + f["detail"]
            if f["status"] in ("pass", "issue", "warning") and not tids:
                require(quote_valid(f, all_pages), "规范结论原文无法定位。")
            if f.get("quote"):
                require(quote_valid(f, all_pages), "规范摘录无法定位。")
            if not f.get("quote"):
                f["page"] = None
            if not tids and not cids and f["status"] in ("pass", "issue"):
                f["status"] = "pending"
            if f["status"] == "issue" and not any(authorities[x]["strength"] == "hard" for x in cids) and not any(
                tools[x]["status"] == "issue" for x in tids
            ):
                f["status"] = "warning"
            if any(tools[x]["status"] == "issue" for x in tids):
                f["status"] = "issue"
            if f["status"] == "pass" and any(tools[x]["status"] in ("pending", "warning") for x in tids):
                f["status"] = "pending"
            if any(authorities[x].get("method") in ("calculation", "manual") for x in cids) and f["status"] in ("pass", "issue", "warning"):
                f["status"] = "pending"
                f["detail"] = "此项依赖精确计量或外部证明，模型文本判断不能完成核验。" + f["detail"]
            covered.update(tids)
            source = "；".join([authorities[x]["source"] for x in cids] + [tools[x]["source"] for x in tids]) or "模型修改建议，非基金硬性要求"
            findings.append({**f, "id": f"ai-{i}", "source": source, "origin": "model", "page": f.get("page"), "quote": f.get("quote", "")})

        omitted = [f for f in calculations if f["id"] not in covered and f.get("origin") != "program"]
        for f in calculations:
            if f.get("origin") == "program":
                findings.append({**f, "tool_ids": [f["id"]]})
            elif f in omitted:
                findings.append({**f, "origin": "program", "detail": "模型未逐项讨论此项；以下为程序复算结果：" + f.get("detail", ""), "tool_ids": [f["id"]]})

        addressed = {cid for f in findings for cid in f.get("clause_ids", [])}
        for c in clauses:
            if c["id"] not in addressed:
                findings.append({
                    "id": "unreviewed-" + c["id"], "group": "guideline", "title": c["title"],
                    "status": "pending", "detail": "模型未完成此检查项的判断。要求：" + c["requirement"],
                    "source": c["source"], "page": None, "quote": "", "suggestion": "补充材料后复核。",
                    "clause_ids": [c["id"]], "origin": "coverage",
                })

    else:
        progress(3, STAGES[3])
        questions = {c["id"]: c for c in active_checks}
        # Historical judgement needs dated evidence; undated material cannot show what was known then.
        eligible = [e for e in evidence if (e.get("published") and e["published"] <= cutoff)
                    or (mode != "historical" and not e.get("published"))]
        selected = eligible[:30]
        result = client.ask("04_technical", {
            "cutoff": cutoff,
            "mode": mode,
            "questions": [{"check_id": c["id"], "title": c["title"], "requirement": c["requirement"],
                           "evidence_need": c.get("evidence_need", "internal")} for c in active_checks],
            "facts": facts,
            "overview": overviews,
            "evidence": selected,
        })
        result = attach_sources(result, "cards")
        require(
            isinstance(result.get("summary"), str) and isinstance(result.get("cards"), list) and 1 <= len(result["cards"]) <= 3 * len(questions) + 2,
            "技术评议格式无效。",
        )
        technical_warnings = []
        cards = []
        safe_doc = {**doc, "pages": [{"page": p["page"], "text": redact(p["text"])} for p in all_pages]}
        allowed_evidence = {e["id"] for e in selected}
        for i, card in enumerate(result["cards"]):
            require(
                isinstance(card, dict) and all(isinstance(card.get(k), str) and 1 <= len(card[k]) <= 4000 for k in ("title", "assessment", "suggestion")),
                "技术条目正文格式无效。",
            )
            if card.get("check_id") not in questions:
                technical_warnings.append(f"技术条目 {i + 1} 未对应本模板启用的评价问题，未计入结果。")
                continue
            try:
                clean = validate_model_result({"summary": result["summary"], "cards": [card]}, safe_doc, selected)["cards"][0]
            except (ValueError, TypeError, KeyError):
                ids = card.get("evidence_ids", [])
                ids = [x for x in ids if isinstance(x, str) and x in allowed_evidence] if isinstance(ids, list) else []
                valid_quote = quote_valid(card, all_pages)
                notice = "本条模型意见的原文或文献引用未通过校验，尚不能确认其判断；请人工核查。"
                technical_warnings.append(f"技术条目 {i + 1}：引用未通过校验，已标为待核实。")
                clean = {
                    "title": card["title"], "assessment": notice + " 模型待核查意见：" + card["assessment"],
                    "suggestion": card["suggestion"], "status": "pending",
                    "page": card.get("page") if valid_quote else None,
                    "quote": card.get("quote", "") if valid_quote else "",
                    "evidence_ids": ids, "basis": notice,
                }
            question = questions[card["check_id"]]
            if question.get("evidence_need") == "internal" and clean["basis"].startswith("模型基于"):
                clean["status"] = "advisory"  # A located internal argument needs no external evidence.
                clean["basis"] = "模型依据申请书原文的内部论证生成，须人工复核。"
            elif question.get("evidence_need") != "internal" and not clean.get("evidence_ids"):
                clean["status"] = "pending"
                clean["basis"] = "本问题需要对照材料，本条未引用任何已选证据，仅为申请书内部论证意见。" + clean.get("basis", "")
            clean.update(id=f"model-{i}", check_id=question["id"], topic=question["title"],
                         other_pages=card.get("other_pages", []) if clean.get("quote") else [])
            cards.append(clean)
        # Opinions follow the template's question order, whatever order the model answered in.
        order = {q["id"]: i for i, q in enumerate(active_checks)}
        cards.sort(key=lambda c: order.get(c["check_id"], len(order)))
        covered_ids = {c["check_id"] for c in cards}
        coverage = [{"check_id": q["id"], "title": q["title"], "evidence_need": q.get("evidence_need", "internal"),
                     "state": "evaluated" if q["id"] in covered_ids else "missing",
                     "cards": sum(c["check_id"] == q["id"] for c in cards)} for q in active_checks]
        for row in coverage:
            if row["state"] == "missing":
                technical_warnings.append(f"评价问题“{row['title']}”未完成评价，已单列。")
        output = {
            "summary": ("部分技术意见引用未核实，以下总结也需结合逐条标记复核。" if technical_warnings else "") + result["summary"],
            "cards": cards,
        }
        tech = {
            **output, "local_matches": sum(e.get("kind") == "project" for e in selected), "mode": "model", "model_used": True, "model_name": cfg["model"], "cutoff": cutoff,
            "evidence": selected, "excluded_count": len(evidence) - len(eligible), "coverage": coverage,
            "context_pages": sorted({p["page"] for p in all_pages if p["text"].strip()}),
        }
        if mode == "historical" and len(evidence) > len(eligible):
            technical_warnings.append(f"历史评价排除了 {len(evidence) - len(eligible)} 份评价时点之后或日期不明的材料。")

    progress(4, STAGES[4])
    verdict = verify(client, findings, tech, clauses, calculations, progress)
    return {
        "findings": findings,
        "budget": budget,
        "technical": tech,
        "calculation_findings": calculations,
        "audit": {
            "provider": "OpenAI 兼容模型服务",
            "model": cfg["model"],
            "calls": client.calls,
            "coverage_pages": tech["context_pages"],
            "checklist_count": len(active_checks),
            "missing_documents": rule.get("missing_documents", []),
            "empty_pages": [p["page"] for p in all_pages if not p["text"].strip()],
            "chunks": len(parts),
            "clauses": clauses,
            "verification": verdict["verification"],
            "summary": verdict["summary"],
            "limitations": (
                verdict.get("limitations", [])
                + compliance_warnings
                + ["未提供引用文件：" + x for x in rule.get("missing_documents", [])]
                + technical_warnings
                + ([f"有 {len(omitted)} 项预算复算未被模型逐项讨论，已保留并明确标注。"] if omitted else [])
            ),
            "literature_omitted": max(0, len(eligible) - 30),
        },
    }
