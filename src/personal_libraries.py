"""Personal libraries (D-20261027-1): an account's own named set of references to documents in the
system libraries. Nothing is copied or indexed; asking within one turns the references into the
usual library and document scope. Only the owner sees, changes or deletes a personal library."""

import json
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .agent.corpora import scan_corpora
from .core.db import connect, migrate
from .workspace import SCHEMA as WORKSPACE_SCHEMA  # one schema for the shared workspace.sqlite3

router = APIRouter(prefix="/api/personal-libraries")

MAX_REFS = 2000


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

    def delete(self, owner: str, library_id: str) -> None:
        with connect(self.path) as db:
            if not db.execute("DELETE FROM personal_libraries WHERE id=? AND owner=?", (library_id, owner)).rowcount:
                raise HTTPException(404, "个人资料库不存在")


def owner(request: Request) -> str:
    return request.state.user[0]


def known_libraries(request: Request) -> dict[str, bool]:
    """System library id → whether its folder is missing."""
    return {info.id: info.missing for info in scan_corpora(request.app.state.settings)}


def with_status(library: dict, known: dict[str, bool]) -> dict:
    """Each reference says whether its system library is still there; the document itself is checked
    by the page, which reads that library's document list anyway."""
    refs = [{**ref, "library_missing": known.get(ref["corpus_id"], True)} for ref in library["refs"]]
    return {**library, "refs": refs, "corpus_ids": list(dict.fromkeys(ref["corpus_id"] for ref in library["refs"]))}


@router.get("")
def list_libraries(request: Request):
    """The signed-in account's personal libraries, newest first, without their references."""
    return [{**{k: v for k, v in library.items() if k != "refs"}, "count": len(library["refs"]),
             "corpus_ids": list(dict.fromkeys(ref["corpus_id"] for ref in library["refs"]))}
            for library in request.app.state.personal_libraries.list(owner(request))]


@router.post("", status_code=201)
def create_library(payload: LibraryCreate, request: Request):
    known = known_libraries(request)
    if any(ref.corpus_id not in known for ref in payload.refs):
        raise HTTPException(422, "引用的系统资料库不存在")
    return with_status(request.app.state.personal_libraries.create(owner(request), payload), known)


@router.get("/{library_id}")
def read_library(library_id: str, request: Request):
    return with_status(request.app.state.personal_libraries.get(owner(request), library_id), known_libraries(request))


@router.patch("/{library_id}")
def change_library(library_id: str, change: LibraryChange, request: Request):
    known = known_libraries(request)
    if any(ref.corpus_id not in known for ref in change.add):
        raise HTTPException(422, "引用的系统资料库不存在")
    return with_status(request.app.state.personal_libraries.change(owner(request), library_id, change), known)


@router.delete("/{library_id}")
def delete_library(library_id: str, request: Request):
    request.app.state.personal_libraries.delete(owner(request), library_id)
    return {"deleted": library_id}
