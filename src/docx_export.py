"""W3-B: real OOXML (.docx) export from report/answer Markdown (frozen spec §16.15.4).

The prior "Word" export was Word-compatible HTML (``.doc``); this is a genuine ``.docx`` built
with python-docx so headings, tables and paragraphs survive a round trip.
"""

import io
import re

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_TABLE_SEPARATOR = re.compile(r"^\s*\|?[\s:|-]+\|?\s*$")
_LIST = re.compile(r"^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$")
_LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)")


def _split_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _plain(text: str) -> str:
    return re.sub(r"(?:\*\*|__|[*_`])", "", text).strip()


def _add_text(paragraph, value: str) -> None:
    """Keep readable link text and a clickable external relationship in the same paragraph."""
    cursor = 0
    for match in _LINK.finditer(value):
        paragraph.add_run(_plain(value[cursor:match.start()]))
        relationship = paragraph.part.relate_to(match.group(2), RT.HYPERLINK, is_external=True)
        hyperlink = OxmlElement("w:hyperlink")
        hyperlink.set(qn("r:id"), relationship)
        run = OxmlElement("w:r")
        node = OxmlElement("w:t")
        node.text = match.group(1)
        run.append(node)
        hyperlink.append(run)
        paragraph._p.append(hyperlink)
        cursor = match.end()
    paragraph.add_run(_plain(value[cursor:]))


def _styles(document) -> None:
    section = document.sections[0]
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.top_margin = section.bottom_margin = Cm(2.5)
    section.left_margin = section.right_margin = Cm(2.5)
    for name, font_name, size in (("Normal", "宋体", 11), ("Title", "黑体", 18),
                                  ("Heading 1", "黑体", 16), ("Heading 2", "黑体", 14)):
        style = document.styles[name]
        style.font.name = font_name
        style.font.size = Pt(size)
        style._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), font_name)


def markdown_to_docx(markdown: str) -> bytes:
    """Render Markdown headings, tables and paragraphs into a real ``.docx`` byte string."""
    if re.search(r"(?m)^\s*\$\$|\\\[|\\\(", markdown):
        raise ValueError("当前 Word 导出尚不支持公式排版，请先下载 Markdown 原文")
    document = Document()
    _styles(document)
    lines = markdown.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        heading = _HEADING.match(line)
        if heading:
            paragraph = document.add_heading(level=min(len(heading.group(1)), 6))
            _add_text(paragraph, heading.group(2))
            if len(heading.group(1)) == 1:
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            index += 1
            continue
        if "|" in line and index + 1 < len(lines) and _TABLE_SEPARATOR.match(lines[index + 1]):
            header = _split_row(line)
            index += 2
            rows = []
            while index < len(lines) and "|" in lines[index] and lines[index].strip():
                rows.append(_split_row(lines[index]))
                index += 1
            if header:
                table = document.add_table(rows=1, cols=len(header))
                for column, text in enumerate(header):
                    table.rows[0].cells[column].text = _plain(text)
                for row in rows:
                    cells = table.add_row().cells
                    for column, text in enumerate(row[:len(header)]):
                        cells[column].text = _plain(text)
            continue
        if match := _LIST.match(line):
            paragraph = document.add_paragraph(style="List Bullet" if match.group(1) else "List Number")
            _add_text(paragraph, match.group(3))
        elif line.strip():
            _add_text(document.add_paragraph(), line)
        index += 1
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()
