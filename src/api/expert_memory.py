"""The expert memory's only reading surface: the administrator's page (2026-11-13).

Admin-only, and still only ever that account's own text — the store's directory is built from the
signed-in id, so there is no cross-account view. The reason for ``ADMIN_ONLY`` is the product rule
rather than secrecy: the expert layer works in the background and ordinary accounts must not be
asked to think about it, so the page (and the API behind it) belongs to the one role that audits
the system. The review pass writes and every task loads through ``src.expert_memory`` directly, so
a normal account's memory still accumulates and still takes effect with no route access at all.

This replaces the fourteen-route seat/preference/candidate/skill API: with two bounded texts there
is nothing to approve, no version to promote and no seat to choose.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .. import expert_memory
from ..auth import ADMIN_ONLY


class Entries(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[str] = Field(max_length=200)


def install(app, ctx):
    # Admin-only for the whole surface: the page behind these routes is the auditor's.
    router = APIRouter(dependencies=ADMIN_ONLY)
    settings = ctx.settings

    def owner(request: Request) -> str:
        return request.state.user[0]

    def payload_for(request: Request) -> dict:
        stored = expert_memory.load(settings.state_dir, owner(request))
        return {
            "profile": {"items": stored["profile"], "limit": expert_memory.PROFILE_LIMIT},
            "practice": {"items": stored["practice"], "limit": expert_memory.PRACTICE_LIMIT},
        }

    @router.get("/api/expert/memory")
    async def read_memory(request: Request):
        """Both texts, with their budgets, so the page can show how full each one is."""
        return payload_for(request)

    @router.put("/api/expert/memory/{target}")
    async def write_memory(target: str, body: Entries, request: Request):
        """Rewrite one text: the person deleting or reordering what was remembered."""
        try:
            expert_memory.replace(settings.state_dir, owner(request), target, body.items)
        except expert_memory.ExpertMemoryError as exc:
            raise HTTPException(422, str(exc)) from exc
        return payload_for(request)

    @router.delete("/api/expert/memory/{target}")
    async def clear_memory(target: str, request: Request):
        try:
            expert_memory.clear(settings.state_dir, owner(request), target)
        except expert_memory.ExpertMemoryError as exc:
            raise HTTPException(422, str(exc)) from exc
        return payload_for(request)

    app.include_router(router)
