"""Click-to-ask: one model call turns selected keywords into an editable question (query 2026-1009 ⑤).

query 2026-1021 1619 made it work from what the user already has, not only from the chips: the text
typed in the input box is the core of the question, a thin selection is filled out with the library's
own scene, problem and system names (never invented facts), and asking again gives a different angle.
"""

from __future__ import annotations

import asyncio
import json
import random

from langchain_core.messages import HumanMessage, SystemMessage

from .agent.models import model_for
from .prompts import compose_question_instruction

# A selection this thin, with nothing typed, reads as a generic question; the model may then add an
# angle from the library's own vocabulary to make it a specific, professional one.
SPARSE_PICKS = 2
# Each attempt shows the model a different slice of the library vocabulary, so a new click starts from
# different material and not only from "please differ".
HINT_SIZES = {"场景": 4, "未解决问题": 3, "技术体系": 3}


def library_vocabulary(root) -> dict[str, list[str]]:
    """Scene, open-problem and technology-system names already extracted for one library.

    Read from the stored hierarchy and lineage records; a library without them yields empty lists, and
    the question is then composed from the picks alone.
    """
    def read(name):
        try:
            return json.loads((root / name).read_text(encoding="utf-8"))
        except (OSError, UnicodeError, ValueError):
            return {}
    scenes = sorted(read("hierarchy.json").get("scenes") or [], key=lambda s: -len(s.get("project_ids") or []))
    systems = [c for c in read("lineage.json").get("categories") or [] if not c.get("unplaced")]
    return {
        "场景": [s["name"] for s in scenes if s.get("name")],
        "未解决问题": [i["name"] for s in scenes for i in s.get("issues") or []
                     if i.get("name") and i.get("state") != "已解决"],
        "技术体系": [c["name"] for c in systems if c.get("name")],
    }


def vocabulary_slice(vocabulary: dict[str, list[str]], attempt: int) -> dict[str, list[str]]:
    """A few names per kind; attempt 0 takes the largest, later attempts a reproducible other draw."""
    picked = {}
    for kind, size in HINT_SIZES.items():
        names = vocabulary.get(kind) or []
        if attempt and len(names) > size:
            names = random.Random(f"{kind}:{attempt}").sample(names, len(names))
        if names[:size]:
            picked[kind] = names[:size]
    return picked


def is_sparse(elements: list[str], intents: list[str], scene: str, note: str) -> bool:
    return "综合分析" not in intents and not note and len(elements) + len(intents) + (1 if scene else 0) <= SPARSE_PICKS


def prompt_lines(task: str, elements: list[str], intents: list[str], domains: list[str],
                 scene: str = "", note: str = "", period: str = "",
                 vocabulary: dict[str, list[str]] | None = None, avoid: list[str] | None = None) -> list[str]:
    """The model's input as ordered lines.

    The year span picked in 点选提问 (query 2026-1021) is its own line before the elements, not folded
    into the free note: the question must carry the same ``YYYY—YYYY`` phrase the retriever filters
    on, and a note's wording must not be able to swallow it. An empty span adds no line.
    """
    lines = [f"任务：{task}", f"资料库：{'、'.join(domains) or '未指定'}"]
    if note:
        lines.append(f"使用者已输入：{note}")
    if period:
        lines.append(f"时间范围：{period}")
    if scene:
        lines.append(f"关注场景：{scene}")
    if elements:
        lines.append(f"关注要素：{'、'.join(elements)}")
    if intents:
        lines.append(f"附带问题：{'；'.join(intents)}")
    if "综合分析" in intents:
        lines.append("综合分析范围：覆盖技术谱系、应用场景、核心问题、关键技术、成果、项目与经费投入、待突破缺口；缺少资料的要点说明不足，不编造。")
        if not scene:
            lines.append("场景范围：综合全部场景，不从资料库词表中另选单一场景收窄问题。")
    lines.append("选择情况：" + ("较少，可补充一个角度" if is_sparse(elements, intents, scene, note) else "充分，不补充角度"))
    for kind, names in (vocabulary or {}).items():
        lines.append(f"资料库中的{kind}：{'、'.join(names)}")
    for index, question in enumerate(avoid or [], 1):
        lines.append(f"已生成过{index}：{question}")
    return lines


def keep_period(text: str, period: str) -> str:
    """The span must reach the retriever verbatim; a model that rewrote it as 近五年 gets it back."""
    if not period or period in text:
        return text
    body = text.rstrip("。？?！!")
    return f"{body}（{period}）{text[len(body):] or '？'}"


async def compose(settings, task: str, elements: list[str], intents: list[str],
                  domains: list[str], scene: str = "", note: str = "", period: str = "",
                  vocabulary: dict[str, list[str]] | None = None, avoid: list[str] | None = None) -> str:
    lines = prompt_lines(task, elements, intents, domains, scene, note, period, vocabulary, avoid)
    # Asking again must not return the same sentence: a warmer draw only when earlier ones are listed.
    model = model_for(settings).bind(temperature=0.9) if avoid else model_for(settings)
    async with asyncio.timeout(60):
        response = await model.ainvoke([
            SystemMessage(content=compose_question_instruction()),
            HumanMessage(content="\n".join(lines)),
        ])
    text = str(response.content).strip().strip("“”\"'「」")
    if not text:
        raise ValueError("模型没有返回问题文本")
    return keep_period(text[:400], period)
