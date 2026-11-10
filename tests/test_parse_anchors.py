"""A2-a: anchors read from the file name, located in the parse's page text. Local only, no model."""

from src.parse_anchors import anchors_for, check_anchors

REL = "2022_2025_72174134_张三_大数据驱动的网络谣言精准治理问题研究.pdf"


def test_anchors_come_from_the_file_name():
    """The number, both years and a title fragment are read from the name; nothing is guessed."""
    kinds = [item["kind"] for item in anchors_for(REL)]
    assert kinds == ["project_number", "year", "year", "title"]
    assert [item["anchor"] for item in anchors_for(REL)[:3]] == ["72174134", "2022", "2025"]
    # An alphanumeric fund number keeps its form; a file name with none yields no anchor.
    assert anchors_for("2021_2025_U21A20373_面向宫颈癌近距离放疗实施精准导航系统关键技术研究.pdf")[0] == {
        "anchor": "U21A20373", "kind": "project_number"}
    assert anchors_for("会议纪要.md") == []


def test_found_anchors_name_the_page_they_appear_on():
    pages = ["封面 项目批准号 72174134\n资助类别 面上项目", "正文 大数据驱动的网络谣言精准治理问题研究\n起止年月 2022.01-2025.12"]
    result = check_anchors(REL, pages)
    located = {item["anchor"]: item["page"] for item in result["checked"]}
    assert located == {"72174134": 1, "2022": 2, "2025": 2, "大数据驱动的网络谣言精准": 2}
    assert result["matched"] == 4 and result["missing"] == [] and result["page_count"] == 2


def test_missing_anchors_are_reported_not_raised():
    """A parse of the wrong document still returns a result: the reader learns which anchor is absent."""
    pages = ["封面 项目批准号 72174134", "正文 完全不相关的另一份材料"]
    result = check_anchors(REL, pages)
    assert result["matched"] == 1
    assert [item["anchor"] for item in result["missing"]] == ["2022", "2025", "大数据驱动的网络谣言精准"]
    assert all(item["found"] is False and item["page"] is None for item in result["missing"])
    # A parse with no page text at all: every anchor missing, no exception, page count 0.
    empty = check_anchors(REL, None)
    assert empty["matched"] == 0 and len(empty["missing"]) == 4 and empty["page_count"] == 0


def test_matching_ignores_separators_a_pdf_or_ocr_may_insert():
    """A title split by a line break or spaced punctuation is still the same title."""
    pages = ["正文 大数据驱动的 网络谣言、精准治理问题研究"]
    result = check_anchors(REL, pages)
    title = next(item for item in result["checked"] if item["kind"] == "title")
    assert title["found"] is True and title["page"] == 1
