"""Review templates use the existing rule/version store; examples are never policy."""
import re
from copy import deepcopy
from datetime import date
from decimal import Decimal, InvalidOperation

from .models import RulePack

FORMAL = [
    ("organizations", "申报单位", "organizations", "", "3", "家", "", "申报单位不超过 3 家（含 3 家）",
     "按明确列出的申报/联合申报单位名单计数，同名去重；不按全文机构提及次数计数。"),
    ("abstract", "项目摘要", "section_characters", "项目摘要", "300", "字符", "", "项目摘要不超过 300 个字符（含 300）",
     "统计项目摘要正文，不含标题与空白字符。"),
    ("background", "项目背景", "section_characters", "项目背景", "200", "字符", "", "项目背景不超过 200 个字符（含 200）",
     "统计项目背景正文，不含标题与空白字符。"),
    ("plan", "项目方案", "section_characters", "项目方案", "2000", "字符", "", "项目方案不超过 2000 个字符（含 2000）",
     "统计项目方案章节及其子节正文，不只取标题后第一段。"),
    ("budget", "项目预算", "total_budget", "", "300", "万元", "", "项目总预算不超过 300 万元（含 300 万元）",
     "按项目总预算口径核对；部分科目金额不代表总预算，正文与信息表冲突时待核对。"),
    ("schedule", "项目进度计划", "plan_interval", "项目进度计划", "2026-10-01", "日期", "2028-09-30",
     "项目计划应在 2026-10-01 至 2028-09-30 内（含首尾日）",
     "核对整体起止日期及进度计划中已明确列出的阶段日期；不使用申报或上传日期。"),
]
PROOFREAD = ("proofread", "文字规范与错别字", "检查错别字、用词不当和明显的标点、格式不一致，给出原句、位置和建议改法。",
             "校对建议，不作为资格判断；专业术语和缩写不确定时提示核对。")
# Report order (query 2026-1010 0914): goal → necessity → feasibility → advancement → risk → related work.
PROFESSIONAL = [
    ("objective", "目标与合理性", "internal", "研究目标是否明确，技术路线能否支撑目标，论证是否自洽。"),
    ("necessity", "开展必要性", "internal", "说明问题来源与需求，评价开展本项目的必要性，非主流方向重点说明必要性。"),
    ("feasibility", "可行性与资源依赖", "internal", "评价方法、数据、条件、团队与进度的可行性及关键依赖。"),
    ("advancement", "技术先进性与验证", "comparison", "依据有日期的对照材料评价先进性，指出需补充的对比与验证。"),
    ("risk", "风险及薄弱点", "internal", "识别主要技术风险、论证薄弱点与缺失材料，给出具体改进建议。"),
    ("comparison", "相近工作与实质差异", "comparison", "与所选资料中的相近项目比较，说明实质差异；未命中不等于原创。"),
]


def builtins():
    result = []
    for kind in ("formal", "professional"):
        checks = []
        if kind == "formal":
            for ident, title, field, section, value, unit, end, requirement, note in FORMAL:
                checks.append(dict(id=ident, title=title, category="篇幅与章节" if section and field != "plan_interval" else title,
                    requirement=requirement, applicability=note, strength="hard",
                    method="calculation", source="内置示例（非官方政策）",
                    execution=dict(field=field, operator="within" if end else "le", value=value, unit=unit, section=section, end=end)))
            ident, title, requirement, note = PROOFREAD
            checks.append(dict(id=ident, title=title, category="文字规范", requirement=requirement, applicability=note,
                               strength="advisory", method="model", source="内置校对建议"))
        else:
            for ident, title, need, requirement in PROFESSIONAL:
                checks.append(dict(id=ident, title=title, category=title, requirement=requirement,
                    applicability="说明原文主张、分析判断、支持/反对证据、尚缺材料和具体建议。", strength="advisory", method="model",
                    source="内置评价问题", evidence_need=need))
        rule = RulePack(id="builtin-" + kind, kind=kind, name="通用形式审查示例" if kind == "formal" else "通用专业审查",
                        source_kind="builtin", checks=checks, confirmed=True,
                        scope_note=("示例数值来自本项目需求纪要，可复制后按实际要求修改；结果表示是否符合本模板要求，不代表官方合规。"
                                    if kind == "formal" else
                                    "围绕研究目标与技术方案评议合理性、必要性、可行性与论证充分性；比较已有工作需选择对照资料。")
                        ).model_dump(mode="json")
        for check in rule["checks"]:
            check["original"] = origin(check)
        result.append(rule)
    return result


def origin(check):
    return {key: deepcopy(check.get(key)) for key in
            ("requirement", "execution", "source", "guideline_id", "page", "quote", "evidence_need")}


def validate_enabled(rule):
    enabled = [c for c in rule["checks"] if c["enabled"]]
    if not enabled:
        raise ValueError("至少启用一个检查项")
    ids = [c["id"] for c in rule["checks"]]
    if len(ids) != len(set(ids)):
        raise ValueError("条目 ID 重复，请复制为新条目")
    sections = [c["execution"]["section"].strip() for c in enabled
                if c.get("execution") and c["execution"]["field"] == "section_characters"]
    if len(sections) != len(set(sections)):
        raise ValueError("多个字符检查指向同一章节，请合并或改为不同章节")
    for check in enabled:
        if check["method"] != "calculation":
            continue
        spec = check.get("execution")
        if not spec:
            raise ValueError(f'{check["title"]}缺少计量定义')
        if spec["field"] == "section_characters" and not spec["section"].strip():
            raise ValueError("章节字符检查需指定目标章节")
        try:
            if spec["field"] == "plan_interval":
                if spec["operator"] != "within" or date.fromisoformat(spec["value"]) > date.fromisoformat(spec["end"]):
                    raise ValueError()
            elif spec["field"] == "docx_font":
                if not spec["value"].strip():
                    raise ValueError()
            elif spec["field"] not in ("submitted_at", "education"):
                value = Decimal(spec["value"])
                if not value.is_finite() or value < 0:
                    raise ValueError()
        except (ValueError, InvalidOperation):
            raise ValueError(f'{check["title"]}的数值或日期区间无效') from None


def preserve_origins(data, old=None, known=()):
    """Keep each item's first-recorded requirement; a copy inherits it only if the server holds it."""
    prior = {c["id"]: c for c in (old or {}).get("checks", [])}
    held = [c["original"] for r in builtins() for c in r["checks"]] + list(known)
    for check in data["checks"]:
        previous = prior.get(check["id"])
        # Original evidence is immutable; a edited requirement never borrows its authority.
        original = (previous or {}).get("original") or (origin(previous) if previous else None)
        if not original:
            supplied = check.get("original")
            original = supplied if supplied and supplied in held else origin(check)
        check["original"] = deepcopy(original)
        check["revised"] = any(check.get(key) != original.get(key) for key in ("requirement", "execution", "evidence_need"))


UPPER = r"(?:不超过|不多于|不得超过|至多|最多|≤|<=|以内|以下)"


def suggest_execution(check):
    """Program-aligned numeric suggestion for an uploaded clause; a person still confirms it."""
    text = check["requirement"]
    match = re.search(r"(\d+(?:\.\d+)?)\s*(万元|个?字符|字|家|个单位)", text)
    if not match or not re.search(UPPER, text) or check.get("execution"):
        return None
    value, unit = match.groups()
    if unit == "万元":
        return {"field": "total_budget", "operator": "le", "value": value, "unit": "万元", "section": "", "end": ""}
    if unit in ("家", "个单位"):
        return {"field": "organizations", "operator": "le", "value": value, "unit": "家", "section": "", "end": ""}
    section = re.split(r"[，,。；;（(]|不超过|不多于|字数|篇幅|应|须|需", text)[0].strip()
    return {"field": "section_characters", "operator": "le", "value": value, "unit": "字符",
            "section": section if 1 < len(section) <= 30 else "", "end": ""}
