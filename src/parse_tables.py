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
# Characters Markdown would act on inside a formula. The formula is delimited by ``$…$`` and rendered
# by KaTeX, which reads LaTeX commands such as ``\mathrm`` itself — so an escape must not touch a
# backslash that starts a command. Only a literal ``_``/``*``/``~``/``[``/``]`` outside a command is
# escaped, which keeps ``a_b`` literal while ``\mathrm{HBB}`` still reaches the renderer intact.
_MATH_ESCAPE_RE = re.compile(r"(?<!\\)([*~`\[\]])")


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


def _is_complex_table(table: Tag) -> bool:
    """Whether GFM cannot carry this table without losing structure (MinerU's own rule).

    A merged cell (``rowspan``/``colspan``), a nested table or a cell holding block content is not
    expressible as a pipe table. Expanding a merged cell into repeated text invents cells that the
    document does not have, which is why MinerU keeps such a table as HTML instead.
    """
    if table.find("table") is not None:
        return True
    for cell in table.find_all(("th", "td")):
        if cell.has_attr("rowspan") or cell.has_attr("colspan"):
            return True
        if cell.find(("table", "div", "p", "ul", "ol", "pre", "img")) is not None:
            return True
    return False


def _expand_grid(table: Tag) -> list[list[str]]:
    """The table as a rectangular grid for the *simple* case (no merged cells).

    Merged cells are handled by keeping the table as HTML; this grid therefore only fills the shape
    a pipe table can carry, and a row shorter than the widest one is padded with empty cells.
    """
    grid: list[list[str]] = []
    for row in table.find_all("tr"):
        cells = row.find_all(("th", "td"), recursive=False)
        if cells:
            grid.append([_cell_text(cell) for cell in cells])
    width = max((len(line) for line in grid), default=0)
    for line in grid:
        line.extend([""] * (width - len(line)))
    return grid


def html_table_to_gfm(markup: str) -> str | None:
    """One ``<table>`` as GFM when it is simple; None when it must stay HTML (see the caller)."""
    soup = BeautifulSoup(markup, "html.parser")
    table = soup.find("table")
    if table is None:
        return None
    if _is_complex_table(table):
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
    """One formula as ``$…$``, its LaTeX passed through untouched.

    ``remark-math`` claims a ``$…$`` span before Markdown sees its contents, so ``*`` and ``_`` inside
    a formula are not emphasis and must not be escaped — escaping them would hand KaTeX a broken
    formula (``a\\_b`` instead of the subscript ``a_b``).
    """
    return f"${html.unescape(latex).strip()}$"


def block_markdown(text: str) -> str:
    """A block's text as Markdown: tables become pipe tables, formulas become ``$…$``.

    Text outside a table is kept as written (it may already be Markdown), except that leftover
    ``<eq>`` tags are converted and any other stray tag is unwrapped so no markup reaches the reader
    as literal angle brackets.
    """
    if not text:
        return ""

    def replace_table(match: re.Match[str]) -> str:
        markup = match.group(0)
        converted = html_table_to_gfm(markup)
        if converted is not None:
            return "\n\n" + converted + "\n\n"
        # A merged or nested table keeps its HTML, exactly as MinerU does: a browser renders the
        # rowspan/colspan natively, where expanding it would repeat a merged cell's words. Only the
        # formulas inside are rewritten to math delimiters.
        soup = BeautifulSoup(markup, "html.parser")
        table = soup.find("table")
        if table is None:
            return "\n\n" + soup.get_text(" ", strip=True) + "\n\n"
        for cell in table.find_all("eq"):
            cell.replace_with(_math(cell.get_text()))
        return "\n\n" + str(table) + "\n\n"

    # Tables are converted first and then set aside, so the stray-tag strip below cannot eat the
    # HTML a complex table deliberately keeps.
    kept: list[str] = []

    def hold_table(match: re.Match[str]) -> str:
        kept.append(replace_table(match))
        return f"\u0000TABLE{len(kept) - 1}\u0000"

    converted = _TABLE_RE.sub(hold_table, text)
    converted = _EQ_RE.sub(lambda match: _math(match.group(1)), converted)
    # A stray tag that is not part of a table (a lone <span>, a leftover </p>).
    converted = _TAG_RE.sub("", converted)
    converted = html.unescape(converted)
    for index, table in enumerate(kept):
        converted = converted.replace(f"\u0000TABLE{index}\u0000", table)
    return converted.strip()
