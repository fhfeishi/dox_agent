"""Markdown/text source parsing labels (preview rendering depends on the parser label)."""

from src.agent.config import Settings
from src.parsers import parse_file


def test_markdown_file_uses_markdown_parser(tmp_path):
    path = tmp_path / "README.md"
    path.write_text("# 标题\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n", encoding="utf-8")
    parsed = parse_file(path, Settings(_env_file=None))
    assert parsed.parser == "markdown"
    assert parsed.kind == "text"
    assert parsed.markdown.startswith("# 标题")


def test_txt_file_keeps_utf8_parser(tmp_path):
    path = tmp_path / "notes.txt"
    path.write_text("普通正文", encoding="utf-8")
    assert parse_file(path, Settings(_env_file=None)).parser == "utf8"


def test_pdf_failure_reads_as_a_reason_not_a_log():
    from src.parsers import mineru_failure

    log = ("2026-10-21 09:15:03.008 | WARNING  | mineru.integrations.docvortex:read_source_properties:41 - "
           "metadata_unavailable: Cannot read document metadata: Failed to load document (PDFium: Data format error).\n"
           "Error: Failed to parse \n/tmp/tmpotxvbvg2/corpora/验收/source/扫描件.pdf\n")
    assert mineru_failure(log) == "文件不是有效的 PDF：可能已损坏，或只是改了扩展名"
    assert mineru_failure("Error: PDF is encrypted") == "PDF 设有密码，无法读取"
    # Unknown causes keep the last real line, without log prefixes or paths.
    other = mineru_failure("2026-10-21 09:15:03 | INFO | start\nRuntimeError: out of memory at /home/u/x.pdf\n")
    assert other == "PDF 解析失败：RuntimeError: out of memory at" and "/home" not in other
