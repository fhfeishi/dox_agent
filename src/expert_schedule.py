"""Scheduling the expert review after a task ends (2026-11-13).

Kept apart from both API modules because the report path and the chat path both need it and
neither should import the other. The review itself lives in ``expert_review``; this module only
decides when it runs and makes sure a failure cannot reach the person who already has the result.
"""

import asyncio
import logging

from . import expert_review

logger = logging.getLogger(__name__)


def schedule_review(app, settings, owner_id: str, question: str, answer: str) -> None:
    """Run the expert review pass in the background after a task ends (2026-11-13).

    Scheduled on the running loop rather than awaited: the person already has the result, and the
    review is a cheap second opinion about what to remember. A failure here is logged and dropped —
    it is never surfaced as a task error.
    """
    ask = expert_review.model_asker(settings)
    if ask is None:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return

    async def review():
        try:
            await expert_review.run(settings.state_dir, owner_id, question, answer, ask=ask)
        except Exception as exc:  # noqa: BLE001 - background bookkeeping
            logger.warning("expert review failed: %s", type(exc).__name__)

    app.state.expert_reviews = getattr(app.state, "expert_reviews", set())
    task = loop.create_task(review())
    app.state.expert_reviews.add(task)
    task.add_done_callback(app.state.expert_reviews.discard)


