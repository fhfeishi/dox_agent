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


def test_a_merged_cell_keeps_its_grid_position():
    """``rowspan``/``colspan`` expand into a real grid, so no cell shifts into the wrong column."""
    merged = ("<table><tr><td rowspan=\"2\">A</td><td>B</td></tr>"
              "<tr><td>C</td></tr></table>")
    assert html_table_to_gfm(merged) == "| A | B |\n| --- | --- |\n| A | C |"


def test_an_inline_formula_becomes_math_with_markdown_characters_escaped():
    """``$…$`` is plain text without a math renderer, so ``*`` and ``_`` must not become emphasis."""
    out = block_markdown("结果 <eq>0.291*HBB + a_b</eq> 结束")
    assert out == r"结果 $0.291\*HBB + a\_b$ 结束"


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
