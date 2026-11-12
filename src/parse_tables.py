"""Parse blocks as Markdown the reader can actually render (2026-11-12 1036).

MinerU writes a table's content as an HTML ``<table>`` string (``table_body.content``), and its
inline formulas as ``<eq>…</eq>``. A block's text therefore carries raw markup. Handing that to a
Markdown renderer that does not execute HTML (``react-markdown`` without ``rehype-raw``) printed the
markup literally under the table — the source leak reported in query 2026-1112 1036 — and a leaked
``<table>`` is also tall enough to overlap the blocks below it.

This module converts that markup into the two forms a reader can use:

- a table becomes a GFM pipe table, with ``rowspan``/``colspan`` expanded into a real grid so no cell
  is lost (MinerU's own renderer keeps a merged table as raw HTML, which is exactly what a browser
  without HTML support cannot show);
- an inline ``<eq>`` becomes ``$…$``;
- any remaining tag is unwrapped, keeping its text.

Nothing is invented: a cell keeps its own words, and a table with no readable cell still returns its
plain text so the reader sees the block rather than an empty box.
"""

from __future__ import annotations

import html
import re

from bs4 import BeautifulSoup
from bs4.element import NavigableString, Tag

# A table larger than this is not worth expanding into a pipe table: the result would be thousands of
# cells in one block, which no reader can use. Such a table falls back to its own text.
MAX_TABLE_CELLS = 4000

_TABLE_RE = re.compile(r"<table\b.*?</table>", re.IGNORECASE | re.DOTALL)
_EQ_RE = re.compile(r"<eq>(.*?)</eq>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"</?[a-zA-Z][^<>]*>")
# Characters Markdown would act on inside a formula. Without a math renderer ``$…$`` is plain text,
# so ``0.291*\mathrm{HBB}`` would pair its asterisks and turn half the formula italic. Escaping them
# keeps the formula literal now and still reads as a formula if a math renderer is added later.
_MATH_ESCAPE_RE = re.compile(r"([*_~`\[\]])")


def _cell_text(node: Tag | NavigableString) -> str:
    """One cell's words as Markdown: ``<eq>`` to ``$…$``, tags unwrapped, pipes escaped."""
    if isinstance(node, NavigableString):
        return html.unescape(str(node))
    parts: list[str] = []
    for child in node.children:
        if isinstance(child, NavigableString):
            parts.append(html.unescape(str(child)))
            continue
        if not isinstance(child, Tag):
            continue
        name = child.name.lower()
        if name == "eq":
            parts.append(_math(child.get_text()))
        elif name == "br":
            parts.append(" ")
        elif name in {"b", "strong"}:
            parts.append(f"**{_cell_text(child).strip()}**")
        elif name in {"i", "em"}:
            parts.append(f"*{_cell_text(child).strip()}*")
        elif name in {"code"}:
            parts.append(f"`{_cell_text(child).strip()}`")
        else:
            parts.append(_cell_text(child))
    text = "".join(parts)
    # A newline inside a cell would end the pipe row; a pipe would start a new column.
    text = re.sub(r"\s*\n\s*", " ", text).strip()
    return text.replace("|", "\\|")


def _expand_grid(table: Tag) -> list[list[str]]:
    """The table as a rectangular grid, ``rowspan``/``colspan`` filled in.

    A merged cell occupies every grid position it covers, so a two-column merged cell shows its
    words once and leaves the covered position blank instead of shifting the row.
    """
    rows = table.find_all("tr")
    grid: list[list[str]] = []
    pending: dict[tuple[int, int], str] = {}  # (row, column) filled by an earlier rowspan
    for row_index, row in enumerate(rows):
        cells = row.find_all(("th", "td"), recursive=False)
        if not cells:
            continue
        line: list[str] = []
        column = 0
        for cell in cells:
            while (row_index, column) in pending:
                line.append(pending.pop((row_index, column)))
                column += 1
            text = _cell_text(cell)
            try:
                colspan = max(1, int(cell.get("colspan") or 1))
                rowspan = max(1, int(cell.get("rowspan") or 1))
            except (TypeError, ValueError):
                colspan = rowspan = 1
            line.append(text)
            column += 1
            for _ in range(1, colspan):
                line.append("")
                column += 1
            for down in range(1, rowspan):
                pending[(row_index + down, column - colspan)] = text
        # A rowspan from an earlier row may extend past this row's own cells.
        while (row_index, column) in pending:
            line.append(pending.pop((row_index, column)))
            column += 1
        grid.append(line)
    width = max((len(line) for line in grid), default=0)
    for line in grid:
        line.extend([""] * (width - len(line)))
    return grid


def html_table_to_gfm(markup: str) -> str | None:
    """One ``<table>`` as a GFM pipe table, or None when it has no usable cell."""
    soup = BeautifulSoup(markup, "html.parser")
    table = soup.find("table")
    if table is None:
        return None
    grid = _expand_grid(table)
    if not grid or not any(any(cell for cell in line) for line in grid):
        return None
    if sum(len(line) for line in grid) > MAX_TABLE_CELLS:
        return None
    width = len(grid[0])
    header, body = grid[0], grid[1:]
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join(["---"] * width) + " |"]
    lines.extend("| " + " | ".join(line) + " |" for line in body)
    return "\n".join(lines)


def _math(latex: str) -> str:
    """One formula as ``$…$`` with Markdown-active characters escaped (see ``_MATH_ESCAPE_RE``)."""
    return f"${_MATH_ESCAPE_RE.sub(r'\\\1', html.unescape(latex).strip())}$"


def block_markdown(text: str) -> str:
    """A block's text as Markdown: tables become pipe tables, formulas become ``$…$``.

    Text outside a table is kept as written (it may already be Markdown), except that leftover
    ``<eq>`` tags are converted and any other stray tag is unwrapped so no markup reaches the reader
    as literal angle brackets.
    """
    if not text:
        return ""

    def replace_table(match: re.Match[str]) -> str:
        converted = html_table_to_gfm(match.group(0))
        if converted is not None:
            return "\n\n" + converted + "\n\n"
        # No usable grid (an empty or image-only table): keep its words, drop the markup.
        soup = BeautifulSoup(match.group(0), "html.parser")
        return "\n\n" + soup.get_text(" ", strip=True) + "\n\n"

    converted = _TABLE_RE.sub(replace_table, text)
    converted = _EQ_RE.sub(lambda match: _math(match.group(1)), converted)
    # A stray tag that is not part of a table (a lone <span>, a leftover </p>).
    converted = _TAG_RE.sub("", converted)
    return html.unescape(converted).strip()
