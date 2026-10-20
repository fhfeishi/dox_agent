"""Answers that outlive the page that asked for them (upgrade plan card B1; user, 2026-10-20).

An answer is produced by its own task, not by the HTTP response: every server-sent event goes into the
run's ``AnswerLog`` and each page that wants the answer *follows* the log from the start. Closing the
page ends one follower and nothing else, so the answer keeps going and is there when the person comes
back. Stopping is an explicit request (cancel), because leaving is no longer one.

When the answer completes, its events, with the tokens joined into one, are kept with the run
(``replay``). That lets a page come back after the in-memory log is gone, including after a restart.
"""

import asyncio
import json
from collections.abc import AsyncIterator

# How long a finished answer's live log stays in memory for pages that come back (the replay
# kept with the run covers the time after that).
KEEP_SECONDS = 600


class AnswerLog:
    def __init__(self):
        self.chunks: list[str] = []
        self.done = False
        self._changed = asyncio.Condition()

    async def append(self, chunk: str):
        async with self._changed:
            self.chunks.append(chunk)
            self._changed.notify_all()

    async def close(self):
        async with self._changed:
            self.done = True
            self._changed.notify_all()

    async def follow(self) -> AsyncIterator[str]:
        """Every event from the first, then each new one until the answer ends."""
        sent = 0
        while True:
            async with self._changed:
                await self._changed.wait_for(lambda seen=sent: len(self.chunks) > seen or self.done)
                fresh, finished = self.chunks[sent:], self.done  # nothing is appended after done
            for chunk in fresh:
                yield chunk
            sent += len(fresh)
            if finished:
                return


def event_name(chunk: str) -> str:
    return chunk.split("\n", 1)[0].removeprefix("event: ")


def replay(chunks: list[str]) -> list[str]:
    """The events of a finished answer with its tokens joined into one, in the first token's place."""
    tokens = [json.loads(chunk.split("data: ", 1)[1]).get("text", "") for chunk in chunks if event_name(chunk) == "token"]
    merged = f"event: token\ndata: {json.dumps({'text': ''.join(tokens)}, ensure_ascii=False)}\n\n"
    out, placed = [], False
    for chunk in chunks:
        if event_name(chunk) == "token":
            if not placed:
                out.append(merged)
                placed = True
            continue
        out.append(chunk)
    return out


async def from_list(chunks: list[str]) -> AsyncIterator[str]:
    for chunk in chunks:
        yield chunk
