"""L2/L3b/L4a：报告级检索核心的行为测试（不依赖存储、图或真实 mineru）。

场景按 Given / When / Then 组织；断言对外可观察结果（分块字段、选中报告、无匹配），
不断言内部实现细节（BM25 调用、排序算法步骤）。
"""

import hashlib
from dataclasses import replace

from src.retrieval import (
    Chunk,
    RawBlock,
    ReportDoc,
    RetrievalConfig,
    chunk_blocks,
    metadata_from_filename,
    select_reports,
    strip_base64,
)


def chunk_of(doc_id: str, text: str, *, version: str = "v", page: int = 1, heading: str = "") -> Chunk:
    chunk_id = hashlib.sha1(f"{doc_id}|{version}|{page}|{heading}|{text}".encode()).hexdigest()
    return Chunk(chunk_id, doc_id, version, doc_id, heading, page, text)


def test_user_reads_report_text_without_base64_image_noise():
    # Given a mineru markdown block that embeds a base64 image
    blocks = [RawBlock(page=1, text="正文开始\n图：data:image/png;base64,AAAA////\nBBBB 结束")]
    # When the block is chunked
    chunks = chunk_blocks("doc", "v1", "报告", blocks)
    # Then only text remains, with an explicit placeholder
    assert chunks
    assert all("base64" not in chunk.text for chunk in chunks)
    assert "[图片]" in chunks[0].text


def test_user_gets_stable_chunk_ids_that_follow_document_version():
    # Given the same block parsed under two versions
    same = chunk_blocks("doc", "v1", "报告", [RawBlock(1, "一段正文内容")])
    again = chunk_blocks("doc", "v1", "报告", [RawBlock(1, "一段正文内容")])
    newer = chunk_blocks("doc", "v2", "报告", [RawBlock(1, "一段正文内容")])
    # When comparing chunk ids
    # Then identical input is stable and a version change invalidates them
    assert same[0].chunk_id == again[0].chunk_id
    assert same[0].chunk_id != newer[0].chunk_id


def test_user_gets_tables_kept_whole_even_when_over_budget():
    # Given an oversized table block
    table = "| 列A | 列B |\n" * 200
    # When chunking with a small budget
    chunks = chunk_blocks("doc", "v1", "报告", [RawBlock(1, table, kind="table")], max_chars=200)
    # Then the table stays in one unbroken chunk
    assert len(chunks) == 1
    assert chunks[0].text.count("| 列A | 列B |") == 200


def test_user_sees_section_heading_attached_to_chunk():
    # Given a title block followed by body text
    blocks = [RawBlock(1, "## 研究方法", kind="title"), RawBlock(1, "本文提出一种方法")]
    # When chunking
    chunks = chunk_blocks("doc", "v1", "报告", blocks)
    # Then the heading is exposed and included in the chunk text
    assert chunks[0].heading == "研究方法"
    assert chunks[0].text.startswith("研究方法\n")


def test_user_finds_the_report_that_answers_the_question():
    # Given two reports, only one about the asked topic
    epilepsy = ReportDoc("a", "v", "癫痫网络研究", headings=("癫痫致痫网络",))
    finance = ReportDoc("b", "v", "金融风险研究", headings=("金融风险",))
    chunks = {
        "a": [chunk_of("a", "癫痫致痫网络的特征识别方法")],
        "b": [chunk_of("b", "金融风险量化模型")],
    }
    # When selecting reports for the question
    result = select_reports(chunks, [epilepsy, finance], "癫痫致痫网络")
    # Then only the relevant report is selected and it is marked as matched
    assert result.matched
    assert [report.doc.doc_id for report in result.reports] == ["a"]
    assert result.reports[0].term_cover == 1.0


def test_user_gets_one_report_per_project_when_reports_repeat():
    # Given two reports of the same project that both match
    first = ReportDoc("a", "v", "报告一", project_no="82030037")
    second = ReportDoc("b", "v", "报告二", project_no="82030037")
    chunks = {
        "a": [chunk_of("a", "癫痫致痫网络方法")],
        "b": [chunk_of("b", "癫痫致痫网络方法更详细")],
    }
    # When selecting reports
    result = select_reports(chunks, [first, second], "癫痫致痫网络")
    # Then the project contributes a single report
    assert result.matched
    assert len(result.reports) == 1


def test_user_gets_no_match_when_no_theme_term_overlaps():
    # Given a report unrelated to the question
    report = ReportDoc("a", "v", "癫痫网络研究")
    chunks = {"a": [chunk_of("a", "癫痫致痫网络特征")]}
    # When selecting reports for an unrelated question
    result = select_reports(chunks, [report], "量子纠缠计算")
    # Then the turn is reported as no matching report
    assert not result.matched
    assert result.reason == "no_reports"


def test_user_only_sees_documents_inside_the_allowed_scope():
    # Given two matching reports
    first = ReportDoc("a", "v", "癫痫网络研究")
    second = ReportDoc("b", "v", "癫痫其他研究")
    chunks = {
        "a": [chunk_of("a", "癫痫致痫网络")],
        "b": [chunk_of("b", "癫痫致痫网络")],
    }
    # When the user scopes the turn to the second report
    result = select_reports(chunks, [first, second], "癫痫致痫网络", allowed_doc_ids=["b"])
    # Then no result comes from outside the scope
    assert [report.doc.doc_id for report in result.reports] == ["b"]


def test_user_gets_fund_project_metadata_from_filename():
    # Given a fund report filename
    name = "2021_2025_82030037_赵国光_基于AI的癫痫致痫网络研究.pdf"
    # When metadata is derived
    meta = metadata_from_filename(name)
    # Then the project number and reporting years are available for dedup and filtering
    assert meta == {"year_from": 2021, "year_to": 2025, "project_no": "82030037"}


def test_user_gets_generic_terms_filtered_from_coverage():
    # Given one report with the specific topic and two reports that only share generic terms
    epilepsy = ReportDoc("a", "v", "癫痫的应用")
    generic_one = ReportDoc("b", "v", "应用的应用")
    generic_two = ReportDoc("c", "v", "应用研究")
    chunks = {
        "a": [chunk_of("a", "癫痫的应用")],
        "b": [chunk_of("b", "应用的应用")],
        "c": [chunk_of("c", "应用研究")],
    }
    # When selecting reports for a query whose high-DF term is generic
    result = select_reports(chunks, [epilepsy, generic_one, generic_two], "癫痫的应用")
    # Then only the report covering the specific term is selected
    assert result.matched
    assert [report.doc.doc_id for report in result.reports] == ["a"]


def test_user_project_metadata_agrees_with_fund_name_pattern():
    from src.agent.corpora import FUND_NAME_PATTERN
    # Given corpus filenames that match the fund pattern
    names = ["2021_2025_82030037_赵国光_基于AI的癫痫致痫网络研究.pdf",
             "2022_2025_U21A20383_林天歆_基于人工智能的泌尿系统肿瘤诊疗平台研发与应用.pdf"]
    # When metadata is derived and compared with the corpus pattern
    for name in names:
        assert FUND_NAME_PATTERN.match(name)
        meta = metadata_from_filename(name)
        assert meta["project_no"] == name.split("_")[2]
        assert (meta["year_from"], meta["year_to"]) == (int(name[:4]), int(name[5:9]))


def test_user_sees_partial_when_fewer_reports_than_task_minimum():
    # Given a task2 turn that needs two reports but only one project matches
    report = ReportDoc("a", "v", "癫痫网络研究")
    chunks = {"a": [chunk_of("a", "癫痫致痫网络与对比分析")]}
    # When selecting reports for task2 (default minimum is two reports)
    result = select_reports(chunks, [report], "癫痫致痫网络与对比分析", task_id="task2")
    # Then the shortfall is surfaced instead of silently padding weak reports
    assert result.matched and result.partial


def test_user_keeps_prose_after_inline_base64_image():
    # Given an inline base64 image followed by an English paragraph
    text = "图 data:image/png;base64,AAAA/BBBB== Discussion continues"
    # When stripping images
    clean = strip_base64(text)
    # Then only the image is replaced; the following prose is not swallowed
    assert clean == "图 [图片] Discussion continues"


def test_user_keeps_following_text_after_image_payload_punctuation():
    # Given a payload ending in '=' followed by punctuation and prose
    clean = strip_base64("x data:image/png;base64,AAAA==> y")
    # Then the punctuation and prose survive
    assert clean == "x [图片]> y"


def test_user_keeps_prose_after_multiline_base64_image():
    # Given a wrapped base64 payload followed by Chinese prose on the next line
    clean = strip_base64("图 data:image/png;base64,AAAA\nBBBB 正文继续")
    # Then the image is replaced and the prose is preserved
    assert clean.startswith("图 [图片]")
    assert "正文继续" in clean


def test_user_gets_direct_path_for_query_without_content_terms():
    # Given a query made only of generic academic words
    report = ReportDoc("a", "v", "癫痫网络研究")
    chunks = {"a": [chunk_of("a", "癫痫致痫网络")]}
    # When selecting reports
    result = select_reports(chunks, [report], "研究")
    # Then it is a direct-answer turn, not a no-match failure
    assert not result.matched and result.reason == "direct"


def test_user_recalls_report_matching_only_the_extra_query():
    # Given the primary query matches both reports' chunks but only one report index
    # has the extra query term
    chinese = ReportDoc("a", "v", "报告A")
    genomics = ReportDoc("b", "v", "报告B", headings=("genomics",))
    chunks = {
        "a": [chunk_of("a", "癫痫网络特征")],
        "b": [chunk_of("b", "癫痫网络 genomics 特征")],
    }
    config = replace(RetrievalConfig(), report_recall_m=1, generic_df_ratio=1.1)
    # When the extra query contributes the only report-index hit
    result = select_reports(chunks, [chinese, genomics], "癫痫网络特征",
                            config=config, extra_queries=["genomics"])
    # Then Layer A recalls the report that only the extra query matches
    assert [report.doc.doc_id for report in result.reports] == ["b"]


def test_user_coverage_counts_all_candidate_chunks_not_only_top_scored():
    # Given two candidate chunks that each cover different query terms
    report = ReportDoc("a", "v", "报告")
    chunks = {"a": [chunk_of("a", "癫痫网络"), chunk_of("a", "肝癌诊断")]}
    config = replace(RetrievalConfig(), per_doc_top_m=1, min_term_cover=1.0)
    # When the top-scored chunk alone would not cover the question
    result = select_reports(chunks, [report], "癫痫 肝癌", config=config)
    # Then coverage is computed over all candidates, so the report still matches
    assert result.matched and result.reports[0].term_cover == 1.0


def test_user_can_cite_every_candidate_chunk_not_only_scored_top():
    # Given a report with more matching chunks than the scoring top-m
    report = ReportDoc("a", "v", "报告")
    chunks = {"a": [chunk_of("a", f"癫痫网络第{i}段") for i in range(5)]}
    config = replace(RetrievalConfig(), per_doc_cand=4, per_doc_top_m=1)
    # When selecting reports
    result = select_reports(chunks, [report], "癫痫网络", config=config)
    # Then the citable set is per_doc_cand, independent of the scoring top-m
    assert result.matched
    assert len(result.reports[0].chunks) == 4


def test_user_keeps_distinct_reports_when_project_number_is_unknown():
    # Given two matching reports without a project number
    first = ReportDoc("a", "v", "报告一")
    second = ReportDoc("b", "v", "报告二")
    chunks = {"a": [chunk_of("a", "癫痫网络方法")], "b": [chunk_of("b", "癫痫网络方法二")]}
    # When selecting reports
    result = select_reports(chunks, [first, second], "癫痫网络")
    # Then neither report is dropped by treating the (empty) project as shared
    assert {report.doc.doc_id for report in result.reports} == {"a", "b"}
