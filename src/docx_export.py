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
from PIL import Image

_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_TABLE_SEPARATOR = re.compile(r"^\s*\|?[\s:|-]+\|?\s*$")
_LIST = re.compile(r"^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$")
_FENCE = re.compile(r"^\s*```")
_QUOTE = re.compile(r"^\s*>\s?(.*)$")
_LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)")
_INLINE_MATH = re.compile(r"(?<!\\)\$(?!\$)(?=\S)[^\n$]*?\S\$(?!\$)")
_IMAGE = re.compile(r"^!\[.*\]\((figures/[a-f0-9]{20}\.(?:jpg|png))\)$")


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
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run("第 ")
    page = OxmlElement("w:fldSimple")
    page.set(qn("w:instr"), "PAGE")
    footer._p.append(page)
    footer.add_run(" 页")


def _append_sources(document, citations: list[dict]) -> None:
    """G10e-D: a readable source appendix, so a Word reader can check every [n] citation."""
    if not citations:
        return
    document.add_heading("引用来源", level=2)
    for number, item in enumerate(citations, start=1):
        title = item.get("title") or item.get("doc_id") or "未记录来源"
        details: list[str] = []
        if item.get("kind") == "web":
            if item.get("url"):
                details.append(str(item["url"]))
            if item.get("fetched_at"):
                details.append(f"抓取于 {item['fetched_at']}")
        else:
            if item.get("page"):
                details.append(f"第 {item['page']} 页")
            if item.get("corpus_id"):
                details.append(f"知识库 {item['corpus_id']}")
        suffix = f"（{"；".join(details)}）" if details else ""
        _add_text(document.add_paragraph(), f"[{number}] {title}{suffix}")


def markdown_to_docx(markdown: str, images: dict[str, bytes] | None = None,
                     citations: list[dict] | None = None) -> bytes:
    """Render Markdown headings, lists, tables and paragraphs into a real ``.docx``.

    ``citations`` (G10e-D) appends a source appendix so every ``[n]`` stays checkable;
    it never rewrites the body. Formulas are still rejected instead of being dropped.
    """
    if re.search(r"(?m)^\s*\$\$|\\\[|\\\(", markdown) or _INLINE_MATH.search(markdown):
        raise ValueError("当前 Word 导出尚不支持公式排版，请先下载 Markdown 原文")
    document = Document()
    _styles(document)
    lines = markdown.splitlines()
    title = next((_plain(match.group(2)) for line in lines if (match := _HEADING.match(line))
                  and len(match.group(1)) == 1), "")
    if title:
        document.sections[0].header.paragraphs[0].text = title
    index = 0
    while index < len(lines):
        line = lines[index]
        if image := _IMAGE.match(line.strip()):
            if not images or image.group(1) not in images:
                raise ValueError("图文报告图片附件缺失，不能导出不完整的 Word")
            stream = io.BytesIO(images[image.group(1)])
            with Image.open(stream) as picture:
                width_cm = min(15, 18 * picture.width / picture.height, picture.width * 2.54 / 96)
            stream.seek(0)
            document.add_picture(stream, width=Cm(width_cm))
            index += 1
            continue
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
        if _FENCE.match(line):
            body: list[str] = []
            index += 1
            while index < len(lines) and not _FENCE.match(lines[index]):
                body.append(lines[index])
                index += 1
            index += 1
            paragraph = document.add_paragraph()
            run = paragraph.add_run("\n".join(body))
            run.font.name = "Consolas"
            run.font.size = Pt(10)
            continue
        if quote := _QUOTE.match(line):
            quoted = [quote.group(1)]
            index += 1
            while index < len(lines) and (continued := _QUOTE.match(lines[index])):
                quoted.append(continued.group(1))
                index += 1
            paragraph = document.add_paragraph()
            paragraph.paragraph_format.left_indent = Cm(0.8)
            _add_text(paragraph, " ".join(part for part in quoted if part.strip()))
            continue
        if match := _LIST.match(line):
            paragraph = document.add_paragraph(style="List Bullet" if match.group(1) else "List Number")
            _add_text(paragraph, match.group(3))
        elif line.strip():
            _add_text(document.add_paragraph(), line)
        index += 1
    # Generated reports already carry the authoritative, numbered source appendix
    # in their Markdown. Appending the generic list would duplicate every citation.
    if not re.search(r"(?m)^## 来源附录（系统记录）\s*$", markdown):
        _append_sources(document, citations or [])
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()
