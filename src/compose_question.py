"""Click-to-ask: one model call turns selected keywords into an editable question (query 2026-1009 ⑤)."""

from __future__ import annotations

import asyncio

from langchain_core.messages import HumanMessage, SystemMessage

from .agent.models import model_for
from .prompts import compose_question_instruction


async def compose(settings, task: str, elements: list[str], intents: list[str],
                  domains: list[str], scene: str = "", note: str = "") -> str:
    lines = [f"任务：{task}", f"知识库：{'、'.join(domains) or '未指定'}"]
    if scene:
        lines.append(f"关注场景：{scene}")
    if elements:
        lines.append(f"关注要素：{'、'.join(elements)}")
    if intents:
        lines.append(f"附带问题：{'；'.join(intents)}")
    if note:
        lines.append(f"使用者补充：{note}")
    async with asyncio.timeout(60):
        response = await model_for(settings).ainvoke([
            SystemMessage(content=compose_question_instruction()),
            HumanMessage(content="\n".join(lines)),
        ])
    text = str(response.content).strip().strip("“”\"'「」")
    if not text:
        raise ValueError("模型没有返回问题文本")
    return text[:400]
