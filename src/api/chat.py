"""Answers: the chat stream, its run events and cancelling."""

import asyncio
import hashlib
from contextlib import suppress
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..agent.corpora import (
    CorpusInfo,
    default_corpus_info,
)
from ..agent.models import tracing
from ..agent.usage import TurnUsage
from ..answers import KEEP_SECONDS as ANSWER_KEEP_SECONDS
from ..answers import AnswerLog
from ..answers import from_list as answer_from_list
from ..answers import replay as answer_replay
from ..custom_tasks import (
    TaskMissing,
    resolve_task_params,
)
from ..knowledge import KnowledgeGroup
from ..prompt_skills import render_skill
from ..prompts import list_tasks
from ..retrieval import fit_history
from ..runs import RunConflict, request_fingerprint
from .common import (
    ChatRequest,
    logger,
    model_failure_message,
    sse,
)


def install(app, ctx):
    find_corpus = ctx.find_corpus
    graph_factory = ctx.graph_factory
    knowledge_for = ctx.knowledge_for
    settings = ctx.settings
    router = APIRouter()

    @router.post("/api/chat")
    async def chat(payload: ChatRequest, request: Request):
        if payload.messages[-1].role != "user":
            raise HTTPException(422, "最后一条消息必须来自用户")
        if sum(len(m.content) for m in payload.messages) > 40000:
            raise HTTPException(422, "对话上下文超过4万字符，请新建对话")
        builtin_ids = {task["id"] for task in list_tasks()}
        if payload.task_id in builtin_ids:
            if payload.task_version is not None or payload.task_params:
                raise HTTPException(422, "内置任务没有自定义版本")
            task_definition = None
            engine_task_id = payload.task_id
        else:
            if payload.task_version is None:
                raise HTTPException(422, "自定义任务必须显式指定 task_version")
            try:
                task_definition = await asyncio.to_thread(
                    app.state.custom_tasks.version, payload.task_id, payload.task_version)
            except TaskMissing as exc:
                raise HTTPException(422, str(exc)) from exc
            engine_task_id = task_definition["engine_task_id"]
        # A published version is resolved by the server; request context can supply values,
        # never substitute a task definition or its instruction.
        client_params = payload.run_context.visible_params if payload.run_context else {}
        client_sources = payload.run_context.param_sources if payload.run_context else {}
        if task_definition:
            task_keys = set(task_definition.get("parameter_defaults", {})) | {
                item["key"] for item in task_definition.get("parameters", [])}
            # W3 clients may send a free-form run summary. Keep it separate from W4 task inputs
            # so a claimed summary cannot override a published default or forge its source.
            if task_keys & client_params.keys():
                raise HTTPException(422, "任务输入请使用 task_params，不能通过运行摘要覆盖")
            try:
                task_values, task_sources = resolve_task_params(task_definition, payload.task_params)
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
        else:
            task_values, task_sources = {}, {}
        effective_params = {**client_params, **task_values}
        effective_sources = {**client_sources, **task_sources}
        # H4: optional corpus binding; absent = default corpus (backward compatible).
        # The graph and the allowed_doc_ids validation both run against this instance,
        # so retrieval can never cross corpora. Each corpus uses its own vectordb_dir,
        # so a non-default corpus also builds its own dense index when EMBEDDING_PATH is set.
        chat_knowledge = app.state.knowledge
        chat_preparation = app.state.preparation
        chat_domain = ""
        selected_infos: list[tuple[str, CorpusInfo]] = []
        if payload.corpus_id is not None and payload.corpus_ids is not None:
            raise HTTPException(422, "corpus_id 与 corpus_ids 不能同时提供")
        if payload.corpus_ids is not None:
            # KB-4a: build a retrieval set; cross-corpus merge is rank-based (see retrieve_multi).
            selected = []
            for cid in payload.corpus_ids:
                info = await asyncio.to_thread(find_corpus, cid)
                if info is None:
                    raise HTTPException(404, "知识库不存在")
                if info.missing:
                    raise HTTPException(409, {"missing": True, "corpus_id": cid,
                                              "message": "该知识库目录已缺失，请重新关联或解绑"})
                selected.append((cid, info))
            selected_infos = selected
            chat_knowledge = KnowledgeGroup([(cid, knowledge_for(info)) for cid, info in selected])
            chat_preparation = "ready" if all(knowledge_for(info).current() for _, info in selected) else "empty"
            # A multi-corpus report intake must ask the user to name its domain;
            # the first selected corpus is only the browsing base, not an authority.
            chat_domain = selected[0][1].domain if len(selected) == 1 else ""
        elif payload.corpus_id is not None:
            info = await asyncio.to_thread(find_corpus, payload.corpus_id)
            if info is None:
                raise HTTPException(404, "知识库不存在")
            if info.missing:
                raise HTTPException(409, {"missing": True, "corpus_id": payload.corpus_id,
                                          "message": "该知识库目录已缺失，请重新关联或解绑"})
            selected_infos = [(info.id, info)]
            chat_knowledge = knowledge_for(info)
            chat_preparation = "ready" if chat_knowledge.current() else "empty"
            chat_domain = info.domain
        else:
            default_info = await asyncio.to_thread(default_corpus_info, settings)
            chat_domain = default_info.domain if default_info else ""
            if default_info:
                selected_infos = [(default_info.id, default_info)]
                chat_knowledge = knowledge_for(default_info)
                if app.state.preparation == "ready":
                    chat_preparation = "ready" if chat_knowledge.current() else "empty"

        # Single and multi-library requests share the same source identity contract.
        # A bare Knowledge loses corpus_id, making persisted citations open the default library.
        if selected_infos and not isinstance(chat_knowledge, KnowledgeGroup):
            chat_knowledge = KnowledgeGroup([(cid, knowledge_for(info)) for cid, info in selected_infos])

        web_snapshots = []
        if (payload.web_snapshot_ids and task_definition and task_definition.get("skill_snapshot")
                and task_definition["skill_snapshot"]["skill"]["resource_policy"] == "local_only"):
            raise HTTPException(422, "此任务绑定的 Skill 仅允许本地资料")
        for snapshot_id in payload.web_snapshot_ids:
            try:
                web_snapshots.append(await asyncio.to_thread(app.state.web_snapshots.get, snapshot_id))
            except KeyError as exc:
                raise HTTPException(422, "网页快照不存在或尚未确认") from exc
        resource_policy = "local_plus_urls" if web_snapshots else "local_only"
        web_versions = [{"snapshot_id": item["web_snapshot_id"], "version": item["version"],
                         **({"search_query": item["search_query"],
                             "search_domains": item["search_domains"],
                             "search_time_filter": item["search_time_filter"]}
                            if item.get("search_query") else {})}
                        for item in web_snapshots]

        if not selected_infos and not web_snapshots:
            raise HTTPException(409, "尚无可用知识库，请先新建知识库并添加文档")
        if payload.allowed_doc_ids:
            selected_memberships = {doc_id: [] for doc_id in payload.allowed_doc_ids}
            stale_docs = []
            for corpus_id, info in selected_infos:
                store = knowledge_for(info)
                doc_ids = {doc["doc_id"] for doc in await asyncio.to_thread(store.current)}
                stored_ids = {doc["doc_id"] for doc in await asyncio.to_thread(store.all)}
                for doc_id, owners in selected_memberships.items():
                    if doc_id in doc_ids:
                        owners.append(corpus_id)
                    elif doc_id in stored_ids:
                        stale_docs.append({"corpus_id": corpus_id, "doc_id": doc_id})
            if stale_docs:
                raise HTTPException(409, {"message": "限定资料已变化或不可用，请重新选择范围", "documents": stale_docs})
            if any(not owners for owners in selected_memberships.values()):
                raise HTTPException(422, "限定文档必须属于本次选择的知识库")
            if any(len(owners) != 1 for owners in selected_memberships.values()):
                raise HTTPException(422, "限定文档在所选知识库中的归属不唯一")
        if chat_preparation != "ready" and not web_snapshots:
            raise HTTPException(409, "所选知识库尚无已入库文档或当前可检索资料，请刷新或从范围移除后重试")
        # W6-A: confirmed snapshots let the run proceed, but the corpus keeps its real
        # preparation state; neither the run event nor the snapshot may claim it is ready.

        # W3-A: persist the server-effective run context before streaming. A run_id reused with a
        # different request fingerprint is rejected (409), so one snapshot never stands in for two runs.
        requested_corpus_ids = (payload.corpus_ids if payload.corpus_ids is not None
                                else ([payload.corpus_id] if payload.corpus_id is not None else []))
        run_context = payload.run_context
        fingerprint = request_fingerprint({
            "type": "chat", "task_id": payload.task_id,
            "task_version": task_definition["version"] if task_definition else None,
            "params": effective_params, "param_sources": effective_sources,
            "corpus_ids": requested_corpus_ids, "allowed_doc_ids": payload.allowed_doc_ids or [],
            "web_snapshots": web_versions,
            "messages": [m.model_dump() for m in payload.messages],
            "run_context": run_context.model_dump() if run_context else None,
        })
        try:
            _, created = await asyncio.to_thread(
                app.state.runs.create, payload.run_id, fingerprint,
                session_key=payload.session_key or "", run_type="chat", task_id=payload.task_id,
                task_version=task_definition["version"] if task_definition else None,
                engine_task_id=engine_task_id,
                skill_id=task_definition.get("skill_id") if task_definition else None,
                skill_version=task_definition.get("skill_version") if task_definition else None,
                model=settings.model_name,
                resource_policy=resource_policy,
                requested_corpus_ids=requested_corpus_ids,
                effective_corpus_ids=[cid for cid, _ in selected_infos],
                allowed_doc_ids=payload.allowed_doc_ids,
                params={**effective_params, **({"web_snapshot_ids": payload.web_snapshot_ids,
                                                "web_snapshot_versions": web_versions}
                                               if web_snapshots else {})},
                param_sources=effective_sources,
                output_intent=run_context.output_intent if run_context else "",
                preparation=chat_preparation)
        except RunConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except Exception:  # noqa: BLE001 - snapshot bookkeeping must never block the answer
            logger.warning("run snapshot create failed: %s", payload.run_id)
            created = True
        if not created:
            # A1: an existing run_id is never silently re-run (running or terminal). Replaying a
            # finished answer belongs to W3-B Artifact, not to overwriting this snapshot.
            raise HTTPException(409, "该 run_id 已存在；请使用新的 run_id 重新发起")

        async def stream():
            policy = None
            usage = TurnUsage(settings.max_model_calls)
            sources: list[dict] = []
            telemetry: dict = {}
            outcome = "interrupted"
            answer_parts: list[str] = []
            trace: list[dict] = []  # what the search found and why, kept with the run for later tracing
            snapshot_finished = False
            frozen_knowledge = None
            frozen_at = ""

            def persisted_citation(source: dict) -> dict:
                if source.get("kind") == "web" and source.get("snapshot_id"):
                    return {"kind": "web", "snapshot_id": source["snapshot_id"],
                            "url": source.get("url"), "fetched_at": source.get("fetched_at"),
                            "version": source.get("version", ""), "title": source.get("title", "")}
                citation = {"doc_id": source.get("doc_id", ""), "corpus_id": source.get("corpus_id", ""),
                            "version": source.get("version", ""), "title": source.get("title", ""),
                            "page": source.get("page"), "citation": source.get("citation"),
                            "locations": source.get("locations", [])}
                digest = (frozen_knowledge.source_sha256(citation["doc_id"], citation["corpus_id"])
                          if frozen_knowledge is not None else "")
                if digest:
                    citation["source_sha256"] = digest
                return citation

            async def persist_outcome() -> None:
                await asyncio.to_thread(
                    app.state.runs.update, payload.run_id, status=outcome,
                    ended_at=datetime.now(UTC).isoformat(),
                    metrics={"usage": usage.snapshot(), "telemetry": telemetry, "frozen_at": frozen_at,
                             "report_brief": policy.get("report_params") if policy and
                             policy.get("stop_reason") == "report_pending" else None},
                    # Exact UTF-8 token concatenation is the answer shown by the client.
                    # A digest avoids treating client-submitted artifact text as authoritative.
                    answer_sha256=(hashlib.sha256("".join(answer_parts).encode("utf-8")).hexdigest()
                                   if outcome == "completed" else ""),
                    citations=[persisted_citation(source) for source in sources],
                    trace=trace)
            # A2: declare the server-effective run context before any content, so the UI can show
            # the authoritative scope instead of only echoing the client request.
            yield sse("run", {"run_id": payload.run_id, "session_key": payload.session_key or "",
                              "task_id": payload.task_id,
                              "task_version": task_definition["version"] if task_definition else None,
                              "model": settings.model_name,
                              "resource_policy": resource_policy,
                              "web_snapshot_ids": payload.web_snapshot_ids,
                              "effective_corpus_ids": [cid for cid, _ in selected_infos],
                              "allowed_doc_ids": payload.allowed_doc_ids})
            try:
                async with asyncio.timeout(settings.run_timeout):
                    if engine_task_id != "task4":
                        frozen_knowledge = await asyncio.to_thread(chat_knowledge.freeze)
                        frozen_at = datetime.now(UTC).isoformat()
                    graph = graph_factory(frozen_knowledge or chat_knowledge, settings)
                    with tracing(settings):
                        async for event in graph.astream(
                            {
                                "messages": fit_history([m.model_dump() for m in payload.messages], settings.history_tokens),
                                "rounds": 0,
                                "evidence": [],
                                "searches": {},
                                "report": None,
                                "blocked": None,
                                "runtime_usage": usage,
                                "preparation": chat_preparation,
                                "corpus_domain": chat_domain,
                                "web_snapshots": web_snapshots,
                                "task_id": engine_task_id,
                                "custom_task": ({**{key: task_definition.get(key, "") for key in (
                                    "background", "category", "goal", "requirements", "outline")},
                                    "requirements": "\n".join(
                                        f"{label}：{task_definition.get(key, '')}"
                                        for label, key in (("类别", "category"),
                                                           ("边界", "boundaries"),
                                                           ("澄清条件", "clarification_conditions"),
                                                           ("输出要求", "output_instructions"))
                                        if task_definition.get(key)),
                                    "parameters": task_values}
                                    | ({"skill_instruction": render_skill(
                                        task_definition["skill_snapshot"]["skill"],
                                        task_definition["skill_snapshot"]["prompt"],
                                        {key: str(task_values.get(key, "")) for key in
                                         task_definition["skill_snapshot"]["skill"]["inputs"]})}
                                       if task_definition.get("skill_snapshot") else {})
                                    if task_definition else None),
                                "options": {"allowed_doc_ids": payload.allowed_doc_ids},
                            },
                            stream_mode="custom",
                            config={"recursion_limit": 12, "tags": ["dox-agent", "agentic-rag"], "callbacks": [usage]},
                        ):
                            if event["event"] == "policy":
                                policy = event["data"]
                            if event["event"] == "sources":
                                sources = event["data"]
                            if event["event"] == "telemetry":
                                telemetry = event["data"]
                            if event["event"] == "trace":
                                trace.append(event["data"])
                            if event["event"] == "token" and isinstance(event["data"].get("text"), str):
                                answer_parts.append(event["data"]["text"])
                            if event["event"] == "done":
                                # Completion is emitted once below, after the run is durable.
                                continue
                            data = event["data"]
                            if event["event"] in {"step", "telemetry"}:
                                data = {**data, "run_id": payload.run_id}
                            yield sse(event["event"], data)
                            if event["event"] == "telemetry":
                                yield sse("usage", {**usage.snapshot(), "run_id": payload.run_id})
                    yield sse("usage", {**usage.snapshot(), "run_id": payload.run_id})
                    outcome = "completed"
                    try:
                        # The UI enables "save as artifact" on done. Persist first so an
                        # immediate save cannot race the run's completed status/hash.
                        await persist_outcome()
                        snapshot_finished = True
                    except Exception:  # noqa: BLE001 - snapshot bookkeeping must not break the answer
                        logger.warning("run snapshot update failed: %s", payload.run_id)
                    yield sse("done", {"ok": True})
            except asyncio.CancelledError:
                outcome = "interrupted"
                raise
            except ValueError as exc:
                outcome = "failed"
                yield sse("usage", {**usage.snapshot(), "run_id": payload.run_id})
                if policy:
                    yield sse("policy", {**policy, "stop_reason": "invalid_request"})
                yield sse("error", {"message": str(exc)})
            except TimeoutError:
                outcome = "timed_out"
                yield sse("usage", {**usage.snapshot(), "run_id": payload.run_id})
                if policy:
                    yield sse("policy", {**policy, "stop_reason": "timed_out"})
                yield sse("error", {"message": "运行达到时间预算，请缩小问题范围"})
            except Exception as exc:  # noqa: BLE001 - API boundary hides provider secrets
                outcome = "failed"
                yield sse("usage", {**usage.snapshot(), "run_id": payload.run_id})
                # The provider's message (status, reason) is logged so a failure can be diagnosed;
                # the key never appears in it.
                logger.warning("chat failed: %s: %s", type(exc).__name__, str(exc)[:300])
                if policy:
                    yield sse("policy", {**policy, "stop_reason": "failed"})
                message = (model_failure_message(exc, "模型响应超时，所选资料较长时可减少资料份数后重试")
                           or "问答未完成，请稍后重试；如持续失败请联系管理员")
                yield sse("error", {"message": message})
            finally:
                if not snapshot_finished:
                    try:
                        await persist_outcome()
                    except Exception:  # noqa: BLE001 - snapshot bookkeeping must not break the stream
                        logger.warning("run snapshot update failed: %s", payload.run_id)
                if frozen_knowledge is not None:
                    frozen_knowledge.close_snapshot()

        # The answer is produced by its own task and this response only follows it (card B1): closing
        # the page ends the following, not the answer, which is there when the person comes back.
        log = AnswerLog()
        app.state.answers[payload.run_id] = log

        async def produce():
            try:
                async for chunk in stream():
                    await log.append(chunk)
            finally:
                await log.close()
                app.state.answer_tasks.pop(payload.run_id, None)
                try:
                    if (await asyncio.to_thread(app.state.runs.get, payload.run_id)).get("status") == "completed":
                        await asyncio.to_thread(app.state.runs.update, payload.run_id, replay=answer_replay(log.chunks))
                except Exception:  # noqa: BLE001 - the live log still serves pages for a while
                    logger.warning("answer replay not saved: %s", payload.run_id)
                asyncio.get_running_loop().call_later(ANSWER_KEEP_SECONDS, app.state.answers.pop, payload.run_id, None)

        app.state.answer_tasks[payload.run_id] = asyncio.create_task(produce())
        return StreamingResponse(log.follow(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @router.get("/api/runs/{run_id}/events")
    async def run_events(run_id: str):
        """An answer's events from the start: live while it is being written, then from the run."""
        log = app.state.answers.get(run_id)
        if log is not None:
            return StreamingResponse(log.follow(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
        try:
            snapshot = await asyncio.to_thread(app.state.runs.get, run_id)
        except KeyError as exc:
            raise HTTPException(404, "运行记录未记录") from exc
        if snapshot.get("run_type") != "chat" or not snapshot.get("replay"):
            raise HTTPException(409, {"status": snapshot.get("status"), "message": "这次回答没有可恢复的内容"})
        return StreamingResponse(answer_from_list(snapshot["replay"]), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache"})

    @router.post("/api/runs/{run_id}/cancel")
    async def cancel_run(run_id: str):
        """Stop an answer on purpose; leaving the page no longer does (the model would keep billing)."""
        task = app.state.answer_tasks.get(run_id)
        if task is None or task.done():
            return {"run_id": run_id, "cancelled": False}
        task.cancel()
        with suppress(asyncio.CancelledError):
            await asyncio.wait({task}, timeout=5)
        return {"run_id": run_id, "cancelled": True}

    app.include_router(router)
