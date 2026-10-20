"""Service health, the model and question composing."""

import asyncio
import os

from fastapi import APIRouter, HTTPException, Request

from ..agent.corpora import default_corpus_info
from ..agent.models import check_model
from ..compose_question import compose as compose_question
from .common import (
    ComposeRequest,
    logger,
    model_failure_message,
)


def install(app, ctx):
    find_corpus = ctx.find_corpus
    knowledge_for = ctx.knowledge_for
    settings = ctx.settings
    router = APIRouter()

    @router.get("/api/health")
    async def health(request: Request):
        default_info = await asyncio.to_thread(default_corpus_info, settings)
        active_knowledge = knowledge_for(default_info) if default_info and not default_info.missing else None
        docs_count = await asyncio.to_thread(active_knowledge.count) if active_knowledge else 0
        return {
            "status": "ok",
            "app_id": "dox-agent",
            "model": settings.model_name,
            "docs_count": docs_count,
            "api_key_configured": bool(settings.model_api_key),
            "model_verified": False,
            "web_provider": settings.web_provider,
            "preparation": (request.app.state.preparation if default_info is None or active_knowledge is request.app.state.knowledge
                            else default_info.preparation),
            "corpus_id": default_info.id if default_info else "",
            "index_progress": active_knowledge.dense.progress if active_knowledge and active_knowledge.dense else None,
        }

    @router.post("/api/compose-question")
    async def compose_question_text(payload: ComposeRequest):
        if not settings.model_api_key:
            raise HTTPException(503, "模型未配置，无法生成问题；可直接在输入框中填写")
        names = []
        for corpus_id in payload.corpus_ids:
            info = await asyncio.to_thread(find_corpus, corpus_id)
            if info is None:
                raise HTTPException(404, "知识库不存在")
            names.append(info.name)
        try:
            question = await compose_question(settings, payload.task, payload.elements, payload.intents,
                                              names, payload.scene.strip(), payload.note.strip())
        except TimeoutError as exc:
            raise HTTPException(504, "生成问题超时，请重试或直接填写") from exc
        except Exception as exc:  # provider/network errors surface as one readable message
            logger.warning("compose question failed: %s: %s", type(exc).__name__, str(exc)[:300])
            reason = model_failure_message(exc, "生成问题超时")
            raise HTTPException(502, f"生成问题失败：{reason}" if reason else f"生成问题失败（{type(exc).__name__}），请重试或直接填写") from exc
        return {"question": question}

    @router.get("/api/model")
    async def model_info():
        # F6/Q4: exported variables first, then the project .env (via Settings).
        review = {k: v for k, v in (("REVIEW_MODEL_NAME", os.environ.get("REVIEW_MODEL_NAME") or settings.review_model_name),
                                    ("REVIEW_MODEL_BASE_URL", os.environ.get("REVIEW_MODEL_BASE_URL")
                                     or settings.review_model_base_url)) if v}
        return {"model": settings.model_name, "base_url": settings.model_base_url,
                "api_key_configured": bool(settings.model_api_key),
                "review_override": review}

    @router.post("/api/model/check")
    async def check_model_connection():
        return await asyncio.to_thread(check_model, settings)

    app.include_router(router)
