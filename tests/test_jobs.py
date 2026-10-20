"""Card B1: the persisted job runner (imports and four-dimension extraction so far)."""
import asyncio

import pytest

from src.jobs import JobBusy, Jobs
from src.runs import RunStore


def test_progress_is_saved_and_the_run_completes(tmp_path):
    async def scenario():
        jobs = Jobs(RunStore(tmp_path / "runs.sqlite3"))
        seen = []

        async def work(state, report):
            for done in (1, 2):
                report(completed=done)
                seen.append(jobs.latest("import", "c1")["completed"])
                await asyncio.sleep(0)
            return {"status": "done"}

        started = jobs.start("import", "c1", work, {"status": "running", "completed": 0, "total": 2})
        assert started["run_status"] == "running" and jobs.busy("import", "c1")
        with pytest.raises(JobBusy):
            jobs.start("import", "c1", work, {"status": "running"})
        await jobs.tasks[started["run_id"]]
        latest = jobs.latest("import", "c1")
        assert seen == [1, 2] and latest["status"] == "done" and latest["run_status"] == "completed"
        assert not jobs.busy("import", "c1") and jobs.latest("import", "other") is None
        assert jobs.get(started["run_id"], "import", "c1")["completed"] == 2
        assert jobs.get(started["run_id"], "target", "c1") is None  # a run is only found as what it is

    asyncio.run(scenario())


def test_a_failing_job_is_recorded_as_failed(tmp_path):
    async def scenario():
        jobs = Jobs(RunStore(tmp_path / "runs.sqlite3"))

        async def work(state, report):
            raise OSError("disk")

        started = jobs.start("target", "c1", work, {"status": "running", "errors": []})
        await jobs.tasks[started["run_id"]]
        latest = jobs.latest("target", "c1")
        assert latest["run_status"] == "failed" and latest["status"] == "error"
        assert latest["errors"] == [{"error": "OSError"}]

    asyncio.run(scenario())


def test_shutdown_and_restart_leave_interrupted_runs_not_running_ones(tmp_path):
    path = tmp_path / "runs.sqlite3"

    async def scenario():
        jobs = Jobs(RunStore(path))

        async def forever(state, report):
            await asyncio.sleep(3600)

        jobs.start("import", "c1", forever, {"status": "running"})
        await jobs.shutdown()
        assert jobs.latest("import", "c1")["status"] == "interrupted"

    asyncio.run(scenario())

    # A process killed outright never ran its shutdown: its run is still “running” on disk.
    store = RunStore(path)
    store.create("import-killed", "f", run_type="import", status="running", effective_corpus_ids=["c2"])
    store.update("import-killed", progress={"status": "running", "completed": 3})
    jobs = Jobs(store)
    assert jobs.recover() == ["import-killed"]
    latest = jobs.latest("import", "c2")
    assert latest["status"] == "interrupted" and latest["run_status"] == "interrupted" and latest["completed"] == 3
