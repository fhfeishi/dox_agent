"""R1: real shared SQLite, threads and spawn processes; no live corpus or model."""

import multiprocessing
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from src.project_index import ProjectIndex


class Sources:
    def __init__(self, count=6):
        self.docs = [{"doc_id": f"d{i}", "version": "v1", "title": f"项目{i}",
                      "origin": f"2021_2024_621730{i:02d}_作者_项目{i}.md", "page_count": 1}
                     for i in range(count)]

    def all(self):
        return list(self.docs)

    def current(self):
        return self.all()

    def read_markdown(self, doc, version):
        return f"---\nratifyNo: 621730{int(doc[1:]):02d}\nprojectName: {doc}\nsupportNum: 20\n---\n项目正文"


class CountedIndex(ProjectIndex):
    def document(self, info, doc, text):
        folder = self.path.parent / "parsed-calls"
        folder.mkdir(exist_ok=True)
        (folder / f"{info.id}-{doc['doc_id']}-{uuid4().hex}").touch()
        time.sleep(.005)
        return super().document(info, doc, text)


def corpus(root, name="a"):
    root = Path(root) / name
    root.mkdir(exist_ok=True)
    return SimpleNamespace(id=name, root=root, dir_name="自然科学基金-测试", name="自然科学基金-测试")


def refresh_process(path, info, start, results):
    index = CountedIndex(path)
    start.wait(10)
    try:
        results.put(("ok", index.refresh(info, Sources())))
    except Exception as exc:
        results.put(("error", repr(exc)))


def test_cold_cache_threads(tmp_path):
    index = CountedIndex(tmp_path / "index.sqlite3")
    a, b, sources = corpus(tmp_path), corpus(tmp_path, "b"), Sources()
    with ThreadPoolExecutor(max_workers=16) as pool:
        rows = list(pool.map(lambda info: index.library(info, sources), [a] * 8 + [b] * 8))
    assert all(len(row["projects"]) == 6 and row["index"]["state"] == "ready" for row in rows)
    assert len(list((tmp_path / "parsed-calls").iterdir())) == 12
    assert index.library(a, sources)["index"]["revision"] == rows[0]["index"]["revision"]
    assert len(list((tmp_path / "parsed-calls").iterdir())) == 12


def test_cross_process_lease(tmp_path):
    path, info = tmp_path / "index.sqlite3", corpus(tmp_path)
    ProjectIndex(path)  # migrate before either service starts
    ctx = multiprocessing.get_context("spawn")
    start, results = ctx.Event(), ctx.Queue()
    workers = [ctx.Process(target=refresh_process, args=(path, info, start, results)) for _ in range(2)]
    for worker in workers:
        worker.start()
    start.set()
    outcomes = [results.get(timeout=30) for _ in workers]
    for worker in workers:
        worker.join(10)
        assert worker.exitcode == 0
    assert all(item[0] == "ok" for item in outcomes), outcomes
    assert len(list((tmp_path / "parsed-calls").iterdir())) == 6
    with ProjectIndex(path).connect() as db:
        assert db.execute("SELECT revision,lease_owner FROM index_state WHERE corpus='a'").fetchone() == (1, None)


def test_expired_lease_is_taken_over(tmp_path):
    index, info = CountedIndex(tmp_path / "index.sqlite3"), corpus(tmp_path)
    with index.connect() as db:
        db.execute("INSERT INTO index_state(corpus,revision,lease_owner,lease_until) VALUES(?,0,?,?)",
                   (info.id, "dead-worker", (datetime.now(UTC) - timedelta(seconds=1)).isoformat()))
    assert index.refresh(info, Sources()) == 1
    assert len(list((tmp_path / "parsed-calls").iterdir())) == 6


def test_stale_read_does_not_wait(tmp_path, monkeypatch):
    index, info, sources = ProjectIndex(tmp_path / "index.sqlite3"), corpus(tmp_path), Sources()
    index.refresh(info, sources)
    sources.docs[0] = {**sources.docs[0], "version": "v2"}
    with index.connect() as db:
        db.execute("UPDATE index_state SET lease_owner=?,lease_until=? WHERE corpus=?",
                   ("other-worker", (datetime.now(UTC) + timedelta(minutes=10)).isoformat(), info.id))
    monkeypatch.setattr(index, "document", lambda *args: (_ for _ in ()).throw(AssertionError("request parsed")))
    started = time.monotonic()
    row = index.library(info, sources)
    assert time.monotonic() - started < 1
    assert row["index"] == {"state": "refreshing", "revision": 1, "stale_docs": 1}
    assert len(row["projects"]) == 6 and row["projects"][0]["files"][0]["document"]["version"] == "v1"


def test_one_transaction(tmp_path, monkeypatch):
    index, info, traces = ProjectIndex(tmp_path / "index.sqlite3"), corpus(tmp_path), []
    original = index.connect

    def traced(*args, **kwargs):
        db = original(*args, **kwargs)
        db.set_trace_callback(traces.append)
        return db

    monkeypatch.setattr(index, "connect", traced)
    index.refresh(info, Sources())
    transactions, active = [], []
    for statement in traces:
        if statement.startswith("BEGIN"):
            active = []
        active.append(statement)
        if statement == "COMMIT":
            transactions.append(active)
            active = []
    publications = [tx for tx in transactions if any("INSERT INTO project_documents" in sql for sql in tx)]
    assert len(publications) == 1
    assert sum("INSERT INTO project_documents" in sql for sql in publications[0]) == 6
    assert any("revision=revision+1" in sql.replace(" ", "") for sql in publications[0])


def test_aggregate_cached_by_revision(tmp_path, monkeypatch):
    index, info, sources = ProjectIndex(tmp_path / "index.sqlite3"), corpus(tmp_path), Sources()
    index.refresh(info, sources)
    calls, aggregate = [], index.aggregate
    monkeypatch.setattr(index, "aggregate", lambda *args: (calls.append(1), aggregate(*args))[1])
    index.library(info, sources)
    index.library(info, sources)
    assert len(calls) == 1
    with ProjectIndex(index.path).connect() as db:
        db.execute("UPDATE index_state SET revision=revision+1 WHERE corpus=?", (info.id,))
    assert index.library(info, sources)["index"]["revision"] == 2
    assert len(calls) == 2
    # Reproduce the lock-order failure found in full regression: a reader waiting for the
    # aggregate lock must not retain a DB read transaction and prevent another connection committing.
    waiting, gate = threading.Event(), threading.RLock()

    class ContendedCache:
        def __enter__(self):
            waiting.set()
            return gate.__enter__()

        def __exit__(self, *args):
            return gate.__exit__(*args)

    monkeypatch.setattr(index, "_cache_lock", ContendedCache())
    with ThreadPoolExecutor(max_workers=1) as pool:
        with gate:
            reader = pool.submit(index.library, info, sources)
            assert waiting.wait(5)
            with index.connect() as db:
                db.execute("UPDATE index_state SET revision=revision+1 WHERE corpus=?", (info.id,))
        assert reader.result(timeout=5)["index"]["revision"] == 3
