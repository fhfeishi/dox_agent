"""上传规范生成审查模版：草稿要能直接核对后启用（query 2026-1021 1629）。

真实模型对“执行期 2027 年 1 月 1 日至 2029 年 12 月 31 日”“直接费用不低于总预算 80%”给出了
“程序核对”却没有可计算对象，整份草稿因此无法启用。日期区间应绑定成程序核对，其余改为人工核查。
"""

from src.review import guidelines
from src.review.templates import suggest_execution


class PlanClient:
    settings = {"model": "fixture", "max_chars": 240000, "chunk": 12000, "max_calls": 32}
    calls = 1

    def ask(self, phase, payload):
        assert phase == "00_plan"
        source = payload["sources"][0]["source_id"]
        row = lambda title, requirement, method: {  # noqa: E731
            "source_id": source, "title": title, "requirement": requirement, "applicability": "按原文",
            "strength": "hard", "method": method}
        return {"name": "测试指南", "year": 2026, "notes": [], "missing_documents": [], "checks": [
            row("项目执行期", "项目执行期为 2027 年 1 月 1 日至 2029 年 12 月 31 日", "calculation"),
            row("直接费用占比", "直接费用不低于总预算的 80%", "calculation"),
            row("摘要字数", "项目摘要不超过 400 字", "calculation"),
        ]}


def guide():
    return {"id": "g1", "filename": "指南.md", "kind": "md", "pages": [{"page": 1, "text": "申报要求原文"}]}


def test_an_uploaded_draft_has_no_unbound_program_check():
    draft = guidelines.generate([guide()], "formal", PlanClient())
    checks = {check["title"]: check for check in draft["checks"]}
    # The date range becomes the program's plan-interval check
    assert checks["项目执行期"]["method"] == "calculation"
    assert checks["项目执行期"]["execution"]["field"] == "plan_interval"
    assert (checks["项目执行期"]["execution"]["value"], checks["项目执行期"]["execution"]["end"]) == ("2027-01-01", "2029-12-31")
    # A ratio the program cannot count is checked by a person, and the draft says so
    assert checks["直接费用占比"]["method"] == "manual" and checks["直接费用占比"]["execution"] is None
    assert any("直接费用占比" in note and "人工核查" in note for note in draft["extraction_notes"])
    # The usual counting rule is untouched
    assert checks["摘要字数"]["execution"]["field"] == "section_characters"
    assert all(c["execution"] for c in draft["checks"] if c["method"] == "calculation")


def test_date_forms_and_reversed_ranges():
    assert suggest_execution({"requirement": "计划期 2027-1-1 至 2029-12-31"})["value"] == "2027-01-01"
    assert suggest_execution({"requirement": "2029 年 12 月 31 日至 2027 年 1 月 1 日"}) is None
