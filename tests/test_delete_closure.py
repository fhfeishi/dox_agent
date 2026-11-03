"""P0-2 删除闭合: a removed source leaves nothing behind — five SQLite tables, parsed/, target/.

Paths covered: import pruning (source gone from disk), the admin delete and rename APIs, a personal
library dropping an uploaded document, and repeated deletion. Deleting a whole library removes its
directories and is covered by the existing library tests.
"""
import json
import sqlite3
import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
from pypdf import PdfWriter

from src.agent.config import Settings
from src.knowledge import Knowledge
from src.main import create_app
from src.parse_cache import STAGING, read_cache, rename_rel, staging_dir
from src.parsers import forget_source, import_defaults
from src.personal_libraries import drop_uploads

TABLES = {"docs": "id", "chunks": "doc_id", "doc_pages": "doc_id", "doc_markdown": "doc_id"}

FAKE = """
import json, pathlib, sys
calls = pathlib.Path({calls!r})
calls.write_text(str(int(calls.read_text() or 0) + 1))
out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
(out / "full.md").write_text("# parsed", encoding="utf-8")
pages = [{{"page_idx": i, "blocks": [{{"type": "text", "content": "page text long enough to count " + str(i)}}]}} for i in range(2)]
(out / "middle_json.json").write_text(json.dumps({{"pages": pages}}), encoding="utf-8")
"""


def write_pdf(path: Path) -> None:
    writer = PdfWriter()
    for _ in range(2):
        writer.add_blank_page(width=200, height=200)
    with path.open("wb") as handle:
        writer.write(handle)


class Corpus:
    def __init__(self, root: Path):
        self.root = root
        self.source = root / "source"
        self.source.mkdir(parents=True)
        self.parsed = root / "parsed"
        self.db = root / "datadb" / "knowledge.sqlite3"
        self.calls_file = root.parent / f"{root.name}-calls"
        self.calls_file.write_text("0")
        script = root.parent / f"{root.name}-mineru.py"
        script.write_text(FAKE.format(calls=str(self.calls_file)), encoding="utf-8")
        self.settings = Settings(_env_file=None, mineru_cmd=f"{sys.executable} {script} {{pdf}} {{out}}")
        self.store = Knowledge(self.db, source_root=self.source)

    @property
    def calls(self) -> int:
        return int(self.calls_file.read_text())

    def add(self, name: str) -> str:
        write_pdf(self.source / name)
        report = import_defaults(self.store, self.settings, root=self.source, parsed_root=self.parsed)
        assert not report["errors"]
        doc_id = self.store.files()[name]["doc_id"]
        target = self.root / "target" / f"{doc_id}.json"  # stands in for a four-dimension record
        target.parent.mkdir(exist_ok=True)
        target.write_text("{}", encoding="utf-8")
        return doc_id

    def rows(self, doc_id: str) -> dict[str, int]:
        with sqlite3.connect(self.db) as db:
            counts = {table: db.execute(f"SELECT COUNT(*) FROM {table} WHERE {column}=?", (doc_id,)).fetchone()[0]
                      for table, column in TABLES.items()}
            counts["files"] = db.execute("SELECT COUNT(*) FROM files WHERE doc_id=?", (doc_id,)).fetchone()[0]
        return counts

    def assert_gone(self, name: str, doc_id: str):
        assert self.rows(doc_id) == dict.fromkeys([*TABLES, "files"], 0)
        assert not (self.parsed / name).exists()
        assert not list((self.parsed / STAGING).glob("*")) if (self.parsed / STAGING).exists() else True
        assert not (self.root / "target" / f"{doc_id}.json").exists()
        assert doc_id not in {doc["doc_id"] for doc in self.store.current()}

    def assert_present(self, name: str, doc_id: str):
        assert all(count > 0 for count in self.rows(doc_id).values())
        assert read_cache(self.parsed / name) is not None
        assert (self.root / "target" / f"{doc_id}.json").exists()


def test_pruning_a_vanished_source_removes_everything_derived(tmp_path):
    corpus = Corpus(tmp_path / "lib")
    gone, kept = corpus.add("gone.pdf"), corpus.add("kept.pdf")
    staging_dir(corpus.parsed, "gone.pdf", "f" * 64).mkdir(parents=True)  # an interrupted parse of it
    corpus.assert_present("gone.pdf", gone)

    (corpus.source / "gone.pdf").unlink()
    report = import_defaults(corpus.store, corpus.settings, root=corpus.source, parsed_root=corpus.parsed)
    assert report["deleted"] == 1
    corpus.assert_gone("gone.pdf", gone)
    corpus.assert_present("kept.pdf", kept)

    again = import_defaults(corpus.store, corpus.settings, root=corpus.source, parsed_root=corpus.parsed)
    assert again["deleted"] == 0 and again["skipped"] == 1


def test_forget_source_is_idempotent_and_leaves_other_documents(tmp_path):
    corpus = Corpus(tmp_path / "lib")
    a, b = corpus.add("a.pdf"), corpus.add("b.pdf")
    assert forget_source(corpus.store, "a.pdf", corpus.root) == a
    corpus.assert_gone("a.pdf", a)
    assert forget_source(corpus.store, "a.pdf", corpus.root) is None
    assert forget_source(corpus.store, "never.pdf", corpus.root) is None
    corpus.assert_present("b.pdf", b)


def test_virtual_rel_is_dropped_from_sqlite_without_touching_parsed(tmp_path):
    corpus = Corpus(tmp_path / "lib")
    corpus.add("a.pdf")
    (corpus.parsed / "manual:x").mkdir()  # cannot be a real cache; must survive a virtual drop
    forget_source(corpus.store, "manual:x", corpus.root)
    assert (corpus.parsed / "manual:x").is_dir()


def test_rename_keeps_the_parse_and_needs_no_mineru(tmp_path):
    corpus = Corpus(tmp_path / "lib")
    old = corpus.add("old.pdf")
    assert corpus.calls == 1
    (corpus.source / "old.pdf").rename(corpus.source / "new.pdf")
    rename_rel(corpus.parsed, "old.pdf", "new.pdf")
    forget_source(corpus.store, "old.pdf", corpus.root)
    report = import_defaults(corpus.store, corpus.settings, root=corpus.source, parsed_root=corpus.parsed)
    assert report["added"] == 1 and not report["errors"]
    assert corpus.calls == 1  # the moved cache was reused
    assert read_cache(corpus.parsed / "new.pdf")["rel"] == "new.pdf"
    assert not (corpus.parsed / "old.pdf").exists()
    corpus.assert_gone("old.pdf", old)


def test_personal_upload_removal_cleans_everything(tmp_path):
    corpus = Corpus(tmp_path / "mine")
    doc_id = corpus.add("up.pdf")
    info = SimpleNamespace(root=corpus.root, source_dir=corpus.source)
    drop_uploads(corpus.store, info, [doc_id])
    assert not (corpus.source / "up.pdf").exists()
    corpus.assert_gone("up.pdf", doc_id)
    drop_uploads(corpus.store, info, [doc_id])  # again: nothing left, no error


def test_admin_delete_and_rename_apis_clean_derived_files(tmp_path):
    settings = Settings(_env_file=None, corpora_root=tmp_path / "knowledge", state_dir=tmp_path / "state")
    app = create_app(settings)
    with TestClient(app) as client:
        cid = client.post("/api/corpora", json={"name": "删除库"}).json()["id"]
        assert client.post(f"/api/corpora/{cid}/files",
                           files={"upload": ("报告.md", "# 报告\n正文", "text/markdown")}).status_code == 201
        root = tmp_path / "knowledge" / "删除库"
        doc_id = client.get(f"/api/corpora/{cid}/files").json()["files"][0]["doc_id"]
        (root / "target").mkdir(exist_ok=True)
        (root / "target" / f"{doc_id}.json").write_text(json.dumps({}), encoding="utf-8")
        (root / "parsed" / "报告.md").mkdir(parents=True)

        assert client.patch(f"/api/corpora/{cid}/files",
                            json={"rel_path": "报告.md", "new_name": "改名.md"}).status_code == 200
        assert not (root / "target" / f"{doc_id}.json").exists()
        assert not (root / "parsed" / "报告.md").exists() and (root / "parsed" / "改名.md").is_dir()

        new_id = client.get(f"/api/corpora/{cid}/files").json()["files"][0]["doc_id"]
        (root / "target" / f"{new_id}.json").write_text(json.dumps({}), encoding="utf-8")
        assert client.delete(f"/api/corpora/{cid}/files", params={"rel_path": "改名.md"}).status_code == 200
        assert not (root / "target" / f"{new_id}.json").exists()
        assert not (root / "parsed" / "改名.md").exists()
        store = Knowledge(root / "datadb" / "knowledge.sqlite3")
        with store.connect() as db:
            for table, column in TABLES.items():
                assert db.execute(f"SELECT COUNT(*) FROM {table} WHERE {column} IN (?, ?)",
                                  (doc_id, new_id)).fetchone()[0] == 0
