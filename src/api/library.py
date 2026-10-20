"""Libraries, their files and documents."""

import asyncio
import os
import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse

from ..agent.corpora import (
    DB_DIRNAME,
    SOURCE_DIRNAME,
    SOURCE_SUFFIXES,
    VECTOR_DIRNAME,
    CorpusInfo,
    corpus_id_for,
    corpus_root_for,
    load_corpus_overrides,
    rewrite_origins,
    save_corpus_overrides,
    scan_corpora,
    valid_corpus_name,
)
from ..auth import ADMIN_ONLY
from ..jobs import JobBusy
from ..parsers import collect_sources, import_defaults, unsafe_name
from ..targets import (
    TargetMissing,
    TargetStale,
    extract_target,
    list_target_reports,
    remove_target,
    target_detail,
)
from .common import (
    FILE_MEDIA_TYPES,
    MAX_PREVIEW_BYTES,
    CorpusCreate,
    CorpusDescription,
    CorpusReassociate,
    CorpusRename,
    FileRename,
    TargetExtractRequest,
    duplicate_sources,
    local_path_in_roots,
    logger,
)


def install(app, ctx):
    find_corpus = ctx.find_corpus
    knowledge_for = ctx.knowledge_for
    knowledge_for_request = ctx.knowledge_for_request
    settings = ctx.settings
    router = APIRouter()

    def corpus_counts(info: CorpusInfo) -> dict:
        """KM-S2: lightweight file counts for the overview card (read-only, never parses).

        ``indexed_count`` is the searchable document count; ``source_count`` is what currently
        sits in ``source/``. A source file is pending when the manifest has not indexed it (new or
        removed); a manifest parse error is counted separately so the card can distinguish the two.
        """
        if info.missing or not info.source_dir.is_dir():
            on_disk: dict[str, Path] = {}
        else:
            on_disk = {path.relative_to(info.source_dir).as_posix(): path
                       for path in collect_sources(info.source_dir)}
        manifest = knowledge_for(info).files() if info.sqlite is not None else {}
        current_ids = {doc["doc_id"] for doc in knowledge_for(info).current()} if info.sqlite is not None else set()
        failed = sum(1 for rel in on_disk if manifest.get(rel, {}).get("status") == "error")
        on_disk_indexed = sum(1 for rel in on_disk if manifest.get(rel, {}).get("doc_id") in current_ids)
        removed = sum(1 for rel in manifest if rel not in on_disk)
        return {
            "source_count": len(on_disk),
            "indexed_count": len(current_ids),
            "pending_count": len(on_disk) - on_disk_indexed - failed + removed,
            "failed_count": failed,
        }

    def corpus_payload(info: CorpusInfo) -> dict:
        counts = corpus_counts(info)
        dense = None
        if info.sqlite and info.sqlite.resolve() == app.state.knowledge.path.resolve():
            dense = app.state.knowledge.dense
        else:
            cached_knowledge = app.state.corpus_knowledge.get(info.id)
            if cached_knowledge:
                dense = cached_knowledge.dense
        return {
            "id": info.id,
            "name": info.name,
            "kind": info.kind,
            "domain": info.domain,
            "rel_path": info.rel_path,
            "docs_count": info.docs_count,
            "preparation": "ready" if counts["indexed_count"] else "empty",
            "is_default": info.is_default,
            "alias": info.alias,
            "dir_name": info.dir_name or info.root.name,
            "description": info.description,
            "missing": info.missing,
            "index_progress": dense.progress if dense else None,
            "job": app.state.jobs.latest("import", info.id),
            **counts,
        }

    @router.get("/api/corpora/route")
    async def route_corpus(q: str = Query(min_length=1, max_length=2000)):
        """query 2026-1013 1520: libraries ranked by how well their own terms match a question."""
        from ..corpus_route import rank
        items = await asyncio.to_thread(scan_corpora, settings)
        return await asyncio.to_thread(rank, q, items)

    @router.get("/api/corpora")
    async def corpora():
        """H1: corpus registry — disk scan + config/override names, read-only."""
        items = await asyncio.to_thread(scan_corpora, settings)
        # KM-S2: file counts read the source dir + manifest, so keep them off the event loop.
        return await asyncio.to_thread(lambda: [corpus_payload(info) for info in items])

    @router.post("/api/corpora", status_code=201)
    async def create_corpus(payload: CorpusCreate):
        """K6: create a new self-contained corpus directory (source/datadb/vectordb)."""
        name = payload.name.strip()
        root = corpus_root_for(settings)
        target = (root / name).resolve()
        if not valid_corpus_name(name) or not target.is_relative_to(root.resolve()):
            raise HTTPException(422, "知识库名称非法")
        if target.exists():
            raise HTTPException(409, "同名知识库已存在")
        def create_dirs():
            for role in (SOURCE_DIRNAME, DB_DIRNAME, VECTOR_DIRNAME):
                (target / role).mkdir(parents=True, exist_ok=True)
            corpus_id = corpus_id_for(name)
            overrides = load_corpus_overrides(settings)
            overrides[corpus_id] = {"id": corpus_id, "rel": name, "alias": "", "created": True}
            save_corpus_overrides(settings, overrides)

        await asyncio.to_thread(create_dirs)
        items = await asyncio.to_thread(scan_corpora, settings)
        info = next((item for item in items if item.rel_path == name), None)
        if info is None:
            raise HTTPException(500, "知识库创建后未能扫描到")
        return corpus_payload(info)

    @router.patch("/api/corpora/{corpus_id}")
    async def rename_corpus(request: Request, payload: CorpusRename, corpus_id: str):
        """KB-5b: rename syncs ``.knowledge/<dir>``; stable corpus_id and doc ids are kept."""
        name = payload.name.strip()
        if not valid_corpus_name(name):
            raise HTTPException(422, "知识库名称非法")
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        if info.missing:
            raise HTTPException(409, "目录缺失的知识库不能重命名")
        if info.root.name == name:
            return corpus_payload(info)
        root = corpus_root_for(settings)
        target = (root / name).resolve()
        same_case_directory = info.root.name.lower() == name.lower()
        if not target.is_relative_to(root) or (target.exists() and not same_case_directory):
            raise HTTPException(409, "同名知识库已存在")
        if request.app.state.jobs.busy("import", corpus_id) or request.app.state.import_lock.locked():
            raise HTTPException(409, "知识库正在上传或导入，暂不能重命名")
        old = info.root

        def do_rename():
            if old.name.lower() == name.lower():
                # Case-only rename: two-step so a case-insensitive FS does not see a conflict (T5).
                temp = root / (".rename-" + uuid4().hex)
                try:
                    os.rename(old, temp)
                    os.rename(temp, target)
                except Exception:
                    if temp.exists() and not old.exists():
                        os.rename(temp, old)
                    raise
            else:
                os.rename(old, target)
            origins_updated = False
            try:
                # T1/T2: rewrite file-type origins but keep doc ids; DB write is transactional.
                rewrite_origins(target / DB_DIRNAME / "knowledge.sqlite3", old, target, [])
                origins_updated = True
                overrides = load_corpus_overrides(settings)
                entry = overrides.get(corpus_id, {})
                overrides[corpus_id] = {**entry, "id": corpus_id, "rel": name}
                save_corpus_overrides(settings, overrides)
            except Exception:
                # The directory move and origin rewrite form one visible operation. Restore
                # both before returning an error if registry persistence fails.
                if origins_updated:
                    rewrite_origins(target / DB_DIRNAME / "knowledge.sqlite3", target, old, [])
                os.rename(target, old)
                raise

        if request.app.state.import_lock.locked():
            raise HTTPException(409, "知识库正在上传或导入，暂不能重命名")
        await request.app.state.import_lock.acquire()
        try:
            await asyncio.to_thread(do_rename)
        finally:
            request.app.state.import_lock.release()
        app.state.corpus_knowledge.pop(corpus_id, None)
        items = await asyncio.to_thread(scan_corpora, settings)
        return corpus_payload(next(item for item in items if item.id == corpus_id))

    @router.put("/api/corpora/{corpus_id}/description")
    async def set_corpus_description(request: Request, corpus_id: str, payload: CorpusDescription):
        """W2: user-editable short note, separate from the directory name (which stays canonical)."""
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        if info.missing:
            raise HTTPException(409, "目录缺失的知识库不能编辑说明")
        if request.app.state.import_lock.locked():
            raise HTTPException(409, "知识库正在上传或导入，暂不能修改说明")

        def save():
            overrides = load_corpus_overrides(settings)
            entry = {**overrides.get(corpus_id, {}), "id": corpus_id, "rel": info.rel_path}
            description = payload.description.strip()
            if description:
                entry["description"] = description
            else:
                entry.pop("description", None)
            overrides[corpus_id] = entry
            save_corpus_overrides(settings, overrides)

        await asyncio.to_thread(save)
        items = await asyncio.to_thread(scan_corpora, settings)
        return corpus_payload(next(item for item in items if item.id == corpus_id))

    @router.delete("/api/corpora/{corpus_id}")
    async def delete_corpus(corpus_id: str, purge_source: bool = False):
        """K6: delete derived data by default; ``purge_source=true`` also removes source files."""
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        if (app.state.jobs.busy("import", corpus_id) or app.state.jobs.busy("target", corpus_id)
                or app.state.import_lock.locked()):
            raise HTTPException(409, "知识库正在上传或导入，暂不能删除")
        def remove():
            if not info.missing:
                if purge_source:
                    shutil.rmtree(info.root, ignore_errors=True)
                else:
                    shutil.rmtree(info.db_dir, ignore_errors=True)
                    shutil.rmtree(info.vectordb_dir, ignore_errors=True)
                    shutil.rmtree(info.root / "target", ignore_errors=True)
                    if info.root.exists() and not any(info.root.iterdir()):
                        shutil.rmtree(info.root, ignore_errors=True)
            overrides = load_corpus_overrides(settings)
            if corpus_id in overrides and (info.missing or purge_source):
                overrides.pop(corpus_id)
                save_corpus_overrides(settings, overrides)

        if app.state.import_lock.locked():
            raise HTTPException(409, "知识库正在上传或导入，暂不能删除")
        await app.state.import_lock.acquire()
        try:
            await asyncio.to_thread(remove)
        finally:
            app.state.import_lock.release()
        app.state.corpus_knowledge.pop(corpus_id, None)
        return {"deleted": corpus_id, "purged_source": purge_source}

    @router.post("/api/corpora/{corpus_id}/reassociate", dependencies=ADMIN_ONLY)
    async def reassociate_corpus(request: Request, corpus_id: str, payload: CorpusReassociate):
        """Explicitly reconnect a missing stable corpus id to an unclaimed directory."""
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        if not info.missing:
            raise HTTPException(409, "该知识库目录仍存在，无需重新关联")
        directory = payload.directory.strip()
        if not valid_corpus_name(directory):
            raise HTTPException(422, "目标目录名称非法")
        root = corpus_root_for(settings)
        target_path = root / directory
        if target_path.is_symlink():
            raise HTTPException(422, "不能关联符号链接目录")
        target = target_path.resolve()
        if not target.is_relative_to(root) or not target.is_dir():
            raise HTTPException(404, "所选目录不存在或不在知识库根目录")
        candidates = await asyncio.to_thread(scan_corpora, settings)
        target_info = next((item for item in candidates if item.rel_path == directory and not item.missing), None)
        if target_info is None:
            raise HTTPException(404, "刷新后未找到所选目录")
        overrides = await asyncio.to_thread(load_corpus_overrides, settings)
        owner = next(((owner_id, entry) for owner_id, entry in overrides.items()
                      if owner_id != corpus_id and entry.get("rel") == directory), None)
        generated_owner = bool(owner and owner[0] == corpus_id_for(directory)
                               and owner[1].get("generated") and not owner[1].get("created"))
        configured = any(str(entry.get("path", "")).strip("/") == directory for entry in settings.corpora or [])
        if (owner and not generated_owner) or configured:
            raise HTTPException(409, "所选目录已归属于另一个知识库，请选择未关联的目录")
        if (request.app.state.jobs.busy("import", corpus_id) or request.app.state.jobs.busy("import", target_info.id)
                or request.app.state.import_lock.locked()):
            raise HTTPException(409, "知识库正在上传或导入，暂不能重新关联")

        def save_reassociation():
            previous = overrides.get(corpus_id, {})
            new_overrides = dict(overrides)
            if generated_owner and owner:
                new_overrides.pop(owner[0], None)
            new_overrides[corpus_id] = {**previous, "id": corpus_id, "rel": directory}
            db_path = target / DB_DIRNAME / "knowledge.sqlite3"
            origins_updated = False
            if db_path.is_file():
                rewrite_origins(db_path, info.root, target, [])
                origins_updated = True
            try:
                save_corpus_overrides(settings, new_overrides)
            except Exception:
                if origins_updated:
                    rewrite_origins(db_path, target, info.root, [])
                raise

        if request.app.state.import_lock.locked():
            raise HTTPException(409, "知识库正在上传或导入，暂不能重新关联")
        await request.app.state.import_lock.acquire()
        try:
            await asyncio.to_thread(save_reassociation)
        finally:
            request.app.state.import_lock.release()
        if target_info.id != corpus_id:
            app.state.corpus_knowledge.pop(target_info.id, None)
        app.state.corpus_knowledge.pop(corpus_id, None)
        refreshed = await asyncio.to_thread(scan_corpora, settings)
        return corpus_payload(next(item for item in refreshed if item.id == corpus_id))

    @router.post("/api/corpora/{corpus_id}/ingest", status_code=202)
    async def corpus_ingest(request: Request, corpus_id: str, force: bool = False):
        """H2/K13: import one corpus; ``force`` re-parses everything (e.g. after a parser change)."""
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        if info.missing:
            raise HTTPException(409, "知识库目录已缺失，刷新和入库前请先重新关联或移除失效记录")
        if request.app.state.jobs.busy("import", corpus_id):
            raise HTTPException(409, "该知识库正在导入")
        # An explicit refresh may initialize source/; ordinary GET requests never do.
        try:
            await asyncio.to_thread(info.source_dir.mkdir, parents=True, exist_ok=True)
        except OSError as exc:
            raise HTTPException(409, "资料目录不可访问，未修改现有索引") from exc
        job = {"status": "running", "total": 0, "completed": 0, "imported": 0, "changed": 0,
               "added": 0, "updated": 0, "skipped": 0, "deleted": 0, "forced": force, "errors": []}

        # A persisted run (card B1): a restart leaves it “interrupted” rather than forgotten.
        async def run(job, report):
            async with request.app.state.import_lock:
                kn = knowledge_for(info)
                result = await asyncio.to_thread(import_defaults, kn, settings, root=info.source_dir,
                                                 force=force, parsed_root=info.root / "parsed")
            return {"total": result["scanned"], "completed": result["scanned"], "imported": len(result["imported"]),
                    "changed": result["added"] + result["updated"], "added": result["added"],
                    "updated": result["updated"], "skipped": result["skipped"], "deleted": result["deleted"],
                    "errors": result["errors"], "status": "partial" if result["errors"] else "done"}

        try:
            # On the event loop: start() schedules the work there (its two small writes are quick).
            return request.app.state.jobs.start("import", corpus_id, run, job, params={"force": force})
        except JobBusy as exc:
            raise HTTPException(409, "该知识库正在导入") from exc

    @router.get("/api/corpora/{corpus_id}/reports")
    async def target_reports(corpus_id: str):
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        if info.missing:
            raise HTTPException(409, "知识库目录已缺失")
        if info.sqlite is None:
            return []
        return await asyncio.to_thread(list_target_reports, info, knowledge_for(info))

    @router.get("/api/corpora/{corpus_id}/reports/{doc_id}/target")
    async def target_report_detail(corpus_id: str, doc_id: str):
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        if info.missing:
            raise HTTPException(409, "知识库目录已缺失")
        try:
            return await asyncio.to_thread(target_detail, info, knowledge_for(info), doc_id)
        except TargetMissing as exc:
            raise HTTPException(404, str(exc.args[0])) from exc
        except TargetStale as exc:
            raise HTTPException(409, {"stale": True, "message": str(exc)}) from exc

    @router.post("/api/corpora/{corpus_id}/target", dependencies=ADMIN_ONLY, status_code=202)
    async def target_extract(request: Request, corpus_id: str, payload: TargetExtractRequest):
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        if info.missing:
            raise HTTPException(409, "知识库目录已缺失")
        if request.app.state.jobs.busy("target", corpus_id):
            raise HTTPException(409, "该知识库正在生成四维信息")
        knowledge = knowledge_for(info)
        current_ids = {doc["doc_id"] for doc in await asyncio.to_thread(knowledge.current)}
        missing = [doc_id for doc_id in payload.doc_ids if doc_id not in current_ids]
        if missing:
            raise HTTPException(422, {"message": "所选资料已更新或不可用", "doc_ids": missing})
        job = {"corpus_id": corpus_id, "status": "running",
               "completed": 0, "total": len(payload.doc_ids), "errors": []}

        async def run_target_job(job, report):
            for doc_id in payload.doc_ids:
                try:
                    record = await extract_target(info, knowledge, settings, doc_id, force=payload.force)
                    if record["process"]["status"] == "已完成":
                        job["completed"] += 1
                    else:
                        job["errors"].append({"doc_id": doc_id,
                                              "error": record.get("error") or "四维提取未完成"})
                except (TargetMissing, TargetStale, ValueError) as exc:
                    job["errors"].append({"doc_id": doc_id, "error": str(exc)})
                except Exception as exc:
                    logger.exception("Target extraction failed for %s", doc_id)
                    job["errors"].append({"doc_id": doc_id, "error": type(exc).__name__})
                report(completed=job["completed"], errors=job["errors"])
            return {"status": "done" if not job["errors"] else "partial" if job["completed"] else "error"}

        try:
            return request.app.state.jobs.start("target", corpus_id, run_target_job, job,
                                                params={"doc_ids": payload.doc_ids, "force": payload.force})
        except JobBusy as exc:
            raise HTTPException(409, "该知识库正在生成四维信息") from exc

    @router.get("/api/corpora/{corpus_id}/target/jobs/{job_id}")
    async def target_job(corpus_id: str, job_id: str):
        job = await asyncio.to_thread(app.state.jobs.get, job_id, "target", corpus_id)
        if job is None:
            raise HTTPException(404, "四维提取任务不存在")
        return job

    def source_file(info: CorpusInfo, rel_path: str) -> Path:
        target = (info.source_dir / rel_path).resolve()
        if not target.is_relative_to(info.source_dir.resolve()) or not target.is_file():
            raise HTTPException(404, "文件不存在")
        return target

    def safe_file_name(name: str) -> str:
        name = Path(name or "").name.strip()
        if not name or name.startswith(".") or name in {".", ".."}:
            raise HTTPException(422, "文件名非法")
        if unsafe_name(name):  # F1
            raise HTTPException(422, '文件名含不允许的字符：" ` $ < > | * ? : \\ 或控制字符')
        if Path(name).suffix.lower() not in SOURCE_SUFFIXES:
            raise HTTPException(415, "仅支持 md/markdown/txt/pdf/docx")
        return name

    async def import_corpus(info: CorpusInfo, force: bool = False) -> dict:
        async with app.state.import_lock:
            return await asyncio.to_thread(import_defaults, knowledge_for(info), settings, root=info.source_dir,
                                           force=force, parsed_root=info.root / "parsed")

    @router.get("/api/corpora/{corpus_id}/search")
    async def search_corpus_files(corpus_id: str, q: str = Query(min_length=2, max_length=300)):
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None or info.missing:
            raise HTTPException(404, "资料库不存在或目录缺失")
        library = knowledge_for(info)
        def search():
            from rank_bm25 import BM25Plus

            from ..knowledge import tokens
            docs = library.current()
            current = {d["doc_id"]: d["version"] for d in docs}
            chunks = {d["doc_id"]: [] for d in docs}
            for row in library.chunk_rows():
                if current.get(row["doc_id"]) == row["version"]:
                    chunks[row["doc_id"]].append(row["text"])
            terms = set(tokens(q))
            corpus = [tokens(d["title"] + " " + " ".join(chunks[d["doc_id"]])) or ["_empty_"] for d in docs]
            if not docs or not terms:
                return {"hits": [], "limit": 100}
            scores = BM25Plus(corpus).get_scores(list(terms))
            ranked = sorted((i for i, words in enumerate(corpus) if terms.intersection(words)),
                            key=lambda i: (-scores[i], docs[i]["doc_id"]))[:100]
            # A file search must keep both the abstract and report of one project.
            # The research pipeline's project-level deduplication does not apply here.
            return {"hits": [{"doc_id": docs[i]["doc_id"], "version": docs[i]["version"],
                              "snippet": max(chunks[docs[i]["doc_id"]], key=lambda text: len(terms.intersection(tokens(text))),
                                             default=docs[i]["title"])[:400]} for i in ranked], "limit": 100}
        return await asyncio.to_thread(search)

    @router.get("/api/corpora/{corpus_id}/files")
    async def corpus_files(corpus_id: str):
        """Read source file status without creating an index database."""
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        if info.missing:
            raise HTTPException(409, "知识库目录已缺失")
        manifest = await asyncio.to_thread(knowledge_for(info).files) if info.sqlite is not None else {}
        current_ids = ({doc["doc_id"] for doc in await asyncio.to_thread(knowledge_for(info).current)}
                       if info.sqlite is not None else set())

        copies = duplicate_sources(manifest)

        def listing():
            on_disk = {path.relative_to(info.source_dir).as_posix(): path
                       for path in collect_sources(info.source_dir)} if info.source_dir.is_dir() else {}
            items = []
            for rel, path in sorted(on_disk.items()):
                entry = manifest.get(rel)
                status = ("pending" if entry and entry["status"] == "indexed"
                          and entry["doc_id"] not in current_ids else entry["status"] if entry else "new")
                items.append({"rel_path": rel, "size": path.stat().st_size,
                              "status": status, "doc_id": entry["doc_id"] if entry else None,
                              "reason": entry["last_error"] if entry and status == "error" else
                              "源文件已变化，请刷新" if status == "pending" else "",
                              "duplicate_of": copies.get(rel, "")})
            for rel, entry in sorted(manifest.items()):
                if rel not in on_disk:
                    items.append({"rel_path": rel, "size": entry["size"], "status": "removed", "doc_id": entry["doc_id"]})
            misplaced = sorted(path.name for path in info.root.iterdir()
                               if path.is_file() and not path.is_symlink()
                               and path.suffix.lower() in SOURCE_SUFFIXES)
            return items, misplaced

        files, misplaced = await asyncio.to_thread(listing)
        return {"source_dir": str(info.source_dir), "files": files, "misplaced_files": misplaced}

    @router.post("/api/corpora/{corpus_id}/files", status_code=201)
    async def upload_corpus_file(corpus_id: str, upload: UploadFile = File(...), relative_path: str | None = None):
        """K7: stream an md/pdf/txt into ``source/`` then import incrementally."""
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        name = safe_file_name(upload.filename or "")
        if relative_path is not None:
            parts = relative_path.replace("\\", "/").split("/")
            if any(not part or part in (".", "..") or part.startswith(".") or unsafe_name(part) for part in parts):
                raise HTTPException(422, "文件夹路径非法")
            if parts[-1] != name:
                raise HTTPException(422, "文件名与文件夹路径不一致")
            name = "/".join(parts)
        target = (info.source_dir / name).resolve()
        if not target.is_relative_to(info.source_dir.resolve()):
            raise HTTPException(422, "文件名非法")

        def save() -> None:
            target.parent.mkdir(parents=True, exist_ok=True)
            written = 0
            temporary: Path | None = None
            try:
                fd, temp_name = tempfile.mkstemp(prefix=".upload-", dir=info.source_dir)
                temporary = Path(temp_name)
                with os.fdopen(fd, "wb") as handle:
                    while True:
                        chunk = upload.file.read(1 << 20)
                        if not chunk:
                            break
                        written += len(chunk)
                        if written > MAX_PREVIEW_BYTES:
                            raise ValueError("文件过大，超过预览/上传上限")
                        handle.write(chunk)
                    handle.flush()
                    os.fsync(handle.fileno())
                # Hard-link publication is atomic and fails if another upload created
                # the destination; unlike replace(), it can never truncate an old file.
                os.link(temporary, target)
            except FileExistsError as exc:
                raise FileExistsError("同名文件已存在，请改名后上传") from exc
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)

        # Keep conflict check/publication and import serialized with other source
        # mutations; use the existing lock rather than introducing another queue.
        async with app.state.import_lock:
            try:
                await asyncio.to_thread(save)
            except FileExistsError as exc:
                raise HTTPException(409, str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(413, str(exc)) from exc
            report = await asyncio.to_thread(import_defaults, knowledge_for(info), settings,
                                              root=info.source_dir, parsed_root=info.root / "parsed")
        # The import covers the whole folder; report only this file's errors, or a file uploaded after a
        # broken one is shown as failed although it was indexed (query 2026-1016 1814 baseline walk).
        own = [error for error in report["errors"] if error.get("source") == Path(name).name]
        copies = duplicate_sources(await asyncio.to_thread(knowledge_for(info).files))
        return {"rel_path": name, "added": report["added"], "updated": report["updated"],
                "skipped": report["skipped"], "deleted": report["deleted"], "errors": own,
                "duplicate_of": copies.get(name, "")}

    @router.delete("/api/corpora/{corpus_id}/files")
    async def delete_corpus_file(corpus_id: str, rel_path: str):
        """K7: remove a source file and its indexed document."""
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        target = await asyncio.to_thread(source_file, info, rel_path)
        await asyncio.to_thread(target.unlink)
        doc_id = await asyncio.to_thread(knowledge_for(info).drop_file, rel_path)
        await asyncio.to_thread(remove_target, info, doc_id)
        return {"rel_path": rel_path, "doc_id": doc_id}

    @router.patch("/api/corpora/{corpus_id}/files")
    async def rename_corpus_file(corpus_id: str, payload: FileRename):
        """K7: rename a source file and re-index under the new path."""
        info = await asyncio.to_thread(find_corpus, corpus_id)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        old = await asyncio.to_thread(source_file, info, payload.rel_path)
        new_name = safe_file_name(payload.new_name)
        new = (old.parent / new_name).resolve()
        if not new.is_relative_to(info.source_dir.resolve()):
            raise HTTPException(422, "文件名非法")
        if new.exists():
            raise HTTPException(409, "同名文件已存在")
        await asyncio.to_thread(old.rename, new)
        await asyncio.to_thread(knowledge_for(info).drop_file, payload.rel_path)
        report = await import_corpus(info)
        return {"rel_path": new.relative_to(info.source_dir.resolve()).as_posix(), "added": report["added"], "updated": report["updated"],
                "skipped": report["skipped"], "deleted": report["deleted"], "errors": report["errors"]}

    @router.get("/api/documents")
    async def documents(request: Request, corpus: str | None = None):
        # No query parameter is a legacy alias for the same current first corpus.
        if corpus is None:
            kn = await knowledge_for_request(None)
        else:
            info = await asyncio.to_thread(find_corpus, corpus)
            if info is None:
                raise HTTPException(404, "知识库不存在")
            if info.missing:
                raise HTTPException(409, "该知识库目录已缺失")
            kn = knowledge_for(info) if info.sqlite is not None else None
            if kn is None:
                return []  # Read-only listing never creates a database for an empty corpus.
        docs = await asyncio.to_thread(kn.current)
        # D1: additive fields only. `status` is always "indexed" because this list is the corpus;
        # `meta` stays empty until stage B adds report metadata (B2/B3), so the frontend tree
        # can already be built from `rel_path` without a second endpoint.
        enriched = []
        for doc in docs:
            local = local_path_in_roots(doc["origin"], settings)
            enriched.append(
                {k: v for k, v in doc.items() if k not in ("pages", "page_count")}
                | {
                    "pages": doc["page_count"],
                    "rel_path": local[1] if local else "",
                    "status": "indexed",
                    "meta": {},
                }
            )
        return enriched

    async def resolve_document_file(request: Request, doc_id: str, version: str | None, corpus: str | None):
        kn = await knowledge_for_request(corpus)
        try:
            doc = await asyncio.to_thread(kn.get, doc_id)
        except KeyError as exc:
            raise HTTPException(404, "文档不存在") from exc
        if version and version != doc["version"]:
            raise HTTPException(422, "文档已更新，请重新搜索")
        if doc_id not in {item["doc_id"] for item in await asyncio.to_thread(kn.current)}:
            raise HTTPException(409, "原文件已变化或不可用，旧版本原文无法预览")
        resolved = local_path_in_roots(doc["origin"], settings)
        path = resolved[0] if resolved else None
        if path is None or not path.is_file():
            raise HTTPException(404, "该文档不是报告根目录内的本地文件，或原文已被移动")
        media_type = FILE_MEDIA_TYPES.get(path.suffix.lower())
        if media_type is None:
            raise HTTPException(415, "该文件类型不支持网页预览")
        if path.stat().st_size > MAX_PREVIEW_BYTES:
            raise HTTPException(413, "文件过大，无法在网页内预览")
        return path, media_type

    @router.head("/api/documents/{doc_id}/file")
    async def document_file_head(request: Request, doc_id: str, version: str | None = None, corpus: str | None = None):
        """Check preview availability without transferring the source file."""
        path, media_type = await resolve_document_file(request, doc_id, version, corpus)
        return Response(status_code=200, headers={"Content-Type": media_type, "Content-Length": str(path.stat().st_size)})

    @router.get("/api/documents/{doc_id}/file")
    async def document_file(request: Request, doc_id: str, version: str | None = None, corpus: str | None = None):
        """D2: raw PDF/Markdown/txt for the browser reader; Range is handled by FileResponse."""
        # Inline so the raw reader (iframe/PDF viewer) renders instead of downloading.
        path, media_type = await resolve_document_file(request, doc_id, version, corpus)
        return FileResponse(path, media_type=media_type, filename=path.name, content_disposition_type="inline")

    @router.get("/api/documents/{doc_id}/markdown")
    async def document_markdown(request: Request, doc_id: str, version: str | None = None, corpus: str | None = None):
        """L1: parsed markdown body for rendering previews — no 300-char line splits or line windows."""
        kn = await knowledge_for_request(corpus)
        try:
            doc = await asyncio.to_thread(kn.get, doc_id)
        except KeyError as exc:
            raise HTTPException(404, "文档不存在") from exc
        if version and version != doc["version"]:
            raise HTTPException(422, "文档已更新，请重新搜索")
        text = await asyncio.to_thread(kn.read_markdown, doc_id)
        return {"text": text, "version": doc["version"]}

    @router.get("/api/documents/{doc_id}")
    async def read_document(
        request: Request, doc_id: str, page: int = 1, start_line: int = 1, version: str | None = None,
        section: bool = False, corpus: str | None = None,
    ):
        kn = await knowledge_for_request(corpus)
        try:
            return await asyncio.to_thread(
                (kn.read_section if section else kn.read), doc_id, page, start_line, 60, version
            )
        except KeyError as exc:
            raise HTTPException(404, "文档不存在") from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    app.include_router(router)
