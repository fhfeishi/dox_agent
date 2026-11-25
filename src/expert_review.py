"""After a task ends, one cheap model pass decides whether anything should be remembered.

Modelled on Hermes Agent's ``agent/background_review.py``: when the work is over, a forked pass
replays what happened and asks "should anything be saved?", writing straight to the store. It runs
in the background, so a slow or failing review never delays or breaks the answer the person is
reading.

Two of Hermes' rules are load-bearing here, because a remembered line outlives the conversation
that produced it:

- save only what is grounded in this conversation — a message or a tool result that can be pointed
  at; never infer traits, skill level or preferences from topic or tone;
- never turn a one-off request into a standing preference unless the person marked it general
  ("以后", "总是", "记住").

The review is asked for JSON so a malformed reply is a parse error rather than a silently wrong
write, and the store's own ``check_entry`` still runs on every entry it returns.
"""

import asyncio
import json
import logging
from pathlib import Path

from . import expert_memory

logger = logging.getLogger(__name__)

# Hermes splits its prompt into "what a memory is" and "what not to capture"; the same split keeps
# this one short enough to stay cheap while still refusing the failure modes we actually saw.
REVIEW_PROMPT = """你在复盘一次刚结束的任务，判断其中有没有值得长期记住的内容。

有两处存储，一条内容只进其中一处：
- profile（输出偏好）：使用者希望结果长什么样——篇幅、结构、编号方式、术语、引用习惯。
- practice（做法）：完成这类任务的步骤、要检查的项、常见的坑。

只记有依据的内容：必须能指回这次任务里的某句话、某次修改或某个结果。
不要从话题、语气或用了什么工具去推测使用者的水平、角色、性格或偏好。
不要把一次性的要求当成长期偏好，除非使用者明确说了「以后」「总是」「记住」。

不要记录：
- 对资料内容的结论（"这个领域有 N 个项目"、"某项技术尚不成熟"）。结论属于报告，要带引用，资料变了结论就过期了。
- 权限、规则、取证标准、工具策略。这些不由记忆改变。
- 这次任务的叙事（"用户问了什么、我答了什么"）。要记的是可复用的规则，不是事件。

如果这次没有值得记的，返回空数组——这很正常，不是失败。

只输出 JSON，不要其他文字：
{"profile": ["……"], "practice": ["……"]}
每条一句话，不超过 80 字，写成规则或偏好，不要写成描述。

写的时候再检查一遍：句子里不能出现「本次」「这次」「刚才」「上面」这类指代这一轮的字样。
那条规则要能独立成立——脱离这次任务也该说得通。反例：
  ✗ 输出报告前检查章节编号是否连续——本次出现「二」后直接跳到了「五」
  ✓ 输出报告前检查章节编号与层级连续完整，缺章时补齐后再交付
"""


def _existing(store: dict[str, list[str]]) -> str:
    lines = []
    for target, label in (("profile", "已有输出偏好"), ("practice", "已有做法")):
        if store[target]:
            lines.append(f"{label}：")
            lines += [f"- {item}" for item in store[target]]
    return "\n".join(lines) or "（还没有记住任何内容）"


def build_messages(question: str, answer: str, store: dict[str, list[str]]) -> list[dict]:
    """The review's own two messages. The existing entries go in so a repeated lesson is merged
    instead of appended a second time."""
    body = (f"这次任务：\n问题：{question}\n\n结果：{answer}\n\n"
            f"{_existing(store)}\n\n请判断有没有值得记住的内容。")
    return [{"role": "system", "content": REVIEW_PROMPT}, {"role": "user", "content": body}]


def parse_reply(text: str) -> dict[str, list[str]]:
    """The reply as two entry lists. Anything that is not the expected shape yields nothing —
    a review that cannot be read must not guess at what to remember."""
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1] if len(raw.split("```")) > 1 else raw
        raw = raw.removeprefix("json").strip()
    try:
        data = json.loads(raw)
    except ValueError:
        logger.warning("expert review reply was not JSON; nothing remembered")
        return {"profile": [], "practice": []}
    if not isinstance(data, dict):
        return {"profile": [], "practice": []}
    return {target: [str(item) for item in (data.get(target) or []) if str(item).strip()]
            for target in ("profile", "practice")}


def apply(root: Path, owner_id: str, reply: dict[str, list[str]]) -> dict[str, int]:
    """Write what the review returned, one entry at a time; one rejected entry does not stop the
    rest. Returns how many entries were actually added, per store."""
    added = {"profile": 0, "practice": 0}
    for target, items in reply.items():
        for item in items:
            try:
                if expert_memory.add(root, owner_id, target, item)["changed"]:
                    added[target] += 1
            except expert_memory.ExpertMemoryError as exc:
                # A full store is the expected outcome once the person has used it for a while: the
                # budget is the mechanism, so this is a log line, not an error to surface.
                logger.info("expert review entry not stored (%s): %s", target, exc)
    return added


async def run(root: Path, owner_id: str, question: str, answer: str, *, ask=None) -> dict[str, int]:
    """Review one finished task. ``ask`` is the model call (messages -> reply text), injected so the
    whole pass can be tested without a provider."""
    if ask is None:
        await asyncio.to_thread(record, root, owner_id, {"outcome": "not_configured", "added": {}})
        return {"profile": 0, "practice": 0}
    store = expert_memory.load(root, owner_id)
    try:
        reply = await ask(build_messages(question, answer, store))
    except Exception as exc:  # noqa: BLE001 - a review must never surface as a task failure
        logger.warning("expert review failed: %s", type(exc).__name__)
        await asyncio.to_thread(record, root, owner_id,
                                {"outcome": "failed", "reason": type(exc).__name__, "added": {}})
        return {"profile": 0, "practice": 0}
    added = await asyncio.to_thread(apply, root, owner_id, parse_reply(reply))
    await asyncio.to_thread(record, root, owner_id, {"outcome": "reviewed", "added": added})
    return added


# Why the last pass ended the way it did, so "nothing was learned" can be told apart from "the review
# never ran": a person looking at an empty page needs that difference (2026-11-13).
STATUS_FILE = ".last_review.json"


def record(root: Path, owner_id: str, result: dict) -> None:
    """Remember the outcome of one pass. Best effort: a failure to write this must not fail a review
    that already succeeded."""
    try:
        path = expert_memory.directory(root, owner_id) / STATUS_FILE
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({**result, "at": _now()}, ensure_ascii=False), encoding="utf-8")
    except OSError as exc:
        logger.warning("expert review status not saved: %s", type(exc).__name__)


def status(root: Path, owner_id: str) -> dict:
    """The last pass, or ``{"outcome": "never"}`` when none has run for this account."""
    try:
        path = expert_memory.directory(root, owner_id) / STATUS_FILE
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"outcome": "never"}


def _now() -> str:
    from datetime import UTC, datetime
    return datetime.now(UTC).isoformat()


def model_asker(settings):
    """A single cheap call for the review pass, or ``None`` when no model is configured.

    The review reuses the project's review-model settings (``REVIEW_MODEL_*``, falling back to
    ``MODEL_*``) rather than adding another knob: it is the same kind of low-stakes background call.
    One call, no retries — a review that fails is simply a review that found nothing.
    """
    from .review.model_client import config

    try:
        conf = config()
    except Exception:  # noqa: BLE001 - a missing config means no review, not a broken task
        return None
    if not conf["ready"]:
        return None

    async def ask(messages: list[dict]) -> str:
        import httpx

        payload = {"model": conf["model"], "temperature": 0.1, "max_tokens": 800, "messages": messages}
        # Direct, like every model call in this project: the system proxy is never used.
        async with httpx.AsyncClient(timeout=conf["timeout"], trust_env=False) as http:
            response = await http.post(conf["base"] + "/chat/completions",
                                       headers={"Authorization": "Bearer " + conf["key"]}, json=payload)
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]

    return ask
