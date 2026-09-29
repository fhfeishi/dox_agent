"""Deterministic budget checks. Missing data and unsupported scope never become passes.

单引擎删减后仅保留预算确定性复算；legacy 字数/章节/年龄核对已按裁决删除。
"""
import re
from decimal import Decimal

from .parser import compact

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
