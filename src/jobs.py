"""One way to run long work in this single-process service (upgrade plan card B1).

A job is a run in ``runs.sqlite3`` before any work starts. Its progress is written there as it moves,
so leaving the page never loses it and every reader sees the same state. Work runs in an asyncio task,
and blocking steps go to a thread inside the work. A restart cannot leave a run "running" forever:
``recover`` turns what the previous process left unfinished into ``interrupted``. Shutting down
cancels running work, which records the same state.

Run status: ``running`` → ``completed`` | ``failed`` | ``interrupted``. The work also keeps its own
progress record (``progress``), which is what the existing endpoints return, e.g. an import's
``{"status": "done", "completed": 12, ...}``.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from uuid import uuid4

from .runs import RunStore, request_fingerprint

logger = logging.getLogger(__name__)
Progress = Callable[..., None]
Work = Callable[[dict, Progress], Awaitable[dict]]
# Kinds run here so far; the rest of card B1 (answers, reports, intelligence, summaries, review) follows.
KINDS = ("import", "target")


class JobBusy(RuntimeError):
    pass


def _now() -> str:
    return datetime.now(UTC).isoformat()


class Jobs:
    def __init__(self, runs: RunStore):
        self.runs = runs
        self.tasks: dict[str, asyncio.Task] = {}   # run_id → work in this process
        self.keys: dict[tuple, str] = {}           # (kind, corpus_id) → its running run_id

    def recover(self) -> list[str]:
        """Runs a previous process left unfinished are interrupted, not still running."""
        stale = self.runs.unfinished(KINDS)
        for snapshot in stale:
            progress = {**snapshot.get("progress", {}), "status": "interrupted"}
            self.runs.update(snapshot["run_id"], status="interrupted", ended_at=_now(), progress=progress)
        return [snapshot["run_id"] for snapshot in stale]

    def busy(self, kind: str, corpus_id: str) -> bool:
        run_id = self.keys.get((kind, corpus_id))
        return bool(run_id and not self.tasks[run_id].done())

    def latest(self, kind: str, corpus_id: str) -> dict | None:
        snapshot = self.runs.latest(kind, corpus_id)
        return self.view(snapshot) if snapshot else None

    def get(self, run_id: str, kind: str, corpus_id: str) -> dict | None:
        try:
            snapshot = self.runs.get(run_id)
        except KeyError:
            return None
        if snapshot.get("run_type") != kind or corpus_id not in snapshot.get("effective_corpus_ids", []):
            return None
        return self.view(snapshot)

    @staticmethod
    def view(snapshot: dict) -> dict:
        """What the endpoints return: the work's progress, named by its run."""
        return {**snapshot.get("progress", {}), "job_id": snapshot["run_id"], "run_id": snapshot["run_id"],
                "run_status": snapshot.get("status"), "started_at": snapshot.get("created_at"),
                "ended_at": snapshot.get("ended_at") or None}

    def start(self, kind: str, corpus_id: str, work: Work, progress: dict, *, params: dict | None = None) -> dict:
        """Record the run, then start ``work(progress, report)``; ``report(**fields)`` saves progress."""
        if self.busy(kind, corpus_id):
            raise JobBusy(kind)
        run_id = f"{kind}-{uuid4().hex}"
        params = params or {}
        self.runs.create(run_id, request_fingerprint({"kind": kind, "corpus_id": corpus_id, "run_id": run_id, **params}),
                         run_type=kind, status="running", effective_corpus_ids=[corpus_id],
                         requested_corpus_ids=[corpus_id], params=params)
        state = dict(progress)
        self.runs.update(run_id, progress=state)

        def report(**fields):
            state.update(fields)
            try:
                self.runs.update(run_id, progress=dict(state))
            except Exception:  # progress is advisory; the final state is written below
                logger.warning("job progress not saved: %s", run_id, exc_info=True)

        async def run():
            try:
                final = await work(state, report)
                state.update(final or {})
                status = "failed" if state.get("status") == "error" else "completed"
                await asyncio.to_thread(self.runs.update, run_id, status=status, ended_at=_now(), progress=dict(state))
            except asyncio.CancelledError:
                state["status"] = "interrupted"
                self.runs.update(run_id, status="interrupted", ended_at=_now(), progress=dict(state))
                raise
            except Exception as exc:
                logger.exception("job %s failed", run_id)
                state["status"] = "error"
                state.setdefault("errors", []).append({"error": type(exc).__name__})
                await asyncio.to_thread(self.runs.update, run_id, status="failed", ended_at=_now(), progress=dict(state))

        self.tasks[run_id] = asyncio.create_task(run())
        self.keys[(kind, corpus_id)] = run_id
        return self.view({**self.runs.get(run_id)})

    async def shutdown(self):
        for task in self.tasks.values():
            if not task.done():
                task.cancel()
        if self.tasks:
            await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        # Work cancelled before it began never reached its own handler: record it as well.
        for run_id in self.tasks:
            snapshot = self.runs.get(run_id)
            if snapshot.get("status") == "running":
                progress = {**snapshot.get("progress", {}), "status": "interrupted"}
                self.runs.update(run_id, status="interrupted", ended_at=_now(), progress=progress)
