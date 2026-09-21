"""Section windows with stable legacy coordinates and indivisible code fences."""

import re


def section_window(text: str, start_line: int, budget: int = 16000) -> dict:
    raw = text.splitlines()
    positions, cursor = [], 1
    for line in raw:
        positions.append(cursor)
        cursor += max(1, (len(line) + 299) // 300)
    if not 1 <= start_line < cursor:
        raise ValueError("行号超出范围")
    target = max(i for i, position in enumerate(positions) if position <= start_line)
    blocks, headings, fence, begin = [], [], None, 0
    for i, line in enumerate(raw):
        marker = re.match(r"^\s{0,3}(`{3,}|~{3,})", line)
        if fence:
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence):
                blocks.append((begin, i + 1, True))
                fence = None
        elif marker:
            fence, begin = marker[1], i
        else:
            blocks.append((i, i + 1, False))
            if re.match(r"^#{1,6}\s", line):
                headings.append(i)
    if fence:
        blocks.append((begin, len(raw), True))
    left = max((i for i in headings if i <= target), default=0)
    right = min((i for i in headings if i > target), default=len(raw))
    target_begin, target_end, _ = next(block for block in blocks if block[0] <= target < block[1])
    # Include the requested block, or explicitly omit it with forward progress.
    if len("\n".join(raw[left:target_end])) + 1 > budget:
        left = target_begin
    selected, used, end, omitted = [], 0, left, False
    for a, b, code in blocks:
        if b <= left or a >= right:
            continue
        value = "\n".join(raw[a:b])
        if used + len(value) + 1 > budget:
            if not selected:
                selected.append("[代码块超过单次阅读预算，未展示；请打开原文查看完整代码。]" if code else
                                "[正文单行超过单次阅读预算，未展示；请打开原文查看完整内容。]")
                end, omitted = b, True
            break
        if code and fence and a == begin:
            selected.append("[原文代码块未闭合，未作为完整代码展示。]")
            omitted = True
        else:
            selected.append(value)
        used += len(value) + 1
        end = b
    return {"text": "\n".join(selected), "start_line": positions[left],
            "end_line": (positions[end] if end < len(raw) else cursor) - 1,
            "next_start_line": positions[end] if end < len(raw) else None,
            "heading": raw[max((i for i in headings if i <= target), default=0)] if raw else "",
            "truncated": end < right or omitted, "code_omitted": omitted}
