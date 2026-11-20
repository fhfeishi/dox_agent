"""Deterministic checks on a generated report (2026-11-13).

The expert texts change what the model reads; they cannot guarantee what it writes. Real data: of
seven ``comprehensive`` reports on this machine, five were missing sections the template asks for —
most often 「五、四维技术图谱」 — while every requirement was already stated in the prompts
(``base.md``, ``task4_report.md``). The requirement existed; nothing checked it.

These checks are the missing half. They are pure functions of (markdown, template) so they can be
tested without a model, and their output is a list of complaints specific enough to hand to the
existing repair turn (``src/reports.py``): "缺少章节：五、四维技术图谱" is actionable in a way that
"标题、章节或来源编号问题" was not.

Matching is normalised rather than exact, because real reports drift in two ways this project has
actually produced: the numbering moves when a section is dropped ("六、来源清单与局限" written as
"五、来源清单与局限") and a qualifier is appended ("三、热点与趋势（仅限本次样本）").
"""

import re

_HEADING = re.compile(r"(?m)^##\s+(.+?)\s*$")
_APPENDIX = "来源附录（系统记录）"

# A heading's own numbering and trailing qualifier carry no meaning for "is this section present".
# 「三、热点与趋势（仅限本次样本）」and 「三、热点与趋势」are the same section; 「五、」and 「六、」are not
# distinguished because a dropped section shifts every later number.
_NUMBERING = re.compile(r"^[（(]?[一二三四五六七八九十\d]+[）)]?[、.．)）]\s*")
_QUALIFIER = re.compile(r"[（(][^）)]*[）)]\s*$")


def sections(markdown: str) -> list[str]:
    """The ``##`` headings of a report, without the system's own source appendix."""
    return [title for title in (match.group(1).strip() for match in _HEADING.finditer(markdown or ""))
            if title != _APPENDIX]


def normalise(title: str) -> str:
    """A heading reduced to what makes it that section: no numbering, no trailing qualifier."""
    text = _NUMBERING.sub("", (title or "").strip())
    text = _QUALIFIER.sub("", text).strip()
    return re.sub(r"\s+", "", text)


def template_sections(template_markdown: str) -> list[str]:
    """The sections a template asks for, in order."""
    return [title for title in sections(template_markdown)]


def check_sections(markdown: str, template_markdown: str) -> list[str]:
    """Which of the template's sections are missing, by their template wording."""
    if not template_markdown:
        return []
    present = {normalise(title) for title in sections(markdown)}
    return [f"缺少章节：{wanted}" for wanted in template_sections(template_markdown)
            if normalise(wanted) not in present]


# 「事实与研判分开」is the one constraint with a recorded real failure: the single 技术研判 report
# produced on this machine had sections 「事实基础 / 推断方向 / 不确定性与前提」 and never used the word
# 研判 at all. The check cannot judge quality; it can insist the split exists and is labelled.
_JUDGMENT_WORDS = re.compile(r"判断|推断|研判|推测")
_LIMITS = re.compile(r"局限|限制|不确定|样本不足|范围之外")
_SCOPE = re.compile(r"资料范围|资料来源|检索范围|数据范围")


def check_judgment(markdown: str, *, task_type: str = "report") -> list[str]:
    """A judgment-bearing task must separate fact from inference and label the inference."""
    if task_type not in ("report", "intelligence", "assess"):
        return []
    headings = sections(markdown)
    judgments = [title for title in headings if _JUDGMENT_WORDS.search(title)]
    if not judgments:
        return ["缺少研判章节：事实与判断要分开写，研判章节标题需含「判断」或「推断」"]
    problems = []
    # "Fact and judgment are separate" is satisfied by the judgment section being one section
    # among the others: a report whose every heading is a judgment has no factual part at all.
    if len(judgments) == len(headings):
        problems.append("事实与研判没有分开：所有章节都是判断，缺少陈列事实的章节")
    if not _LIMITS.search(markdown):
        problems.append("缺少局限说明：研判要写明不确定性与前提")
    return problems


def check_scope(markdown: str) -> list[str]:
    """``base.md`` §13 requires 「资料范围与局限」 at the end of an answer; reports rarely comply."""
    problems = []
    if not _SCOPE.search(markdown or ""):
        problems.append("缺少资料范围：开头或结尾要写明这次用了哪些资料")
    if not _LIMITS.search(markdown or ""):
        problems.append("缺少局限说明：要写明样本边界与未覆盖的部分")
    return problems


# Which templates actually ask for a judgment. A 资料综述 (``report_mode: review``) reports what the
# material says; demanding a 研判 section there would send a good report back for repair over a
# section its own template never asked for.
JUDGMENT_TEMPLATES = ("intelligence", "future_directions", "hotspots")


def check_report(markdown: str, template_markdown: str = "", *, task_type: str = "report",
                 template_id: str = "") -> list[str]:
    """Every complaint about one report, in the order a person would fix them."""
    problems = check_sections(markdown, template_markdown)
    wants_judgment = task_type == "intelligence" or str(template_id).startswith(JUDGMENT_TEMPLATES)
    if wants_judgment:
        problems += check_judgment(markdown, task_type=task_type)
    # A duplicate complaint about the same missing paragraph helps nobody: the judgment check and
    # the scope check both notice a missing 局限 sentence.
    seen, unique = set(), []
    for problem in problems:
        if problem not in seen:
            seen.add(problem)
            unique.append(problem)
    return unique
