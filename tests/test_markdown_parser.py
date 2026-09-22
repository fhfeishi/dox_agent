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
