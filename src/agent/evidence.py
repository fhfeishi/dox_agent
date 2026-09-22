"""Deterministic answer checks (L6).

The research handoff contract (``ResearchReport`` / ``decide`` / ``merge_reports``) was removed
with the agentic research loop (§7.15 L4); only citation validation remains.
"""

import re


def validate_citations(answer: str, sources: list[dict]) -> int:
    """D-L2: return the number of ``[n]`` references with no matching source.

    The frontend keeps unmatched numbers literal (``citation.ts``); this only records the count
    in telemetry so invalid citations stay observable.
    """
    valid = {source.get("citation") for source in sources}
    used = {int(match) for match in re.findall(r"\[(\d{1,3})\]", answer or "")}
    return len(used - valid)
