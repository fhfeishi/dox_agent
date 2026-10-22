"""点选提问的时间维度（query 2026-1021）：选的年份区间既要写进问题，也要真的收窄检索。

场景按 Given / When / Then 组织，断言对外可观察的结果：请求体的规范形式、模型输入里的年份、
以及时间窗内没有项目时检索的退化行为。
"""

import hashlib

import pytest
from pydantic import ValidationError

from src.api.common import ComposeRequest
from src.compose_question import prompt_lines
from src.retrieval import Chunk, ReportDoc, select_reports


def chunk_of(doc_id: str, text: str) -> Chunk:
    chunk_id = hashlib.sha1(f"{doc_id}|{text}".encode()).hexdigest()
    return Chunk(chunk_id, doc_id, "v", doc_id, "", 1, text)


def request(**extra) -> ComposeRequest:
    return ComposeRequest(task="精准问答", elements=["关键技术"], intents=[], corpus_ids=["c"], **extra)


def test_picked_window_reaches_the_model_verbatim():
    # Given a request carrying the window the user picked
    payload = request(period="2021-2026")
    # When the model input is built
    lines = prompt_lines(payload.task, payload.elements, payload.intents, ["自然科学基金-医疗"], "", "", payload.period)
    # Then the normalised year span is there, in the shape the retriever filters on
    assert payload.period == "2021—2026"
    assert any("2021—2026" in line for line in lines)


def test_a_window_with_no_project_falls_back_to_every_year():
    # Given two reports that both end in 2013
    old = ReportDoc("a", "v", "癫痫网络研究", year_from=2010, year_to=2013)
    chunks = {"a": [chunk_of("a", "癫痫致痫网络")]}
    # When the user asks inside a window those projects cannot meet
    result = select_reports(chunks, [old], "2023—2026 癫痫致痫网络")
    # Then the search is not empty: it runs over every year and says the window did not apply
    assert [report.doc.doc_id for report in result.reports] == ["a"]
    assert result.year_relaxed is True
    assert result.year_window is None


def test_a_window_with_projects_still_filters_strictly():
    # Given a report inside the window and one outside it
    inside = ReportDoc("a", "v", "癫痫网络研究", year_from=2021, year_to=2025)
    outside = ReportDoc("b", "v", "癫痫其他研究", year_from=2010, year_to=2013)
    chunks = {"a": [chunk_of("a", "癫痫致痫网络")], "b": [chunk_of("b", "癫痫致痫网络")]}
    # When the user asks inside the window
    result = select_reports(chunks, [inside, outside], "2022—2026 癫痫致痫网络")
    # Then only the project that meets the window is searched, and the window is reported
    assert [report.doc.doc_id for report in result.reports] == ["a"]
    assert result.year_relaxed is False
    assert result.year_window == (2022, 2026)


def test_a_reversed_window_is_refused():
    # Given years in the wrong order
    with pytest.raises(ValidationError):
        request(period="2026—2021")
    # And a window that is not years at all
    with pytest.raises(ValidationError):
        request(period="近五年")
