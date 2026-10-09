"""Deterministic budget checks. Missing data and unsupported scope never become passes.

单引擎删减后仅保留预算确定性复算；legacy 字数/章节/年龄核对已按裁决删除。
"""
import re
from datetime import date
from decimal import Decimal

from .parser import compact
from .sections import ALGORITHM_NOTE, dates_in, parse_date, read_range

EXPENSES = [
    "设备费", "材料费", "测试化验加工费", "燃料动力费", "差旅/会议/国际合作与交流费",
    "出版/文献/信息传播/知识产权事务费", "劳务费", "专家咨询费", "其他支出",
]


def finding(key, group, title, status, detail, source, page=None, suggestion="", quote="", **extra):
    return dict(
        id=key, group=group, title=title, status=status, detail=detail,
        source=source, page=page, suggestion=suggestion, quote=quote, **extra,
    )


def budget_checks(doc, rule):
    pages = doc["pages"]
    out = []
    table = None
    for p in pages:
        c = compact(p["text"])
        if ("直接费用合计" in c or "项目预算总额" in c) and sum(x in c for x in EXPENSES) >= 3:
            table = p
            break
    if not table:
        return [finding("budget-table", "budget", "预算表完整性", "pending",
                        "未可靠识别预算表，金额检查未执行。", rule["budget_source"],
                        suggestion="核对原文或使用带可复制文字的完整预算表。")], {}
    c = re.sub(r"[^\S\n]+", "", table["text"])
    unit = Decimal(1) if "万元" in c else (Decimal("0.0001") if "单位：元" in c or "单位:元" in c else None)
    if unit is None:
        return [finding("budget-unit", "budget", "预算金额单位", "pending",
                        "预算表单位不明确，未执行汇总。", rule["budget_source"], table["page"])], {}
    names = ["设备费", "业务费", "劳务费"] if "业务费" in c else EXPENSES
    rows = []
    for name in names:
        m = re.search(re.escape(name) + r"[：:]?(\d+(?:\.\d+)?)", c)
        if m:
            rows.append({"name": name, "amount": float(Decimal(m.group(1)) * unit)})
    m = re.search(r"(?:项目)?直接费用合计[：:]?(\d+(?:\.\d+)?)", c)
    total = float(Decimal(m.group(1)) * unit) if m else None
    amount_sum = sum(Decimal(str(x["amount"])) for x in rows)
    status = "pending" if total is None or len(rows) != len(names) else (
        "pass" if abs(amount_sum - Decimal(str(total))) <= Decimal("0.0001") else "issue")
    out.append(finding(
        "budget-total", "budget", "预算一级科目合计", status,
        f"识别 {len(rows)}/{len(names)} 个一级科目，合计 {amount_sum:.4f} 万元；表中总额 {total if total is not None else '未识别'} 万元。未重复计算设备子科目。",
        "算术核对；" + rule["budget_source"], table["page"],
        "复核各科目金额和总额。" if status != "pass" else "", c[:500]))
    header = doc["metadata"].get("budget")
    out.append(finding(
        "budget-header", "budget", "基本信息与预算表一致性",
        "pending" if header is None or total is None else ("pass" if abs(header - total) < 0.0001 else "issue"),
        f"已确认申请金额：{header if header is not None else '未识别'} 万元；预算表：{total if total is not None else '未识别'} 万元。",
        "申请书基本信息与预算表交叉核对", table["page"], "核对基本信息、预算表与识别金额。"))
    explanation = [p for p in pages if "预算说明书" in compact(p["text"])]
    if explanation:
        p = explanation[0]
        t = compact(p["text"])
        pairs = []
        for row in rows:
            label = row["name"]
            m = re.search(re.escape(label) + r"[（(](\d+(?:\.\d+)?)(?:万元|万)[）)]", t)
            if m:
                pairs.append((label, row["amount"], float(m.group(1))))
        bad = [a for a in pairs if abs(a[1] - a[2]) > 0.0001]
        status = "issue" if bad else ("pass" if len(pairs) == len(rows) and rows else "pending")
        detail = ("；".join(f"{a}: 表中 {b} / 说明 {d} 万元" for a, b, d in bad) if bad
                  else f"核对 {len(pairs)}/{len(rows)} 个科目标题金额。" + ("已核对的金额一致。" if pairs else "未识别到可比较金额。"))
        out.append(finding(
            "budget-explanation", "budget", "预算表与说明金额", status, detail,
            "预算表与预算说明的科目标题金额交叉核对", p["page"],
            "需覆盖全部科目后才能确认文内一致性。" if status == "pending" else ""))
        # Only parse explicit multiplicative equations. Combined sums, currency conversion
        # and approximate amounts require manual review.
        number = r"\d+(?:\.\d+)?"
        units = r"(?:万元|元|万)?(?:/[月人天次])*(?:人次|个月|月|年|人|次|台|个|箱|篇|项|天)?"
        pattern = rf"((?:{number}{units}[×*])+{number}{units})[=＝]({number})(万元|万|元)"
        checked = []
        for match in re.finditer(pattern, t):
            prefix = t[max(0, match.start() - 50):match.start()]
            prefix = re.split(r"[。；;：:]", prefix)[-1]
            if "+" in prefix or "＋" in prefix:
                continue
            expr, expected, rightunit = match.groups()
            if match.start() > 0 and t[match.start() - 1] in "×*/.0123456789":
                continue
            if "元" not in expr and "万" not in expr:
                continue
            product = Decimal(1)
            for term in re.split(r"[×*]", expr):
                value = Decimal(re.match(number, term).group())
                if "万" in term:
                    value *= 10000
                product *= value
            expected_value = Decimal(expected) * (10000 if "万" in rightunit else 1)
            tolerance = Decimal("0.01")
            ok = abs(product - expected_value) <= tolerance
            checked.append({"expression": match.group(), "computed_yuan": float(product),
                            "stated_yuan": float(expected_value), "ok": ok})
        bad = [x for x in checked if not x["ok"]]
        out.append(finding(
            "budget-formulas", "budget", "可识别乘法测算",
            "issue" if bad else ("pass" if checked else "pending"),
            f"已复算 {len(checked)} 条明确乘法等式，发现 {len(bad)} 条不一致。组合加法、外币与约数未自动判定。",
            "十进制金额复算，仅覆盖明确的单一乘法等式", p["page"],
            "复核：" + "；".join(x["expression"] for x in bad) if bad else "外币、组合算式和报价合理性仍需人工审核。",
            calculations=checked))
    else:
        out.append(finding("budget-explanation", "budget", "预算测算说明", "pending",
                           "未识别到预算说明书。", rule["budget_source"], suggestion="补充预算用途与测算说明。"))
    out.append(finding("budget-policy", "budget", "经费政策与报价合理性", "pending",
                       "算术一致不代表费用科目、额度或市场报价符合申报要求。", rule["budget_source"],
                       table["page"], "补充当年资金管理规定、设备报价和用途证明。"))
    return out, {"rows": rows, "total": total, "sum": float(amount_sum), "page": table["page"]}


def normalize_unit(name):
    return compact(name).replace("（", "(").replace("）", ")")


def section_result(doc, check, spec):
    """Count a mapped section; only a reliable, confirmed range can pass or fail."""
    mapping = doc.get("section_mappings", {}).get(check["id"]) or {}
    if mapping.get("missing") and mapping.get("status") == "confirmed":
        return "issue", "已核对申请书标题与对应关系，确认缺少该章节。", None, {"mapping": "confirmed", "coverage": "none"}
    if not mapping.get("block_ids"):
        reason = "存在多个同名章节，需在章节对应核对中选择" if mapping.get("status") == "ambiguous" else "未能定位该章节"
        return "pending", reason + "；未能核对，不判定为缺少章节。", None, {"mapping": mapping.get("status", "not_found"), "coverage": "none"}
    value = read_range(doc.get("blocks", []), mapping["block_ids"], spec["section"])
    limit = Decimal(spec["value"])
    over = Decimal(value["count"]) > limit
    meta = {"mapping": mapping["status"], "coverage": "complete" if value["complete"] else "partial",
            "location": {"pages": value["pages"], "block_ids": value["block_ids"]}, "counted_text": value["text"][:300]}
    gap = f"另有 {value['unread_images']} 处图片内容未读取，完整字符数未能核对。" if value["unread_images"] else ""
    detail = f"已读取{spec['section']}正文 {value['count']} 字符（{ALGORITHM_NOTE}）要求不超过 {spec['value']}。" + gap
    if mapping["status"] != "confirmed":
        return "pending", detail + "章节范围为自动识别，尚未确认，结论待核实。", value["count"], meta
    if over:
        return "issue", detail + "已确认范围内的可读正文已超出上限。", value["count"], meta
    if not value["complete"]:
        return "pending", detail, value["count"], meta
    return "pass", detail, value["count"], meta


def organization_result(doc, spec):
    meta = doc["metadata"]
    if not doc.get("confirmed_at"):
        raise ValueError("请先按原文核对并确认申报单位名单。")
    names = [n for n in (meta.get("organizations") or []) if n and n.strip()]
    if not names:
        if meta.get("organization_count") is None:
            raise ValueError("未提供申报单位名单，未执行计数。")
        return meta["organization_count"], "按已确认的单位数量核对（未提供名单，未做去重）。", []
    unique = list(dict.fromkeys(normalize_unit(n) for n in names))
    similar = [(a, b) for a in unique for b in unique if a != b and a in b]
    note = f"名单 {len(names)} 项，同名去重后 {len(unique)} 家。"
    if similar:
        note += "疑似同一机构未合并：" + "；".join(f"{a} / {b}" for a, b in similar) + "。"
    return len(unique), note, similar


def schedule_result(doc, check, spec):
    """Overall interval plus explicit stage dates; precision gaps stay pending."""
    low, high = date.fromisoformat(spec["value"]), date.fromisoformat(spec["end"])
    meta = doc["metadata"]
    starts = parse_date(meta.get("plan_start")) if doc.get("confirmed_at") else None
    ends = parse_date(meta.get("plan_end")) if doc.get("confirmed_at") else None
    mapping = doc.get("section_mappings", {}).get(check["id"]) or {}
    stages, location = [], {}
    if mapping.get("block_ids"):
        value = read_range(doc.get("blocks", []), mapping["block_ids"], spec["section"] or check["title"])
        stages = dates_in(value["text"])
        location = {"pages": value["pages"], "block_ids": value["block_ids"]}
    problems, unsure = [], []
    if starts and ends and starts[0] > ends[1]:
        problems.append("开始日期晚于结束日期")
    for label, item in (("开始", starts), ("结束", ends)):
        if not item:
            continue
        if item[1] < low or item[0] > high:
            problems.append(f"整体{label}日期 {meta.get('plan_' + ('start' if label == '开始' else 'end'))} 超出要求区间")
        elif item[0] < low or item[1] > high:
            unsure.append(f"整体{label}日期仅精确到{item[2]}，无法判断是否越界")
    confirmed_range = mapping.get("status") == "confirmed"
    for lo, hi, precision, raw in stages:
        if hi < low or lo > high:
            (problems if confirmed_range else unsure).append(f"进度计划中的“{raw}”超出要求区间")
        elif lo < low or hi > high:
            unsure.append(f"“{raw}”仅精确到{precision}")
    if not (starts and ends) and not stages:
        raise ValueError("未确认项目整体起止日期，进度计划中也未识别到明确日期；不使用申报日期替代。")
    if not (starts and ends):
        unsure.append("项目整体起止日期未确认，仅核对了进度计划中列出的日期")
    if stages and not confirmed_range:
        unsure.append("进度计划章节范围为自动识别，尚未确认")
    if not mapping.get("block_ids") and not (mapping.get("missing") and confirmed_range):
        unsure.append("进度计划章节未定位，阶段日期未核对")
    status = "issue" if problems else ("pending" if unsure else "pass")
    detail = f"要求区间 {spec['value']} 至 {spec['end']}（含首尾日）。" + (
        f"整体：{meta.get('plan_start')} 至 {meta.get('plan_end')}。" if starts and ends else "") + (
        f"进度计划识别日期 {len(stages)} 个。" if stages else "") + "；".join(problems + unsure)
    return status, detail, {"location": location, "mapping": mapping.get("status", "not_found"),
                            "stage_dates": [raw for *_, raw in stages]}


def font_result(doc, check, spec):
    """DOCX body text only; fonts no style level declares stay unread instead of guessed."""
    if doc["kind"] != "docx":
        return "pending", "该文件格式不记录可核对的字体信息，未检查（仅 DOCX 正文支持）。", {"coverage": "none"}
    size = spec["field"] == "docx_font_size"
    expected = spec["value"].strip()
    wrong, unknown, total, places = 0, 0, 0, []
    for block in doc.get("blocks", []):
        if block["level"] or "fonts" not in block:
            continue
        for font, pt, chars in block["fonts"]:
            actual = pt if size else font
            total += chars
            if actual is None:
                unknown += chars
            elif (abs(actual - float(expected)) > 0.01) if size else (actual.strip() != expected):
                wrong += chars
                if len(places) < 8 and block["page"] not in places:
                    places.append(block["page"])
    label = f"{expected} 磅" if size else expected
    if not total:
        return "pending", "未读取到带字体信息的正文段落，未检查。", {"coverage": "none"}
    detail = f"正文 {total} 字中，{wrong} 字不是{label}，{unknown} 字的{'字号' if size else '字体'}由主题或未声明，无法核对。"
    extra = {"coverage": "partial" if unknown else "complete", "location": {"pages": places}}
    if wrong:
        status = "issue" if check["strength"] == "hard" else "warning"
        return status, detail + f"不符位置（文本块）：{'、'.join(map(str, places))}{' 等' if len(places) == 8 else ''}。", extra
    return ("pending" if unknown else "pass"), detail, extra


def guideline_checks(doc, rule):
    """Execute only explicitly bound rules against known units and confirmed input."""
    from datetime import datetime
    from pathlib import Path
    output = []
    for check in rule.get("checks", []):
        if not check.get("enabled", True) or check.get("method") != "calculation":
            continue
        spec = check.get("execution")
        status, detail, actual, extra = "pending", "尚未绑定支持的计量方式，未执行计算。", None, {}
        if spec:
            field, unit = spec["field"], spec["unit"]
            meta = doc["metadata"]
            needed_sheet = any("信息表" in value for value in check.get("needed_materials", []))
            try:
                if needed_sheet and not doc.get("information_sheet_present"):
                    raise ValueError("缺少本项要求的申报信息表。")
                if field == "section_characters":
                    status, detail, actual, extra = section_result(doc, check, spec)
                    if status == "issue" and check["strength"] != "hard":
                        status = "warning"
                    output.append(program_finding(check, status, detail, actual, extra))
                    continue
                if field in ("docx_font", "docx_font_size"):
                    status, detail, extra = font_result(doc, check, spec)
                    output.append(program_finding(check, status, detail, None, extra))
                    continue
                if field == "plan_interval":
                    status, detail, extra = schedule_result(doc, check, spec)
                    output.append(program_finding(check, status, detail, None, extra))
                    continue
                note = ""
                if field == "file_bytes":
                    actual = Path(doc["path"]).stat().st_size if unit == "字节" else None
                elif field == "characters":
                    actual = len(compact(doc.get("proposal_text", ""))) if unit == "字符" else None
                    note = "全文字符数（不含空白，含标点），不代表任一章节字数。"
                elif field == "pdf_pages":
                    actual = doc.get("proposal_pages") if doc["kind"] == "pdf" and unit == "页" else None
                elif field == "organizations":
                    actual, note, similar = organization_result(doc, spec)
                    if similar and Decimal(actual) > Decimal(spec["value"]):
                        raise ValueError(note + "超出部分可能来自未合并的同一机构，待核对。")
                else:
                    if not doc.get("confirmed_at"):
                        raise ValueError("请先按原文核对并确认本项元信息。")
                    if field in doc.get("field_conflicts", []):
                        raise ValueError("正文与信息表的该字段不一致，未任取其一。")
                    actual = meta.get(field)
                    if field in ("budget", "application_budget", "total_budget") and actual is not None:
                        actual = Decimal(str(actual)) * (10000 if unit == "元" else 1) if unit in ("元", "万元") else None
                    elif field in ("organization_count", "patent_count") and unit not in ("家", "项"):
                        actual = None
                    elif field == "university_present":
                        actual = int(actual) if isinstance(actual, bool) and unit == "是否" else None
                if actual is None or actual == "":
                    raise ValueError("材料字段、单位或文件格式不支持可靠核对，尚未执行。")
                operator, expected = spec["operator"], spec["value"]
                if field == "submitted_at":
                    a, b = datetime.fromisoformat(str(actual)), datetime.fromisoformat(expected)
                    if not a.tzinfo or not b.tzinfo:
                        raise ValueError("申报时间与截止时间须包含明确时区；不能用上传时间替代。")
                    comparisons = {"before": a < b, "on_or_before": a <= b}
                elif field == "education":
                    degrees = {"专科": 0, "本科": 1, "硕士": 2, "博士": 3}
                    if actual not in degrees or expected not in degrees or unit != "学历":
                        raise ValueError("学历类型尚不属于已确认的比较范围。")
                    comparisons = {"ge": degrees[actual] >= degrees[expected], "eq": actual == expected}
                else:
                    a, b = Decimal(str(actual)), Decimal(expected)
                    if not a.is_finite() or not b.is_finite():
                        raise ValueError("数值不是有限数。")
                    comparisons = {"le": a <= b, "ge": a >= b, "eq": a == b}
                if operator not in comparisons:
                    raise ValueError("计量方式与比较运算不匹配。")
                status = "pass" if comparisons[operator] else ("issue" if check["strength"] == "hard" else "warning")
                label = {"le": "不高于", "ge": "不低于", "eq": "等于", "before": "早于", "on_or_before": "不晚于"}[operator]
                detail = f"程序实际核对值：{actual} {unit}；当前要求：{label} {expected} {unit}。{note}仅核对已确认的输入，不证明资质真实性。"
            except (ValueError, TypeError, ArithmeticError) as error:
                status, detail = "pending", str(error)
        if isinstance(actual, Decimal):
            actual = float(actual)
        output.append(program_finding(check, status, detail, actual, extra))
    return output


def program_finding(check, status, detail, actual, extra):
    revised = "（本模板人工修订，原始要求：" + check["original"]["requirement"] + "）" if check.get("revised") and check.get("original") else ""
    return {**finding("check-" + check["id"], "guideline", check["title"], status, detail,
                      check["source"] + revised, page=next(iter((extra.get("location") or {}).get("pages", [])), None),
                      suggestion="结合模板要求与原文核对；修改后上传新版本重新审查。"),
            "clause_ids": [check["id"]], "origin": "program", "actual": actual,
            "requirement": check["requirement"], **extra}
