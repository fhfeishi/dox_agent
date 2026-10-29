"""Personal libraries (D-20261027-1, D-20261028-2): an account's own named set of documents. A document
is either a reference to one in a system library, which is never copied, or a file the owner uploaded.
Each library keeps its uploads in its own small library (``mine-<id>``) under the owner's workspace
directory, parsed and indexed like a system library, so previewing and asking work the same way.
Only the owner sees, changes or deletes a personal library or its uploads."""

import asyncio
import hashlib
import json
import os
import re
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from .agent.corpora import (
    DB_DIRNAME,
    SOURCE_DIRNAME,
    SOURCE_SUFFIXES,
    VECTOR_DIRNAME,
    CorpusInfo,
    scan_corpora,
)
from .auth import CURRENT_USER
from .core.db import connect, migrate
from .jobs import JobBusy
from .parsers import import_one
from .workspace import SCHEMA as WORKSPACE_SCHEMA  # one schema for the shared workspace.sqlite3

router = APIRouter(prefix="/api/personal-libraries")

MAX_REFS = 2000
MINE = "mine-"  # library id prefix of a personal library's uploads
MAX_UPLOAD_BYTES = 200 * 1024 * 1024


class Ref(BaseModel):
    corpus_id: str = Field(min_length=1, max_length=200)
    doc_id: str = Field(min_length=1, max_length=200)
    # What the document was called when added, so a reference whose document is gone still has a name.
    title: str = Field(default="", max_length=300)


class LibraryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=1000)
    refs: list[Ref] = Field(default_factory=list, max_length=MAX_REFS)


class LibraryChange(BaseModel):
    revision: int = Field(ge=0)
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=1000)
    add: list[Ref] = Field(default_factory=list, max_length=MAX_REFS)
    remove: list[Ref] = Field(default_factory=list, max_length=MAX_REFS)


def merged(refs: list[dict], add: list[Ref], remove: list[Ref]) -> list[dict]:
    """References in the order they were added, each document once."""
    gone = {(r.corpus_id, r.doc_id) for r in remove}
    out = [r for r in refs if (r["corpus_id"], r["doc_id"]) not in gone]
    have = {(r["corpus_id"], r["doc_id"]) for r in out}
    for ref in add:
        if (ref.corpus_id, ref.doc_id) not in have:
            out.append(ref.model_dump())
            have.add((ref.corpus_id, ref.doc_id))
    if len(out) > MAX_REFS:
        raise HTTPException(422, f"一个个人资料库最多收录 {MAX_REFS} 份资料")
    return out


class PersonalLibraries:
    def __init__(self, path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        migrate(path, WORKSPACE_SCHEMA)

    def list(self, owner: str) -> list[dict]:
        with connect(self.path) as db:
            rows = db.execute("SELECT payload FROM personal_libraries WHERE owner=? ORDER BY rowid DESC", (owner,)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get(self, owner: str, library_id: str) -> dict:
        with connect(self.path) as db:
            row = db.execute("SELECT payload FROM personal_libraries WHERE id=? AND owner=?", (library_id, owner)).fetchone()
        if row is None:
            raise HTTPException(404, "个人资料库不存在")
        return json.loads(row[0])

    def create(self, owner: str, payload: LibraryCreate) -> dict:
        now = datetime.now(UTC).isoformat()
        library = {"id": uuid4().hex, "name": payload.name.strip(), "description": payload.description.strip(),
                   "refs": merged([], payload.refs, []), "revision": 1, "created_at": now, "updated_at": now}
        if not library["name"]:
            raise HTTPException(422, "请输入个人资料库名称")
        with connect(self.path) as db:
            db.execute("INSERT INTO personal_libraries VALUES (?, ?, ?, ?)",
                       (library["id"], owner, 1, json.dumps(library, ensure_ascii=False)))
        return library

    def change(self, owner: str, library_id: str, change: LibraryChange) -> dict:
        with connect(self.path) as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT revision, payload FROM personal_libraries WHERE id=? AND owner=?",
                             (library_id, owner)).fetchone()
            if row is None:
                raise HTTPException(404, "个人资料库不存在")
            if row[0] != change.revision:
                raise HTTPException(409, "个人资料库已在其他页面更新，请刷新后重试")
            library = json.loads(row[1])
            if change.name is not None:
                if not change.name.strip():
                    raise HTTPException(422, "请输入个人资料库名称")
                library["name"] = change.name.strip()
            if change.description is not None:
                library["description"] = change.description.strip()
            library["refs"] = merged(library["refs"], change.add, change.remove)
            library["revision"] = row[0] + 1
            library["updated_at"] = datetime.now(UTC).isoformat()
            db.execute("UPDATE personal_libraries SET revision=?, payload=? WHERE id=?",
                       (library["revision"], json.dumps(library, ensure_ascii=False), library_id))
        return library

    def owner_of(self, library_id: str) -> str | None:
        with connect(self.path) as db:
            row = db.execute("SELECT owner FROM personal_libraries WHERE id=?", (library_id,)).fetchone()
        return row[0] if row else None

    def delete(self, owner: str, library_id: str) -> None:
        with connect(self.path) as db:
            if not db.execute("DELETE FROM personal_libraries WHERE id=? AND owner=?", (library_id, owner)).rowcount:
                raise HTTPException(404, "个人资料库不存在")


def workspace_dir(settings, owner: str) -> Path:
    """The account's workspace (资料库数据接口 R2): ``<user_dir>/<account>/workspace``. A name that is not
    a plain file name on every system gets a stable hashed folder instead."""
    safe = re.fullmatch(r"[\w-]+(\.[\w-]+)*", owner) is not None
    return Path(settings.user_dir) / (owner if safe else "u-" + hashlib.sha1(owner.encode()).hexdigest()[:12]) / "workspace"


def uploads_info(settings, owner: str, library: dict) -> CorpusInfo:
    root = workspace_dir(settings, owner) / "libraries" / library["id"]
    sqlite = root / DB_DIRNAME / "knowledge.sqlite3"
    return CorpusInfo(id=MINE + library["id"], name=f"{library['name']} · 上传", kind="personal", domain="", rel_path="",
                      root=root, source_dir=root / SOURCE_DIRNAME, db_dir=root / DB_DIRNAME, vectordb_dir=root / VECTOR_DIRNAME,
                      sqlite=sqlite if sqlite.is_file() else None, docs_count=0, preparation="ready", dir_name=library["id"])


def find_uploads(app, corpus_id: str) -> CorpusInfo | None:
    """The uploads library behind ``mine-<id>``, for its owner only (the signed-in account of this request);
    for anyone else it does not exist, wherever the id is used (documents, preview, asking)."""
    library_id = corpus_id[len(MINE):]
    store = app.state.personal_libraries
    owner_ = CURRENT_USER.get()
    if not owner_ or store.owner_of(library_id) != owner_:
        return None
    return uploads_info(app.state.settings, owner_, store.get(owner_, library_id))


def owner(request: Request) -> str:
    return request.state.user[0]


def known_libraries(request: Request) -> dict[str, bool]:
    """Library id → whether it is gone: the system libraries, and the uploads of this account's own
    personal libraries."""
    known = {info.id: info.missing for info in scan_corpora(request.app.state.settings)}
    known.update({MINE + library["id"]: False for library in request.app.state.personal_libraries.list(owner(request))})
    return known


def with_status(library: dict, known: dict[str, bool]) -> dict:
    """Each reference says whether its library is still there; the document itself is checked
    by the page, which reads that library's document list anyway."""
    refs = [{**ref, "library_missing": known.get(ref["corpus_id"], True)} for ref in library["refs"]]
    return {**library, "refs": refs, "corpus_ids": list(dict.fromkeys(ref["corpus_id"] for ref in library["refs"]))}


@router.get("")
def list_libraries(request: Request):
    """The signed-in account's personal libraries, newest first, without their references."""
    return [{**{k: v for k, v in library.items() if k != "refs"}, "count": len(library["refs"]),
             "uploads": sum(ref["corpus_id"] == MINE + library["id"] for ref in library["refs"]),
             "corpus_ids": list(dict.fromkeys(ref["corpus_id"] for ref in library["refs"]))}
            for library in request.app.state.personal_libraries.list(owner(request))]


@router.post("", status_code=201)
def create_library(payload: LibraryCreate, request: Request):
    known = known_libraries(request)
    if any(ref.corpus_id not in known for ref in payload.refs):
        raise HTTPException(422, "引用的资料库不存在")
    return with_status(request.app.state.personal_libraries.create(owner(request), payload), known)


@router.get("/{library_id}")
def read_library(library_id: str, request: Request):
    """The library, its references, and ``uploads``: files still waiting, being parsed, or that failed."""
    library = request.app.state.personal_libraries.get(owner(request), library_id)
    info = uploads_info(request.app.state.settings, owner(request), library)
    busy = request.app.state.jobs.busy("import", info.id)
    return {**with_status(library, known_libraries(request)), "uploads": upload_states(request.app, info, busy)}


@router.patch("/{library_id}")
async def change_library(library_id: str, change: LibraryChange, request: Request):
    """Removing an uploaded document from the library it was uploaded to deletes the file too: it has no
    other home. Removing a reference never touches the system library."""
    known = await asyncio.to_thread(known_libraries, request)
    if any(ref.corpus_id not in known for ref in change.add):
        raise HTTPException(422, "引用的资料库不存在")
    library = await asyncio.to_thread(request.app.state.personal_libraries.change, owner(request), library_id, change)
    own = [ref.doc_id for ref in change.remove if ref.corpus_id == MINE + library_id]
    if own:
        info = uploads_info(request.app.state.settings, owner(request), library)
        if info.sqlite is not None:
            kn = request.app.state.corpus_ctx.knowledge_for(info)
            async with request.app.state.import_lock:
                await asyncio.to_thread(drop_uploads, kn, info, own)
    return with_status(library, known)


def drop_uploads(kn, info: CorpusInfo, doc_ids: list[str]) -> None:
    by_id = {doc["doc_id"]: doc for doc in kn.current()}
    source = info.source_dir.resolve()
    for doc_id in doc_ids:
        doc = by_id.get(doc_id)
        if doc is None:
            continue
        path = Path(doc["origin"]).resolve()
        if path.is_relative_to(source):
            path.unlink(missing_ok=True)
            kn.drop_file(path.relative_to(source).as_posix())


@router.delete("/{library_id}")
async def delete_library(library_id: str, request: Request):
    """Deleting a personal library also deletes the files uploaded to it."""
    library = request.app.state.personal_libraries.get(owner(request), library_id)
    run_id = request.app.state.jobs.keys.get(("import", MINE + library_id))
    if run_id and not request.app.state.jobs.tasks[run_id].done():
        request.app.state.jobs.tasks[run_id].cancel()  # its uploads are about to go
    request.app.state.personal_libraries.delete(owner(request), library_id)
    request.app.state.corpus_knowledge.pop(MINE + library_id, None)
    shutil.rmtree(uploads_info(request.app.state.settings, owner(request), library).root, ignore_errors=True)
    return {"deleted": library_id}


def safe_upload_name(name: str) -> str:
    name = Path(name.replace("\\", "/")).name.strip()
    if not name or name.startswith(".") or re.search(r'[<>:"|?*\x00-\x1f]', name):
        raise HTTPException(422, "文件名非法")
    if Path(name).suffix.lower() not in SOURCE_SUFFIXES:
        raise HTTPException(415, "只支持 PDF、Word（.docx）、Markdown 和 TXT 文件")
    return name


def source_files(info: CorpusInfo) -> dict[str, Path]:
    """Uploaded files by name, oldest first (the order they are parsed in); unfinished writes excluded."""
    if not info.source_dir.is_dir():
        return {}
    files = [path for path in info.source_dir.iterdir() if path.is_file() and not path.name.startswith(".")]
    return {path.name: path for path in sorted(files, key=lambda path: path.stat().st_mtime_ns)}


def manifest(app, info: CorpusInfo) -> dict[str, dict]:
    return app.state.corpus_ctx.knowledge_for(info).files() if info.sqlite is not None else {}


def upload_states(app, info: CorpusInfo, busy: bool) -> list[dict]:
    """Files not (yet) in the library: ``queued`` and ``parsing`` while the queue runs, ``failed`` with
    the parser's reason. A failed file stays until the owner removes it, so it is not parsed again."""
    files = manifest(app, info)
    states, first = [], True
    for name in source_files(info):
        entry = files.get(name)
        if entry and entry["status"] == "error":
            states.append({"name": name, "state": "failed", "error": entry["last_error"] or "解析失败"})
        elif not entry:
            states.append({"name": name, "state": "parsing" if busy and first else "queued", "error": ""})
            first = False
    return states


def start_queue(app, owner_: str, library_id: str) -> None:
    """Parse this library's waiting uploads one at a time (sharing the import lock with the system
    libraries, so one MinerU runs at a time), adding each to the library as soon as it is indexed.
    If a run is already going it picks the new file up; one that has just finished checks again."""
    store = app.state.personal_libraries
    info = uploads_info(app.state.settings, owner_, store.get(owner_, library_id))
    jobs = app.state.jobs

    async def work(progress, report):
        done = failed = 0
        while True:
            library = await asyncio.to_thread(store.get, owner_, library_id)
            current = uploads_info(app.state.settings, owner_, library)
            kn = app.state.corpus_ctx.knowledge_for(current)
            files = await asyncio.to_thread(kn.files)
            waiting = [(name, path) for name, path in (await asyncio.to_thread(source_files, current)).items() if name not in files]
            if not waiting:
                return {"status": "done", "completed": done, "failed": failed}
            name, path = waiting[0]
            report(current=name)
            async with app.state.import_lock:
                outcome = await asyncio.to_thread(import_one, kn, app.state.settings, path, name, None,
                                                  parsed_root=current.root / "parsed")
            if isinstance(outcome, Exception):
                failed += 1
                continue
            done += 1
            await asyncio.to_thread(add_ref, store, owner_, library_id, Ref(corpus_id=current.id, doc_id=outcome["doc_id"], title=name))

    run_id = jobs.keys.get(("import", info.id))
    if run_id and not jobs.tasks[run_id].done():
        jobs.tasks[run_id].add_done_callback(lambda _: again(app, owner_, library_id))
        return
    try:
        jobs.start("import", info.id, work, {"status": "running", "completed": 0, "failed": 0})
    except JobBusy:
        pass


def again(app, owner_: str, library_id: str) -> None:
    store = app.state.personal_libraries
    if store.owner_of(library_id) != owner_:
        return  # deleted meanwhile
    info = uploads_info(app.state.settings, owner_, store.get(owner_, library_id))
    files = manifest(app, info)
    if any(name not in files for name in source_files(info)):
        start_queue(app, owner_, library_id)


def add_ref(store, owner_: str, library_id: str, ref: Ref) -> None:
    for _ in range(5):  # the library may change in another tab meanwhile
        library = store.get(owner_, library_id)
        try:
            store.change(owner_, library_id, LibraryChange(revision=library["revision"], add=[ref]))
            return
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
    raise RuntimeError("个人资料库持续在别处修改，上传的文件未能加入")


@router.post("/{library_id}/files", status_code=202)
async def upload_file(library_id: str, request: Request, upload: UploadFile = File(...)):
    """Upload one file into a personal library. It is saved under the owner's workspace and queued;
    parsing runs in the background and adds it to the library when done (``uploads`` on the library
    shows where it is). A file with the same name is refused rather than replaced."""
    store = request.app.state.personal_libraries
    library = await asyncio.to_thread(store.get, owner(request), library_id)
    name = safe_upload_name(upload.filename or "")
    info = uploads_info(request.app.state.settings, owner(request), library)
    target = info.source_dir / name

    def save() -> None:
        info.source_dir.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".upload-", dir=info.source_dir)
        written = 0
        try:
            with os.fdopen(fd, "wb") as handle:
                while chunk := upload.file.read(1 << 20):
                    written += len(chunk)
                    if written > MAX_UPLOAD_BYTES:
                        raise ValueError("文件过大，单个文件不超过 200 MB")
                    handle.write(chunk)
            os.link(temporary, target)  # fails, rather than replacing, if the name is taken
        finally:
            Path(temporary).unlink(missing_ok=True)

    try:
        await asyncio.to_thread(save)
    except FileExistsError as exc:
        raise HTTPException(409, "这个资料库里已有同名文件，请改名后上传") from exc
    except ValueError as exc:
        raise HTTPException(413, str(exc)) from exc
    start_queue(request.app, owner(request), library_id)
    return {"name": name, "state": "queued"}


@router.delete("/{library_id}/files/{name}")
async def remove_failed_upload(library_id: str, name: str, request: Request):
    """Remove an uploaded file that failed to parse (an indexed one is removed with the library's PATCH)."""
    library = await asyncio.to_thread(request.app.state.personal_libraries.get, owner(request), library_id)
    info = uploads_info(request.app.state.settings, owner(request), library)
    entry = (await asyncio.to_thread(manifest, request.app, info)).get(name)
    path = info.source_dir / name
    if Path(name).name != name or entry is None or entry["status"] != "error" or not path.is_file():
        raise HTTPException(404, "没有这个解析失败的文件")
    async with request.app.state.import_lock:
        await asyncio.to_thread(path.unlink)
        await asyncio.to_thread(request.app.state.corpus_ctx.knowledge_for(info).drop_file, name)
    return {"removed": name}
