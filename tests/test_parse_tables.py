"""Parse blocks reach the reader as Markdown, not as the parser's own markup (2026-11-12 1036).

MinerU keeps a table as an HTML string and an inline formula as ``<eq>``. A reader that does not
execute HTML printed that markup literally under the table, which also made the block tall enough to
overlap the text below it. These tests pin the conversion, and pin that the raw form is still there
for JSON view and for a correction's own record.
"""

import json

from src.parse_tables import block_markdown, html_table_to_gfm

SIMPLE = "<table><tr><th>编号</th><th>判别公式</th></tr><tr><td>1</td><td>D1</td></tr></table>"


def test_a_simple_table_becomes_a_pipe_table():
    assert html_table_to_gfm(SIMPLE) == "| 编号 | 判别公式 |\n| --- | --- |\n| 1 | D1 |"


def test_a_merged_cell_keeps_the_table_as_html():
    """A merged or nested table stays HTML, exactly as MinerU does.

    Expanding ``rowspan`` into repeated text invents cells the document does not have; a browser
    renders the merge natively, so the table is passed through instead of being flattened.
    """
    merged = ("<table><tr><td rowspan=\"2\">A</td><td>B</td></tr>"
              "<tr><td>C</td></tr></table>")
    assert html_table_to_gfm(merged) is None
    out = block_markdown(merged)
    assert out.startswith("<table>") and 'rowspan="2"' in out


def test_an_inline_formula_becomes_math_and_keeps_its_latex_commands():
    """The formula's LaTeX is passed through untouched: KaTeX owns what is inside ``$…$``."""
    out = block_markdown("结果 <eq>\\mathrm{HBB} + a_b</eq> 结束")
    assert out == "结果 $\\mathrm{HBB} + a_b$ 结束"


def test_a_table_cell_keeps_its_words_and_escapes_the_pipe():
    out = block_markdown("<table><tr><td>a|b</td></tr></table>")
    assert out == "| a\\|b |\n| --- |"


def test_no_markup_reaches_the_reader():
    """The leak in the report: a stray tag printed as literal angle brackets under the table."""
    out = block_markdown("正文 <span>粗</span> 结束")
    assert "<" not in out and ">" not in out
    assert out == "正文 粗 结束"


def test_an_empty_table_falls_back_to_its_text_instead_of_an_empty_box():
    out = block_markdown("<table><tr><td></td></tr></table>")
    assert "|" not in out


def test_the_block_reader_serves_markdown_and_keeps_the_raw_text(tmp_path):
    """The contract of the block reader: ``text`` is renderable Markdown, ``raw_text`` is the parse.

    ``parse_blocks`` is the single place a MinerU block becomes what a reader sees, so the conversion
    is pinned there rather than through an HTTP call that would need a whole library on disk.
    """
    from src.api.ingest_workbench import build_parse_blocks

    directory = tmp_path / "parsed"
    directory.mkdir()
    (directory / "middle_json.json").write_text(json.dumps({"pages": [{"blocks": [
        {"type": "table", "bbox": [0.1, 0.1, 0.9, 0.4],
         "content": [{"type": "table_body", "bbox": [0.1, 0.1, 0.9, 0.4], "content": SIMPLE}]},
    ]}]}), encoding="utf-8")
    body = build_parse_blocks(directory, 0)
    block = body["blocks"][0]
    assert block["text"].startswith("| 编号 | 判别公式 |")
    assert "<table" in block["raw_text"]
    assert block["raw_text"] != block["text"]


def test_alignment_is_recovered_from_the_block_box():
    """The parse records no alignment; the box does, and it is what lines the panes up.

    A heading whose box is centred on the page is a centred heading, a block ending at the right
    margin is right-aligned, and ordinary body text stays left.
    """
    from src.api.ingest_workbench import _text_align

    assert _text_align([0.336, 0.233, 0.665, 0.267]) == "center"
    assert _text_align([0.1, 0.09, 0.9, 0.3]) == "left"
    assert _text_align([0.4, 0.1, 0.95, 0.15]) == "right"
    assert _text_align(None) == "left"


def test_a_table_block_drops_its_cropped_picture(tmp_path):
    """MinerU's rule (docvortex ``_render_table_body``): content replaces the picture, not both."""
    from src.api.ingest_workbench import build_parse_blocks

    directory = tmp_path / "parsed"
    directory.mkdir()
    (directory / "middle_json.json").write_text(json.dumps({"pages": [{"blocks": [
        {"type": "table", "bbox": [0.1, 0.1, 0.9, 0.4],
         "content": [{"type": "table_body", "bbox": [0.1, 0.1, 0.9, 0.4],
                      "image_path": "images/page_0_table_1.jpg", "content": SIMPLE}]},
    ]}]}), encoding="utf-8")
    block = build_parse_blocks(directory, 0)["blocks"][0]
    assert block["images"] == []
    assert block["text"].startswith("| 编号 | 判别公式 |")


def test_a_block_records_whether_it_continues_the_previous_page(tmp_path):
    """MinerU marks a block that starts on the previous page; the reader must not present half a
    paragraph as a whole one (2026-11-12 1036)."""
    from src.api.ingest_workbench import build_parse_blocks

    directory = tmp_path / "parsed"
    directory.mkdir()
    (directory / "middle_json.json").write_text(json.dumps({"pages": [{"blocks": [
        {"type": "text", "bbox": [0.1, 0.1, 0.9, 0.3], "continues_prev": True,
         "content": [{"type": "text", "content": "从上一页接续的段落"}]},
        {"type": "text", "bbox": [0.1, 0.31, 0.9, 0.4],
         "content": [{"type": "text", "content": "本页新段落"}]},
    ]}]}), encoding="utf-8")
    blocks = build_parse_blocks(directory, 0)["blocks"]
    assert blocks[0]["continues_prev"] is True
    assert blocks[1]["continues_prev"] is False


def test_an_inline_formula_child_keeps_its_math_marker():
    """MinerU nests a formula as an ``equation_inline`` child; joining it as plain text left the
    reader with literal ``\\mathrm{D}1>0`` in the paragraph (2026-11-12 1036)."""
    from src.parse_tables import block_markdown
    from src.parsers import _block_text

    block = {"type": "text", "content": [
        {"type": "text", "content": "结果判读: "},
        {"type": "equation_inline", "content": "\\mathrm{D}1>0, \\mathrm{D}2<0"},
        {"type": "text", "content": "，判别为月经血样本。"},
    ]}
    out = block_markdown(_block_text(block))
    assert "$\\mathrm{D}1>0, \\mathrm{D}2<0$" in out
    assert "，判别为月经血样本。" in out


def test_a_run_that_spans_pages_reports_where_it_starts(tmp_path):
    """``continues_prev`` says "from the previous page"; a three-page run needs the first of them."""
    from src.api.ingest_workbench import build_parse_blocks

    directory = tmp_path / "parsed"
    directory.mkdir()
    body = lambda text, cont=False: {  # noqa: E731 - a fixture builder, not a public helper
        "type": "text", "bbox": [0.1, 0.1, 0.9, 0.3],
        **({"continues_prev": True} if cont else {}),
        "content": [{"type": "text", "content": text}],
    }
    header = {"type": "header", "bbox": [0.1, 0.03, 0.9, 0.05], "content": []}
    (directory / "middle_json.json").write_text(json.dumps({"pages": [
        {"blocks": [header, body("第一页开始")]},
        {"blocks": [header, body("第二页接续", cont=True)]},
        {"blocks": [header, body("第三页接续", cont=True)]},
    ]}), encoding="utf-8")
    # Page 2 (index 1) continues page 0; page 2's own run starts there.
    assert build_parse_blocks(directory, 1)["blocks"][1]["continues_from"] == 0
    # Page 3 (index 2) walks back through page 1 (whose first body block also continues) to page 0.
    assert build_parse_blocks(directory, 2)["blocks"][1]["continues_from"] == 0
    # A block that does not continue reports nothing.
    assert build_parse_blocks(directory, 0)["blocks"][1]["continues_from"] is None
