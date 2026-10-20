"""Card B1: answers are written into a log that any number of pages follow (src/answers.py)."""
import asyncio
import json

from src.answers import AnswerLog, replay


def sse(event, data):
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def test_a_page_that_comes_late_still_gets_every_event_and_the_end():
    async def scenario():
        log = AnswerLog()
        await log.append(sse("run", {"run_id": "r"}))
        await log.append(sse("token", {"text": "第一段，"}))
        late = []

        async def follow():
            async for chunk in log.follow():
                late.append(chunk)

        reader = asyncio.create_task(follow())
        await asyncio.sleep(0)
        await log.append(sse("token", {"text": "第二段。"}))
        await log.append(sse("done", {"ok": True}))
        await log.close()
        await asyncio.wait_for(reader, 1)
        return late, log.chunks

    late, chunks = asyncio.run(scenario())
    assert late == chunks and len(late) == 4


def test_the_kept_replay_joins_the_tokens_in_place():
    chunks = [sse("run", {"run_id": "r"}), sse("sources", []), sse("token", {"text": "第一段，"}),
              sse("step", {"id": "s"}), sse("token", {"text": "第二段。"}), sse("done", {"ok": True})]
    kept = replay(chunks)
    assert [c.split("\n")[0] for c in kept] == ["event: run", "event: sources", "event: token", "event: step", "event: done"]
    assert json.loads(kept[2].split("data: ", 1)[1]) == {"text": "第一段，第二段。"}
