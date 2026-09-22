"""K13: mineru output adapter and CLI wiring (no real mineru required)."""

import json
import sys
from pathlib import Path

import pytest

from src.agent.config import Settings
from src.parsers import parse_file, read_mineru_output


def test_read_classic_content_list_groups_by_page(tmp_path):
    (tmp_path / "full.md").write_text("# 标题\n正文", encoding="utf-8")
    (tmp_path / "abc_content_list.json").write_text(json.dumps([
        {"type": "text", "text": "第一页", "page_idx": 0},
        {"type": "text", "text": "第二页上", "page_idx": 1},
        {"type": "text", "text": "第二页下", "page_idx": 1},
    ], ensure_ascii=False), encoding="utf-8")
    markdown, pages = read_mineru_output(tmp_path)
    assert markdown.startswith("# 标题")
    assert [page.number for page in pages] == [1, 2]
    assert pages[0].text == "第一页"
    assert pages[1].text == "第二页上\n第二页下"


def test_read_v4_middle_json_blocks(tmp_path):
    (tmp_path / "out.md").write_text("# T", encoding="utf-8")
    (tmp_path / "x_middle.json").write_text(json.dumps({"pages": [
        {"page_idx": 0, "blocks": [{"type": "text", "content": [{"type": "text", "content": "P1"}]}]},
        {"page_idx": 1, "blocks": [{"type": "text", "content": [{"type": "text", "content": "P2"}]}]},
    ]}, ensure_ascii=False), encoding="utf-8")
    _, pages = read_mineru_output(tmp_path)
    assert [page.text for page in pages] == ["P1", "P2"]


def test_read_without_page_json_falls_back_to_single_markdown_page(tmp_path):
    (tmp_path / "full.md").write_text("# 只有正文", encoding="utf-8")
    markdown, pages = read_mineru_output(tmp_path)
    assert markdown == "# 只有正文"
    assert len(pages) == 1 and pages[0].number == 1 and "只有正文" in pages[0].text


def fake_mineru(tmp_path: Path, page_idx: int = 1, text: str = "PDF第二页") -> str:
    script = tmp_path / "fake_mineru.py"
    script.write_text(
        "import json, pathlib, sys\n"
        "out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)\n"
        "(out / 'full.md').write_text('# md', encoding='utf-8')\n"
        f"(out / 'x_content_list.json').write_text(json.dumps([{{'type': 'text', 'text': {text!r}, 'page_idx': {page_idx}}}]))\n",
        encoding="utf-8")
    return f"{sys.executable} {script} {{pdf}} {{out}}"


def test_parse_file_runs_command_and_caches_output(tmp_path):
    pdf = tmp_path / "报告.pdf"
    pdf.write_bytes(b"%PDF-1.4 stub")
    settings = Settings(_env_file=None, mineru_cmd=fake_mineru(tmp_path, page_idx=1))
    parsed = tmp_path / "parsed"
    doc = parse_file(pdf, settings, parsed_dir=parsed)
    assert doc.parser == "mineru" and doc.kind == "pdf"
    assert [page.number for page in doc.pages] == [2]
    assert (parsed / "full.md").is_file()


def test_parse_file_reports_missing_mineru_command(tmp_path):
    pdf = tmp_path / "x.pdf"
    pdf.write_bytes(b"%PDF-1.4")
    settings = Settings(_env_file=None, mineru_cmd="definitely-not-a-real-mineru {pdf} {out}")
    with pytest.raises(ValueError, match="mineru"):
        parse_file(pdf, settings, parsed_dir=tmp_path / "parsed")
