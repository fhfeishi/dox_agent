"""P0-1 (B2/B3): staging parses, cache.json identities, reconcile before skip, fault matrix F1–F9.

The fake MinerU writes a middle JSON whose page text carries a label, so every check can tell which
parse the canonical cache and the SQLite body come from. Two kinds of injected fault:

- an ordinary ``OSError``, caught by ``import_one`` itself (checks the P1/P2 vs P3 boundaries);
- ``SimulatedCrash(BaseException)``, which no ``except Exception`` catches; the test then opens the
  library with a new ``Knowledge``. This checks recovery from a given on-disk state. It is *not*
  evidence for a real process kill or power loss: ``finally`` blocks and SQLite rollback still run.
"""
import json
import os
import shutil
import sys
from pathlib import Path

import pytest
from pypdf import PdfWriter

from src.agent.config import Settings
from src.knowledge import Knowledge
from src.parse_cache import CACHE_FILE, LEGACY, STAGING, TRASH, cache_state, read_cache, staging_dir
from src.parsers import import_defaults, sha256_file

REL = "a.pdf"


class SimulatedCrash(BaseException):
    pass


def write_pdf(path: Path, pages: int = 2, tag: str = "v1") -> None:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    writer.add_metadata({"/Title": tag})
    with path.open("wb") as handle:
        writer.write(handle)


FAKE = """
import json, pathlib, sys
cfg = json.loads(pathlib.Path({cfg!r}).read_text())
calls = pathlib.Path({calls!r})
calls.write_text(str(int(calls.read_text() or 0) + 1))
if cfg.get("mutate"):
    with open(sys.argv[1], "ab") as handle:
        handle.write(b"%changed")
if cfg.get("fail"):
    sys.exit(1)
out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
label = cfg["label"]
(out / "full.md").write_text("# " + label, encoding="utf-8")
text = "" if cfg.get("empty") else label
pages = [{{"page_idx": i, "blocks": [{{"type": "text", "content": [{{"type": "text", "content": text + " p" + str(i + 1)}}]}}]}}
         for i in range(cfg["pages"])] if not cfg.get("empty") else [{{"page_idx": i, "blocks": []}} for i in range(cfg["pages"])]
if cfg.get("no_middle"):
    (out / "x_content_list.json").write_text(json.dumps([{{"type": "text", "text": label, "page_idx": 0}}]))
else:
    (out / "middle_json.json").write_text(json.dumps({{"pages": pages}}), encoding="utf-8")
"""


class Lib:
    def __init__(self, tmp_path: Path):
        self.source = tmp_path / "source"
        self.source.mkdir()
        self.parsed = tmp_path / "parsed"
        self.db = tmp_path / "db" / "knowledge.sqlite3"
        self.cfg = tmp_path / "mineru.json"
        self.calls_file = tmp_path / "calls"
        self.calls_file.write_text("0")
        script = tmp_path / "fake_mineru.py"
        script.write_text(FAKE.format(cfg=str(self.cfg), calls=str(self.calls_file)), encoding="utf-8")
        self.settings = Settings(_env_file=None, mineru_cmd=f"{sys.executable} {script} {{pdf}} {{out}}")
        self.pdf = self.source / REL
        write_pdf(self.pdf)
        self.mineru(label="A")
        self.open()

    def mineru(self, **cfg):
        self.cfg.write_text(json.dumps({"pages": 2, **cfg}))

    def open(self):
        self.store = Knowledge(self.db, source_root=self.source)

    def run(self, force=False):
        return import_defaults(self.store, self.settings, root=self.source, force=force, parsed_root=self.parsed)

    @property
    def calls(self) -> int:
        return int(self.calls_file.read_text())

    @property
    def entry(self) -> dict:
        return self.store.files()[REL]

    @property
    def doc(self) -> dict:
        return self.store.get(self.entry["doc_id"])

    def body(self) -> str:
        return self.store.read_markdown(self.entry["doc_id"])

    def state(self) -> str:
        return cache_state(self.parsed, REL, self.entry["sha256"], self.doc["version"])

    def canonical(self) -> dict | None:
        return read_cache(self.parsed / REL)

    def leftovers(self) -> list[str]:
        return sorted(str(path.relative_to(self.parsed)) for name in (STAGING, TRASH)
                      for path in (self.parsed / name).glob("*")) if self.parsed.exists() else []

    def assert_published(self, label: str, *, error_kept: bool = False):
        """Manifest, docs.version, canonical cache.json and its products agree on one parse."""
        entry = self.entry
        assert (entry["sha256"], entry["status"]) == (sha256_file(self.pdf), "indexed")
        assert bool(entry["last_error"]) is error_kept
        assert self.body() == "# " + label
        assert self.doc["doc_id"] in {doc["doc_id"] for doc in self.store.current()}
        cache = self.canonical()
        assert cache is not None
        assert (cache["source_sha256"], cache["version"]) == (entry["sha256"], self.doc["version"])
        assert (self.parsed / REL / "full.md").read_text(encoding="utf-8") == "# " + label

    def assert_settled(self, label: str, **kwargs):
        self.assert_published(label, **kwargs)
        assert self.state() == "ok"
        assert self.leftovers() == []
        assert not (self.parsed / STAGING).exists() and not (self.parsed / TRASH).exists()


@pytest.fixture
def lib(tmp_path):
    lib = Lib(tmp_path)
    assert lib.run()["added"] == 1
    lib.assert_settled("A")
    assert lib.calls == 1
    return lib


class Inject:
    """Fail the first call of ``target`` that matches ``when``; afterwards pass everything through."""

    def __init__(self, monkeypatch, owner, name, when, error):
        self.original = getattr(owner, name)
        self.when, self.error, self.fired = when, error, False

        def wrapper(*args, **kwargs):
            if not self.fired and self.when(*args, **kwargs):
                self.fired = True
                raise self.error
            return self.original(*args, **kwargs)
        monkeypatch.setattr(owner, name, wrapper)


def is_trash_move(src, dst, *_):
    return Path(dst).parent.name == TRASH


def is_staging_rename(src, dst, *_):
    return Path(src).parent.name == STAGING and Path(dst).name == REL


def is_trash_drop(path, *_, **kwargs):
    return Path(path).parent.name == TRASH and not kwargs.get("ignore_errors")


def is_marker_write(src, dst, *_):
    return Path(dst).name == CACHE_FILE


STEP = {
    "F3": (os, "replace", is_marker_write),
    "F5": (os, "replace", is_trash_move),
    "F6": (os, "replace", is_staging_rename),
    "F7": (shutil, "rmtree", is_trash_drop),
}


def arm(lib, monkeypatch, row: str, error: BaseException):
    if row == "F1":
        lib.mineru(label="B", fail=True)
    elif row == "F2":
        lib.mineru(label="B", pages=3)  # the PDF has 2 pages: the guard refuses the parse
    elif row == "F4":
        Inject(monkeypatch, lib.store, "put", lambda *a, **k: True, error)  # raises before any commit
    else:
        owner, name, when = STEP[row]
        Inject(monkeypatch, owner, name, when, error)


def change(lib, case: str):
    if case == "new-sha":
        write_pdf(lib.pdf, tag="v2")
    if row_changes_body(case):
        lib.mineru(label="B")


def row_changes_body(case):
    return case in ("new-sha", "same-sha")


def attempt(lib, case, error):
    force = case != "new-sha"
    if isinstance(error, SimulatedCrash):
        with pytest.raises(SimulatedCrash):
            lib.run(force=force)
        lib.open()  # a new process opens the same library
        return None
    return lib.run(force=force)


ERRORS = {"oserror": lambda: OSError("injected"), "crash": lambda: SimulatedCrash()}


# F1 (MinerU exits 1) and F2 (page guard) are parser outcomes, so only F3 also runs as a crash.
@pytest.mark.parametrize("case", ["new-sha", "same-sha"])
@pytest.mark.parametrize(("row", "kind"), [("F1", "oserror"), ("F2", "oserror"), ("F3", "oserror"), ("F3", "crash")])
def test_parse_stage_failure_keeps_the_published_document(lib, monkeypatch, row, case, kind):
    old_sha, old_version = lib.entry["sha256"], lib.doc["version"]
    change(lib, case)
    arm(lib, monkeypatch, row, ERRORS[kind]())
    report = attempt(lib, case, ERRORS[kind]())
    if report is not None:
        assert report["errors"] and report["skipped"] == 0
    # Never the old cache published under a new sha, never a half parse marked complete.
    assert lib.canonical()["source_sha256"] == old_sha and lib.doc["version"] == old_version
    assert all(read_cache(path) is None for path in (lib.parsed / STAGING).glob("*"))
    if case == "same-sha" and kind == "oserror":
        # Decision ②: the source equals the indexed one, so the document stays current.
        assert (lib.entry["status"], lib.entry["sha256"]) == ("indexed", old_sha) and lib.entry["last_error"]
        assert lib.doc["doc_id"] in {doc["doc_id"] for doc in lib.store.current()}
    if case == "new-sha" and kind == "oserror":
        assert (lib.entry["status"], lib.entry["sha256"]) == ("error", old_sha)
    calls = lib.calls
    lib.mineru(label="B")
    lib.run()
    if case == "new-sha":
        lib.assert_settled("B")
        assert lib.calls == calls + 1  # the incomplete parse is swept and parsed again
    else:
        # Same source: the next normal import keeps the old current; the failed reparse stays noted
        # (decision ②) until a parse succeeds, unless the attempt never returned (crash).
        lib.assert_settled("A", error_kept=kind == "oserror")
        assert lib.calls == calls


@pytest.mark.parametrize("kind", ["oserror", "crash"])
@pytest.mark.parametrize("case", ["new-sha", "same-sha"])
def test_put_failure_keeps_complete_staging_for_reuse(lib, monkeypatch, case, kind):
    """F4 (U9): the complete staging parse is published on the next import without MinerU."""
    old_version = lib.doc["version"]
    change(lib, case)
    arm(lib, monkeypatch, "F4", ERRORS[kind]())
    attempt(lib, case, ERRORS[kind]())
    assert lib.doc["version"] == old_version and lib.body() == "# A"
    staged = [read_cache(path) for path in (lib.parsed / STAGING).glob("*")]
    assert len(staged) == 1 and staged[0]["version"] != old_version
    if case == "same-sha":
        assert lib.state() == "publish_pending"
    calls = lib.calls
    monkeypatch.undo()
    lib.open()
    report = lib.run()
    assert lib.calls == calls and report["updated"] == 1
    lib.assert_settled("B")
    assert lib.doc["version"] == staged[0]["version"]


@pytest.mark.parametrize("kind", ["oserror", "crash"])
@pytest.mark.parametrize("case", ["new-sha", "same-sha", "same-sha-same-body"])
@pytest.mark.parametrize("row", ["F5", "F6", "F7"])
def test_promotion_failure_never_rolls_back_the_published_manifest(lib, monkeypatch, row, case, kind):
    """F5–F7 / I1–I3: the parse is committed first; promotion is completed by the next import."""
    change(lib, case)
    label = "A" if case == "same-sha-same-body" else "B"
    arm(lib, monkeypatch, row, ERRORS[kind]())
    report = attempt(lib, case, ERRORS[kind]())
    # Right after the failure: nothing published was rolled back or marked as an error.
    entry = lib.entry
    assert (entry["sha256"], entry["status"], entry["last_error"]) == (sha256_file(lib.pdf), "indexed", "")
    assert lib.body() == "# " + label
    assert lib.doc["doc_id"] in {doc["doc_id"] for doc in lib.store.current()}
    if report is not None:
        assert report["errors"] == []
        assert report["imported"][0]["promotion_pending"] is True
    if row == "F6":
        assert not (lib.parsed / REL).exists()  # I2: canonical in trash, staging not renamed yet
    # I1/I2 wait for promotion; I3 (F7) already has the new canonical parse and only trash is left.
    assert lib.state() == ("ok" if row == "F7" else "promotion_pending")
    calls = lib.calls
    lib.open()
    assert lib.run()["errors"] == []
    assert lib.calls == calls
    lib.assert_settled(label)


def test_same_sha_reparse_interrupted_before_put_is_published_on_next_import(lib, monkeypatch):
    """I0 same sha, reconcile #2: a complete but unpublished staging parse is published."""
    lib.mineru(label="B")
    arm(lib, monkeypatch, "F4", SimulatedCrash())
    with pytest.raises(SimulatedCrash):
        lib.run(force=True)
    monkeypatch.undo()
    lib.open()
    calls = lib.calls
    assert lib.run()["updated"] == 1
    assert lib.calls == calls
    lib.assert_settled("B")


def test_same_sha_reparse_incomplete_staging_keeps_old_current(lib, monkeypatch):
    lib.mineru(label="B")
    arm(lib, monkeypatch, "F3", SimulatedCrash())
    with pytest.raises(SimulatedCrash):
        lib.run(force=True)
    lib.open()
    assert list((lib.parsed / STAGING).glob("*"))  # products without a completion marker
    calls = lib.calls
    assert lib.run()["skipped"] == 1
    assert lib.calls == calls
    lib.assert_settled("A")


def test_republish_failure_keeps_old_current_and_retries(lib, monkeypatch):
    """F8: the reconcile #2 publication fails; decision ② keeps the old document, no MinerU."""
    lib.mineru(label="B")
    arm(lib, monkeypatch, "F4", OSError("first"))
    lib.run(force=True)
    monkeypatch.undo()
    old_version = lib.doc["version"]
    arm(lib, monkeypatch, "F4", OSError("again"))
    calls = lib.calls
    report = lib.run()
    assert report["errors"] and lib.calls == calls
    assert (lib.entry["status"], lib.doc["version"]) == ("indexed", old_version)
    assert "again" in lib.entry["last_error"]
    assert lib.doc["doc_id"] in {doc["doc_id"] for doc in lib.store.current()}
    monkeypatch.undo()
    lib.open()
    lib.run()
    assert lib.calls == calls
    lib.assert_settled("B")


@pytest.mark.parametrize("damage", ["corrupt", "version", "sha"])
def test_cache_mismatch_without_staging_flags_and_ignores_cache(lib, damage):
    """F9 / reconcile #5: the document stays current; the cache is left as it is, never reparsed."""
    marker = lib.parsed / REL / CACHE_FILE
    data = json.loads(marker.read_text())
    if damage == "corrupt":
        marker.write_text("{not json")
    else:
        data["version" if damage == "version" else "source_sha256"] = "0" * 20
        marker.write_text(json.dumps(data))
    before = marker.read_text()
    calls, version = lib.calls, lib.doc["version"]
    assert lib.run()["skipped"] == 1
    assert lib.calls == calls and lib.doc["version"] == version
    assert lib.doc["doc_id"] in {doc["doc_id"] for doc in lib.store.current()}
    assert marker.read_text() == before
    assert lib.state() == "cache_mismatch"


def test_missing_cache_keeps_current_and_flags_stage(lib):
    """Reconcile #6: retrieval does not depend on the cache; nothing is reparsed."""
    shutil.rmtree(lib.parsed / REL)
    calls = lib.calls
    assert lib.run()["skipped"] == 1
    assert lib.calls == calls
    assert lib.doc["doc_id"] in {doc["doc_id"] for doc in lib.store.current()}
    assert not (lib.parsed / REL).exists()
    assert lib.state() == "cache_missing"


def make_legacy(lib, pages=2):
    """A pre-P0 cache: the MinerU products without cache.json."""
    canonical = lib.parsed / REL
    canonical.mkdir(parents=True, exist_ok=True)
    (canonical / "full.md").write_text("# L", encoding="utf-8")
    (canonical / "middle_json.json").write_text(json.dumps({"pages": [
        {"page_idx": i, "blocks": [{"type": "text", "content": [{"type": "text", "content": f"L p{i + 1}"}]}]}
        for i in range(pages)]}), encoding="utf-8")


def test_first_import_adopts_legacy_cache_without_mineru(tmp_path):
    """U1 / decision ①: a page-consistent pre-P0 cache is adopted as legacy-unverified."""
    lib = Lib(tmp_path)
    make_legacy(lib)
    lib.mineru(label="X", fail=True)
    assert lib.run()["added"] == 1
    assert lib.calls == 0
    cache = lib.canonical()
    assert (cache["profile"], cache["version"], cache["source_sha256"], cache["pages"]) == (
        LEGACY, None, sha256_file(lib.pdf), 2)
    assert lib.body() == "# L" and lib.doc["doc_id"] in {doc["doc_id"] for doc in lib.store.current()}
    assert lib.state() == "legacy"
    # A legacy cache counts as consistent on the skip path (reconcile #3/#4).
    assert lib.run()["skipped"] == 1 and lib.calls == 0


def test_legacy_cache_with_wrong_page_count_is_reparsed(tmp_path):
    """U2 / N2 (石青: cache 20 pages, PDF 34): the guard refuses the cache on first import."""
    lib = Lib(tmp_path)
    make_legacy(lib, pages=1)
    assert lib.run()["added"] == 1
    assert lib.calls == 1
    lib.assert_settled("A")
    assert lib.canonical()["pages"] == 2


def test_legacy_cache_without_json_is_adopted_on_skip_path(lib):
    """Reconcile #4: an indexed document whose cache predates cache.json."""
    (lib.parsed / REL / CACHE_FILE).unlink()
    assert lib.run()["skipped"] == 1 and lib.calls == 1
    cache = lib.canonical()
    assert (cache["profile"], cache["version"], cache["source_sha256"]) == (LEGACY, None, lib.entry["sha256"])


def test_legacy_cache_failing_the_guard_on_skip_path_is_not_adopted(lib):
    (lib.parsed / REL / CACHE_FILE).unlink()
    make_legacy(lib, pages=5)
    assert lib.run()["skipped"] == 1 and lib.calls == 1
    assert lib.canonical() is None and lib.state() == "cache_mismatch"  # not adopted, not reparsed
    assert lib.doc["doc_id"] in {doc["doc_id"] for doc in lib.store.current()}


def test_new_pdf_cache_is_promoted_after_publish(lib):
    """U3/U4: only the current sha's parse remains; no .versions, no staging, doc_id unchanged."""
    doc_id = lib.entry["doc_id"]
    write_pdf(lib.pdf, tag="v2")
    lib.mineru(label="B")
    assert lib.run()["updated"] == 1
    lib.assert_settled("B")
    assert lib.entry["doc_id"] == doc_id
    assert not list(lib.parsed.rglob(".versions"))


def test_historical_versions_and_trash_are_swept(lib):
    (lib.parsed / REL / ".versions" / "old").mkdir(parents=True)
    (lib.parsed / TRASH / "x").mkdir(parents=True)
    lib.run()
    assert not (lib.parsed / REL / ".versions").exists() and not (lib.parsed / TRASH).exists()
    lib.assert_settled("A")


def test_incomplete_staging_is_swept(lib):
    sha = lib.entry["sha256"]
    missing = staging_dir(lib.parsed, REL, sha)
    missing.mkdir(parents=True)
    (missing / "full.md").write_text("# half")
    lib.run()
    assert lib.leftovers() == []
    # A marker whose products no longer match its version is incomplete too.
    shutil.copytree(lib.parsed / REL, missing)
    (missing / "full.md").write_text("# edited")
    lib.run()
    assert lib.leftovers() == []
    lib.assert_settled("A")


def test_stale_staging_for_changed_source_is_swept(lib, monkeypatch):
    write_pdf(lib.pdf, tag="v2")
    lib.mineru(label="B")
    arm(lib, monkeypatch, "F4", OSError("put"))
    lib.run()
    monkeypatch.undo()
    lib.open()
    write_pdf(lib.pdf, tag="v3")  # changed again: the v2 staging parse is stale
    lib.mineru(label="C")
    calls = lib.calls
    lib.run()
    assert lib.calls == calls + 1
    lib.assert_settled("C")


def test_staging_for_removed_rel_is_swept(lib, monkeypatch):
    other = lib.source / "b.pdf"
    write_pdf(other)
    lib.mineru(label="B")
    arm(lib, monkeypatch, "F4", OSError("put"))
    lib.run()
    monkeypatch.undo()
    assert len(list((lib.parsed / STAGING).glob("*"))) == 1
    other.unlink()
    lib.open()
    lib.run()
    assert lib.leftovers() == []


def test_source_changed_during_parse_is_rejected_and_staging_removed(lib):
    """U10."""
    write_pdf(lib.pdf, tag="v2")
    lib.mineru(label="B", mutate=True)
    report = lib.run()
    assert report["errors"] and lib.entry["status"] == "error"
    assert lib.leftovers() == []
    assert lib.canonical()["source_sha256"] != sha256_file(lib.pdf)


def test_profile_change_reuses_cache(lib):
    """U14: the cache key is the source sha; a changed MinerU profile is recorded, not reparsed."""
    lib.settings = Settings(_env_file=None, mineru_cmd=lib.settings.mineru_cmd + " --tier pro")
    assert lib.run()["skipped"] == 1 and lib.calls == 1
    assert "--tier" not in lib.canonical()["profile"]


@pytest.mark.parametrize("damage", ["null-version", "no-middle", "no-markdown"])
def test_staging_without_version_or_required_products_is_incomplete(lib, damage):
    """B2 completeness: version null is only for an adopted canonical legacy cache; a staging parse
    needs its middle JSON and its markdown."""
    staging = staging_dir(lib.parsed, REL, lib.entry["sha256"])
    shutil.copytree(lib.parsed / REL, staging)
    if damage == "null-version":
        data = json.loads((staging / CACHE_FILE).read_text())
        (staging / CACHE_FILE).write_text(json.dumps({**data, "version": None, "profile": LEGACY}))
    else:
        (staging / ("middle_json.json" if damage == "no-middle" else "full.md")).unlink()
    assert lib.run()["skipped"] == 1
    assert lib.calls == 1
    lib.assert_settled("A")


@pytest.mark.parametrize("problem", ["no-middle", "unreadable-pdf"])
def test_unchecked_page_count_is_not_published(lib, problem):
    """F2: a page count that cannot be read on either side does not pass the guard."""
    if problem == "unreadable-pdf":
        lib.pdf.write_bytes(b"not a pdf")
        lib.mineru(label="B")
    else:
        write_pdf(lib.pdf, tag="v2")
        lib.mineru(label="B", no_middle=True)
    report = lib.run()
    assert report["errors"] and lib.entry["status"] == "error"
    assert "无法核对解析页数" in lib.entry["last_error"]
    assert all(read_cache(path) is None for path in (lib.parsed / STAGING).glob("*"))
    assert lib.body() == "# A"
