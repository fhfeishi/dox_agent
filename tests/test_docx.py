"""K8: offline Word (.docx) parsing into searchable text; G10e-D: export subset."""

import io

from docx import Document as DocxDocument

from src.agent.config import Settings
from src.docx_export import markdown_to_docx
from src.agent.corpora import SOURCE_SUFFIXES
from src.parsers import parse_file


def test_docx_paragraphs_and_tables_become_text(tmp_path):
    path = tmp_path / "报告.docx"
    document = DocxDocument()
    document.add_paragraph("第一段正文")
    table = document.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "项目"
    table.rows[0].cells[1].text = "编号"
    document.save(path)

    parsed = parse_file(path, Settings(_env_file=None))
    assert parsed.kind == "text"
    assert parsed.parser.startswith("python-docx/")
    assert "第一段正文" in parsed.pages[0].text
    assert "项目 | 编号" in parsed.pages[0].text
    assert ".docx" in SOURCE_SUFFIXES


def _read(data: bytes):
    return DocxDocument(io.BytesIO(data))


def test_export_appends_a_readable_source_appendix():
    markdown = "# 结论\n\n主要发现 [1]，补充证据 [2]。"
    citations = [{"doc_id": "d1", "title": "癫痫报告", "page": 3, "corpus_id": "c1", "version": "v1"},
                 {"kind": "web", "title": "公开资料", "url": "https://example.com/a",
                  "fetched_at": "2026-09-24T00:00:00+00:00"}]

    document = _read(markdown_to_docx(markdown, citations=citations))
    text = "\n".join(paragraph.text for paragraph in document.paragraphs)

    assert "引用来源" in text
    assert "[1] 癫痫报告（第 3 页；知识库 c1）" in text
    assert "[2] 公开资料（https://example.com/a；抓取于 2026-09-24T00:00:00+00:00）" in text
    assert "主要发现 [1]" in text


def test_export_without_citations_has_no_appendix():
    document = _read(markdown_to_docx("# 标题\n\n正文"))
    assert "引用来源" not in "\n".join(paragraph.text for paragraph in document.paragraphs)


def test_export_keeps_code_fences_and_quotes_readable():
    markdown = "```\n第一行代码\n第二行代码\n```\n\n> 引用说明\n> 第二行"

    document = _read(markdown_to_docx(markdown))
    text = "\n".join(paragraph.text for paragraph in document.paragraphs)

    assert "第一行代码\n第二行代码" in text
    assert "引用说明 第二行" in text
    assert "```" not in text
