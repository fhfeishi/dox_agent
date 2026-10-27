"""点击提问：时间范围随问题一起交给检索（query 2026-1021 时间维度）。

The QuickAsk panel offers a year span; it reaches the question text so the retriever's project-year
filter and the question agree. The span is carried as its own line rather than folded into the free
note, so a note's wording cannot swallow it.
"""
from src.compose_question import prompt_lines


def test_year_span_becomes_its_own_line():
    lines = prompt_lines("精准问答", ["关键技术"], [], ["AI与医疗"], period="2021—2026")
    assert "时间范围：2021—2026" in lines
    assert lines.index("时间范围：2021—2026") < lines.index("关注要素：关键技术")


def test_no_span_means_no_line():
    assert not any(line.startswith("时间范围") for line in prompt_lines("精准问答", ["场景"], [], ["AI与医疗"]))


def test_span_survives_an_empty_selection():
    lines = prompt_lines("对比分析", [], [], ["AI与医疗"], period="2016—2026")
    assert lines[:3] == ["任务：对比分析", "资料库：AI与医疗", "时间范围：2016—2026"]
