"""One FastAPI entrypoint for corpus ingestion, evidence and agent streaming."""

import asyncio
import re
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from .agent.config import DOX_AGENT_ROOT, get_settings
from .agent.corpora import (
    CorpusInfo,
    default_corpus_info,
    scan_corpora,
)
from .agent.graph import build_graph
from .api import assets as api_assets
from .api import chat as api_chat
from .api import domains as api_domains
from .api import library as api_library
from .api import reports as api_reports
from .api import structure as api_structure
from .api import system as api_system
from .api import web as api_web
from .api.common import (
    logger,
    workspace_path,
)
from .artifacts import ArtifactStore
from .corpus_groups import GroupStore
from .corpus_groups import router as corpus_groups_router
from .custom_tasks import (
    CustomTaskStore,
)
from .custom_templates import (
    TemplateStore,
)
from .intelligence import router as intelligence_router
from .jobs import Jobs
from .knowledge import Knowledge
from .project_index import IndexPreparing, ProjectIndex
from .project_similarity import ProjectSimilarity
from .prompt_skills import (
    PromptSkillStore,
)
from .review.routes import init_storage as review_init_storage
from .review.routes import router as review_router
from .runs import RunStore
from .web_snapshots import WebSnapshotStore
from .workspace import Workspace
from .workspace import router as workspace_router


def create_app(settings=None, knowledge=None, graph_factory=build_graph):
    settings = settings or get_settings()


    @asynccontextmanager
    async def lifespan(app):
        old_files = [settings.state_dir / name for name in ("artifacts.sqlite3", "reports.sqlite3", "custom_templates.sqlite3")]
        if (any(path.exists() for path in old_files) or (settings.state_dir / ".migration-stage").exists()) and not (settings.state_dir / "artifacts" / "migration.complete").exists():
            raise RuntimeError("报告中心数据需要离线迁移。停止服务后运行 python -m src.artifact_migration --state-dir <STATE_DIR> --backup-dir <独立备份目录> --service-stopped")
        info = await asyncio.to_thread(default_corpus_info, settings)
        db_path = info.db_dir / "knowledge.sqlite3" if info else Path(settings.state_dir) / "knowledge.sqlite3"
        app.state.knowledge = knowledge or Knowledge(
            db_path, settings=settings, vectordb_dir=info.vectordb_dir if info else None,
            source_root=info.source_dir if info else None)
        if knowledge is not None and info is not None:
            app.state.knowledge.source_root = info.source_dir
        app.state.settings = settings
        app.state.corpus_groups = GroupStore(settings.state_dir / "workspace.sqlite3")
        app.state.workspace = Workspace(workspace_path(settings, app.state.knowledge))
        app.state.knowledge.workspace = app.state.workspace
        # W3-A: run snapshots live with the other application-level state.
        app.state.runs = RunStore(settings.state_dir / "runs.sqlite3")
        app.state.custom_tasks = CustomTaskStore(settings.state_dir / "custom_tasks.sqlite3")
        app.state.prompt_skills = PromptSkillStore(settings.state_dir / "prompt_skills.sqlite3")
        app.state.custom_templates = TemplateStore(settings.state_dir / "artifacts" / "templates.sqlite3")
        # W3-B: first-class artifacts (answer snapshots + reports) in application state.
        app.state.project_index = ProjectIndex(settings.state_dir / "project_index.sqlite3")
        app.state.similarity = ProjectSimilarity(settings.state_dir / "project_index.sqlite3", settings)
        app.state.artifacts = ArtifactStore(settings.state_dir / "artifacts" / "artifacts.sqlite3")
        for interrupted in app.state.artifacts.recover_interrupted():
            try: app.state.runs.update(interrupted, status="failed", ended_at=datetime.now(UTC).isoformat())
            except KeyError: pass
        await asyncio.to_thread(app.state.artifacts.purge_expired)
        async def clean_artifacts():
            while True:
                await asyncio.sleep(3600)
                try: await asyncio.to_thread(app.state.artifacts.purge_expired)
                except Exception: logger.exception("artifact expiry cleanup failed")
        cleanup_task = asyncio.create_task(clean_artifacts())
        app.state.web_snapshots = WebSnapshotStore(settings.state_dir / "web_snapshots.sqlite3")
        # W8: review storage with material isolation + interrupted-run recovery.
        review_init_storage(settings.state_dir / "review")
        app.state.import_lock = asyncio.Lock()
        app.state.previews = {}
        app.state.searches = {}
        # H1/H2: per-corpus Knowledge cache (default corpus reuses app.state.knowledge),
        # ingest job states and their tasks.
        app.state.corpus_knowledge = {}
        app.state.jobs = Jobs(app.state.runs)
        app.state.jobs.recover()
        loop = asyncio.get_running_loop()

        def start_index(info, kn):
            # Local busy is only a queue optimisation. refresh() owns a shared, expiring lease.
            if app.state.jobs.busy("index", info.id):
                return

            async def rebuild(progress, report):
                worker = asyncio.create_task(asyncio.to_thread(app.state.project_index.refresh, info, kn))
                try:
                    revision = await asyncio.shield(worker)
                except asyncio.CancelledError:
                    # Let a synchronous publication finish/release its lease before closing stores.
                    await worker
                    raise
                return {"status": "done", "revision": revision}

            app.state.jobs.start("index", info.id, rebuild, {"status": "running"})

        app.state.project_index.schedule = lambda info, kn: loop.call_soon_threadsafe(start_index, info, kn)

        async def prepare_indexes():
            for corpus in await asyncio.to_thread(scan_corpora, settings):
                if not corpus.missing and corpus.sqlite is not None:
                    try:
                        kn = await asyncio.to_thread(knowledge_for, corpus)
                        app.state.project_index.request_refresh(corpus, kn)
                    except Exception:
                        logger.exception("project index preparation failed for %s", corpus.id)

        indexes_task = asyncio.create_task(prepare_indexes())
        app.state.answers = {}       # run_id → AnswerLog of an answer being written or just written
        app.state.answer_tasks = {}  # run_id → the task writing it
        app.state.preparation = "ready" if knowledge is not None else "running"

        async def prepare():
            if knowledge is not None:
                return
            if info is None:
                app.state.preparation = "empty"
                return
            try:
                if app.state.knowledge.dense and settings.warmup_query.strip():
                    await asyncio.to_thread(app.state.knowledge.search, settings.warmup_query.strip())
                if not await asyncio.to_thread(app.state.knowledge.count):
                    raise RuntimeError("No documents available after preparation")
                app.state.preparation = "ready"
            except Exception:
                logger.exception("Background preparation failed")
                app.state.preparation = "error"

        preparation_task = asyncio.create_task(prepare())
        yield
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError): await cleanup_task
        preparation_task.cancel()
        await asyncio.gather(preparation_task, return_exceptions=True)
        indexes_task.cancel()
        await asyncio.gather(indexes_task, return_exceptions=True)
        await app.state.jobs.shutdown()
        for task in list(app.state.answer_tasks.values()):
            task.cancel()
        await asyncio.gather(*app.state.answer_tasks.values(), return_exceptions=True)

    app = FastAPI(title="dox_agent", version="0.2.0", lifespan=lifespan)

    @app.exception_handler(IndexPreparing)
    async def index_preparing(request, exc):
        return JSONResponse(status_code=503, content={"detail": str(exc)}, headers={"Retry-After": "5"})
    from .auth import install_auth
    install_auth(app, settings.user_dir)

    app.include_router(corpus_groups_router)
    app.include_router(workspace_router)
    app.include_router(intelligence_router)
    app.include_router(review_router)

    def find_corpus(corpus_id: str) -> CorpusInfo | None:
        for info in scan_corpora(settings):
            if info.id == corpus_id:
                return info
        return None

    def knowledge_for(info: CorpusInfo) -> Knowledge:
        """Lazy per-corpus Knowledge; the default corpus reuses the lifespan instance."""
        db_path = (info.sqlite or info.db_dir / "knowledge.sqlite3").resolve()
        if info.is_default and db_path == app.state.knowledge.path.resolve():
            return app.state.knowledge
        cached = app.state.corpus_knowledge.get(info.id)
        if cached is None:
            # 方案 A: derived data stays inside the corpus dir (datadb/ + vectordb/), never
            # in source/; a non-default corpus gets its own vector directory.
            cached = Knowledge(db_path, settings=settings,
                               vectordb_dir=info.vectordb_dir, source_root=info.source_dir)
            app.state.corpus_knowledge[info.id] = cached
        return cached

    async def knowledge_for_request(corpus: str | None) -> Knowledge:
        """Resolve the corpus for read/file; absent = the current first corpus (K0b)."""
        if corpus is None:
            info = await asyncio.to_thread(default_corpus_info, settings)
            if info is None:
                raise HTTPException(409, "尚无知识库，请先新建知识库")
            if info.missing:
                raise HTTPException(409, "首个知识库目录缺失，请先处理该目录")
            return knowledge_for(info)
        info = await asyncio.to_thread(find_corpus, corpus)
        if info is None:
            raise HTTPException(404, "知识库不存在")
        if info.missing:
            raise HTTPException(409, {"missing": True, "corpus_id": corpus,
                                      "message": "该知识库目录已缺失，请重新关联或解绑"})
        return knowledge_for(info)

    # Each domain installs its own router (card B2), in the order the routes were declared; what they
    # share from here travels in ctx.
    ctx = SimpleNamespace(settings=settings, knowledge=knowledge, graph_factory=graph_factory,
                          find_corpus=find_corpus, knowledge_for=knowledge_for, knowledge_for_request=knowledge_for_request)
    for domain in (api_system, api_assets, api_library, api_web, api_chat, api_structure, api_domains, api_reports):
        domain.install(app, ctx)

    @app.get("/{asset_path:path}")
    async def frontend(asset_path: str):
        root = (DOX_AGENT_ROOT / "frontend/dist").resolve()
        path = (root / (asset_path or "index.html")).resolve()
        # Only known application routes use the SPA entry; missing APIs/assets stay 404.
        page_route = re.fullmatch(
            r"(?:library(?:/[^/.]+/(?:documents(?:/[^/.]+)?|targets/four-facets))?"
            r"|review(?:/(?:formal|professional|guidelines|evidence|templates(?:/[^/.]+)?|runs/[^/.]+))?"
            r"|home|results(?:/[^/.]+)?|overview(?:/(?:build|domains))?|chat|tasks(?:/results)?|intelligence|artifacts|prompts)/?", asset_path)
        if page_route:
            path = root / "index.html"
        if asset_path == "api" or asset_path.startswith("api/") or not path.is_relative_to(root) or not path.is_file():
            raise HTTPException(404, "页面未构建或资源不存在；请在 frontend 执行 npm run build")
        # index.html must revalidate: after a rebuild its hashed asset names change, and a cached
        # page would reference deleted files. Hashed assets are content-addressed, so cache hard.
        if path.name == "index.html":
            headers = {"Cache-Control": "no-cache, must-revalidate"}
        else:
            headers = {"Cache-Control": "public, max-age=31536000, immutable"}
        return FileResponse(path, headers=headers)

    return app


app = create_app()
