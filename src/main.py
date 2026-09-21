"""One FastAPI entrypoint for corpus ingestion, evidence and agent streaming."""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from .agent.config import DOX_AGENT_ROOT, get_settings
from .agent.graph import build_graph
from .agent.models import tracing
from .agent.usage import TurnUsage
from .knowledge import Knowledge
from .official_docs import import_official
from .parsers import import_defaults, parse_web
from .workspace import Workspace
from .workspace import router as workspace_router

logger = logging.getLogger(__name__)


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)
    allowed_doc_ids: list[str] | None = Field(default=None, min_length=1, max_length=20)
    run_id: str = Field(default_factory=lambda: uuid4().hex, min_length=8, max_length=80)


class WebRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4000)


class OfficialRequest(BaseModel):
    sections: list[Literal["langchain", "langgraph", "deepagents"]] = Field(default=["langchain", "langgraph", "deepagents"], min_length=1, max_length=3)


def sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def create_app(settings=None, knowledge=None, graph_factory=build_graph):
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app):
        app.state.knowledge = knowledge or Knowledge(settings.data_dir / "knowledge.sqlite3", settings=settings)
        app.state.workspace = Workspace(app.state.knowledge.path.parent / "workspace.sqlite3")
        app.state.knowledge.workspace = app.state.workspace
        app.state.import_lock = asyncio.Lock()
        app.state.preview = None
        app.state.official_job = {"status": "idle", "total": 0, "completed": 0, "imported": 0, "changed": 0, "errors": []}
        app.state.official_task = None
        app.state.preparation = "ready" if knowledge is not None else "running"

        async def prepare():
            if knowledge is not None:
                return
            try:
                if not any(doc["kind"] == "official" for doc in await asyncio.to_thread(app.state.knowledge.all)):
                    async with app.state.import_lock:
                        app.state.official_job["status"] = "running"
                        await import_official(app.state.knowledge, ["langchain", "langgraph", "deepagents"], app.state.official_job)
                        app.state.official_job["status"] = "partial" if app.state.official_job["errors"] else "done"
                if app.state.knowledge.dense:
                    await asyncio.to_thread(app.state.knowledge.search, "LangChain")
                if not await asyncio.to_thread(app.state.knowledge.count):
                    raise RuntimeError("No documents available after preparation")
                app.state.preparation = "ready"
            except Exception as exc:
                logger.exception("Background preparation failed")
                if app.state.official_job["status"] == "running":
                    app.state.official_job["status"] = "error"
                    app.state.official_job["errors"].append({"error": type(exc).__name__})
                app.state.preparation = "error"

        preparation_task = asyncio.create_task(prepare())
        yield
        preparation_task.cancel()
        await asyncio.gather(preparation_task, return_exceptions=True)
        if app.state.official_task and not app.state.official_task.done():
            app.state.official_task.cancel()
            await asyncio.gather(app.state.official_task, return_exceptions=True)

    app = FastAPI(title="dox_agent", version="0.2.0", lifespan=lifespan)

    app.include_router(workspace_router)

    @app.get("/api/health")
    async def health(request: Request):
        docs_count = await asyncio.to_thread(request.app.state.knowledge.count)
        return {
            "status": "ok",
            "app_id": "dox-agent",
            "model": settings.model_name,
            "docs_count": docs_count,
            "api_key_configured": bool(settings.model_api_key),
            "model_verified": False,
            "web_provider": settings.web_provider,
            "preparation": request.app.state.preparation,
            "index_progress": request.app.state.knowledge.dense.progress if request.app.state.knowledge.dense else None,
        }

    @app.get("/api/documents")
    async def documents(request: Request):
        docs = await asyncio.to_thread(request.app.state.knowledge.all)
        return [{k: v for k, v in d.items() if k != "pages"} | {"pages": len(d["pages"])} for d in docs]

    @app.get("/api/official-docs")
    async def official_status():
        return app.state.official_job

    @app.post("/api/official-docs", status_code=202)
    async def official_import(payload: OfficialRequest):
        if app.state.preparation == "running":
            raise HTTPException(409, "知识库正在初始化，请等待初始化结束后更新")
        if app.state.official_task and not app.state.official_task.done():
            raise HTTPException(409, "官方文档正在更新")
        progress = {"status": "running", "total": 0, "completed": 0, "imported": 0, "changed": 0, "errors": []}
        app.state.official_job = progress

        async def run():
            try:
                async with app.state.import_lock:
                    await import_official(app.state.knowledge, payload.sections, progress)
                progress["status"] = "partial" if progress["errors"] else "done"
            except Exception as exc:
                logger.exception("Official documentation import failed")
                progress["status"] = "error"
                progress["errors"].append({"error": type(exc).__name__})

        app.state.official_task = asyncio.create_task(run())
        return progress

    @app.get("/api/documents/{doc_id}")
    async def read_document(
        request: Request, doc_id: str, page: int = 1, start_line: int = 1, version: str | None = None, section: bool = False
    ):
        try:
            return await asyncio.to_thread(
                (request.app.state.knowledge.read_section if section else request.app.state.knowledge.read), doc_id, page, start_line, 60, version
            )
        except KeyError as exc:
            raise HTTPException(404, "文档不存在") from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/ingest/local")
    async def ingest(request: Request):
        if app.state.preparation == "running":
            raise HTTPException(409, "知识库正在初始化，请稍后导入")
        async with app.state.import_lock:
            return await asyncio.to_thread(import_defaults, app.state.knowledge, settings)

    @app.post("/api/web/preview")
    async def preview(payload: WebRequest):
        try:
            doc = await parse_web(payload.url, settings)
            import uuid

            preview_id = uuid.uuid4().hex
            # Single-user app: only latest preview retained, not arbitrary browser-supplied content.
            app.state.preview = (preview_id, doc)
            return {"preview_id": preview_id, **doc.model_dump()}
        except (ValueError, TimeoutError) as exc:
            raise HTTPException(422, str(exc) or "网页抓取超时") from exc
        except Exception as exc:
            logger.warning("web preview failed: %s", type(exc).__name__)
            raise HTTPException(502, "抓取失败，请检查解析器安装、会话或网站访问权限") from exc

    @app.post("/api/web/confirm/{preview_id}")
    async def confirm(preview_id: str):
        if app.state.preparation == "running":
            raise HTTPException(409, "知识库正在初始化，请稍后确认")
        async with app.state.import_lock:
            current = app.state.preview
            if current is None or current[0] != preview_id:
                raise HTTPException(409, "预览已失效，请重新抓取")
            result = await asyncio.to_thread(app.state.knowledge.put, current[1])
            app.state.preview = None
            return result

    @app.post("/api/chat")
    async def chat(payload: ChatRequest, request: Request):
        if payload.messages[-1].role != "user":
            raise HTTPException(422, "最后一条消息必须来自用户")
        if sum(len(m.content) for m in payload.messages) > 40000:
            raise HTTPException(422, "对话上下文超过4万字符，请新建对话")

        async def stream():
            policy = None
            usage = TurnUsage(settings.max_model_calls)
            try:
                async with asyncio.timeout(settings.run_timeout):
                    graph = graph_factory(app.state.knowledge, settings)
                    with tracing(settings):
                        async for event in graph.astream(
                            {
                                "messages": [m.model_dump() for m in payload.messages],
                                "rounds": 0,
                                "evidence": [],
                                "searches": {},
                                "report": None,
                                "blocked": None,
                                "runtime_usage": usage,
                                "preparation": app.state.preparation,
                                "options": {"allowed_doc_ids": payload.allowed_doc_ids},
                            },
                            stream_mode="custom",
                            config={"recursion_limit": 12, "tags": ["dox-agent", "agentic-rag"], "callbacks": [usage]},
                        ):
                            if await request.is_disconnected():
                                return
                            if event["event"] == "policy":
                                policy = event["data"]
                            data = event["data"]
                            if event["event"] in {"step", "telemetry"}:
                                data = {**data, "run_id": payload.run_id}
                            yield sse(event["event"], data)
                            if event["event"] == "telemetry":
                                yield sse("usage", {**usage.snapshot(), "run_id": payload.run_id})
                    yield sse("usage", {**usage.snapshot(), "run_id": payload.run_id})
                    yield sse("done", {"ok": True})
            except asyncio.CancelledError:
                raise
            except ValueError as exc:
                yield sse("usage", {**usage.snapshot(), "run_id": payload.run_id})
                if policy:
                    yield sse("policy", {**policy, "stop_reason": "invalid_request"})
                yield sse("error", {"message": str(exc)})
            except TimeoutError:
                yield sse("usage", {**usage.snapshot(), "run_id": payload.run_id})
                if policy:
                    yield sse("policy", {**policy, "stop_reason": "timed_out"})
                yield sse("error", {"message": "运行达到时间预算，请缩小问题范围"})
            except Exception as exc:  # noqa: BLE001 - API boundary hides provider secrets
                yield sse("usage", {**usage.snapshot(), "run_id": payload.run_id})
                logger.warning("chat failed: %s", type(exc).__name__)
                if policy:
                    yield sse("policy", {**policy, "stop_reason": "failed"})
                yield sse("error", {"message": "问答未完成，请检查模型配置或稍后重试"})

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/{asset_path:path}")
    async def frontend(asset_path: str):
        root = (DOX_AGENT_ROOT / "frontend/dist").resolve()
        path = (root / (asset_path or "index.html")).resolve()
        if asset_path.startswith("api/") or not path.is_relative_to(root) or not path.is_file():
            raise HTTPException(404, "页面未构建或资源不存在；请在 frontend 执行 npm run build")
        return FileResponse(path)

    return app


app = create_app()
