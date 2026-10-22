"""Reports, 报告中心 artifacts, period summaries and exports."""

import asyncio
import hashlib
import io
import re
import zipfile
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

from ..agent.corpora import (
    default_corpus_info,
    scan_corpora,
)
from ..agent.models import model_for
from ..artifacts import report_title
from ..custom_tasks import (
    TaskMissing,
    resolve_task_params,
)
from ..custom_templates import (
    TemplateMissing,
    render_template,
)
from ..docx_export import markdown_to_docx
from ..hierarchy import read as read_hierarchy
from ..prompts import REPORT_TEMPLATES, list_tasks
from ..report_figures import change_figure, insert_figures, select_figures
from ..reports import ScopeChanged, generate_markdown, preflight_report
from ..runs import RunConflict, request_fingerprint
from .common import (
    ArtifactCreate,
    ArtifactVersionCreate,
    FigureReplaceRequest,
    ReportRequest,
    logger,
)


def install(app, ctx):
    find_corpus = ctx.find_corpus
    knowledge_for = ctx.knowledge_for
    knowledge_for_request = ctx.knowledge_for_request
    settings = ctx.settings
    router = APIRouter()

    async def record_report_failure(run_id: str, params: dict, reason: str) -> None:
        try:
            await asyncio.to_thread(app.state.runs.update, run_id, status="failed",
                                    ended_at=datetime.now(UTC).isoformat())
            await asyncio.to_thread(app.state.artifacts.record_failed_report,
                                    run_id=run_id, title=report_title(params),
                                    session_key=params.get("session_key", ""),
                                    corpus_id=params.get("corpus_id", ""),
                                    task_id=params.get("task_id", "task4"),
                                    template_id=params.get("template_id", ""),
                                    task_version=params.get("task_version"),
                                    template_version=params.get("template_version"), reason=reason)
        except Exception:  # noqa: BLE001 - bookkeeping cannot mask the generation error
            logger.warning("failed report status unavailable for run: %s", run_id)

    @router.get("/api/reports")
    async def list_reports(session_key: str | None = None, run_id: str | None = None, limit: int = 20):
        """#10: report metadata for a session (no markdown), newest first."""
        return await asyncio.to_thread(app.state.artifacts.list_reports,
                                       session_key=session_key, run_id=run_id, limit=limit)

    class SummaryRequest(BaseModel):
        period: Literal["week", "month", "quarter", "half", "year"]

    @router.post("/api/summaries", status_code=201)
    async def create_summary(payload: SummaryRequest):
        """A period work summary (query 2026-1013 1801): counted charts plus model-written sections,
        saved as a report. Runs only when someone asks for it."""
        from ..period_summary import generate
        if not settings.model_api_key:
            raise HTTPException(409, "分析模型尚未配置")
        try:
            async with asyncio.timeout(settings.answer_timeout):
                return await generate(app, payload.period, model_for(settings))
        except ValueError as exc:
            raise HTTPException(502, "总结未生成：" + str(exc)) from exc
        except Exception as exc:
            logger.exception("Period summary failed")
            raise HTTPException(502, "总结未生成：模型调用失败，请重试") from exc

    @router.get("/api/summaries/facts")
    async def summary_facts(period: str, request: Request):
        """近期工作 counted on the server over every report and review (节点审查 A4/A5): repeated reviews
        of one application count once. Every role sees the same reports (query 2026-1014 1516)."""
        from ..period_summary import PERIODS, TASK_ID, gather, report_rows
        from ..review import storage as review_db
        if period not in PERIODS:
            raise HTTPException(422, "未知时间段")
        names = {info.id: info.name for info in await asyncio.to_thread(scan_corpora, settings)}
        rows = await asyncio.to_thread(report_rows, app.state.artifacts)
        runs = await asyncio.to_thread(review_db.all_items, "run")
        facts = gather(period, datetime.now().astimezone(), rows, runs, names)
        summaries = [{"id": r["artifact_id"], "title": r["title"], "created_at": r["created_at"]}
                     for r in rows if r["task_id"] == TASK_ID and r["status"] == "completed"][:6]
        return {**facts, "summaries": summaries}

    @router.get("/api/results/summary")
    async def results_summary():
        """Global report totals, independent of list pagination and user role."""
        def count():
            from ..review import storage as review_storage
            completed = {"analysis": 0, "review": 0, "intelligence": 0}
            active = failed = recent = 0
            with app.state.artifacts.connect() as db:
                rows = db.execute(
                    "SELECT CASE WHEN task_id='intelligence' THEN 'intelligence' ELSE 'analysis' END, "
                    "status, COUNT(*), SUM(CASE WHEN julianday(created_at)>=julianday('now','-7 days') THEN 1 ELSE 0 END) "
                    "FROM artifacts WHERE type='report' AND trashed_at IS NULL GROUP BY 1,2").fetchall()
            with review_storage.connect() as db:
                rows += db.execute(
                    "SELECT 'review', json_extract(payload,'$.status'), COUNT(*), "
                    "SUM(CASE WHEN julianday(json_extract(payload,'$.created_at'))>=julianday('now','-7 days') THEN 1 ELSE 0 END) "
                    "FROM objects WHERE kind='run' GROUP BY 2").fetchall()
            for group, status, amount, new in rows:
                if status == "completed":
                    completed[group] += amount
                    recent += new or 0
                elif status in ("queued", "running", "generating"):
                    active += amount
                elif status == "failed":
                    failed += amount
            completed["total"] = sum(completed.values())
            return {"completed": completed, "active": active, "failed": failed, "recent_completed": recent}
        return await asyncio.to_thread(count)

    @router.post("/api/reports/preflight")
    async def report_preflight(payload: ReportRequest):
        if payload.year_from > payload.year_to:
            raise HTTPException(422, "起始年份不能晚于结束年份")
        kn = await knowledge_for_request(payload.corpus_id)
        if payload.doc_ids:
            available_ids = {doc["doc_id"] for doc in await asyncio.to_thread(kn.current)}
            if not set(payload.doc_ids) <= available_ids:
                stored_ids = {doc["doc_id"] for doc in await asyncio.to_thread(kn.all)}
                if set(payload.doc_ids) & (stored_ids - available_ids):
                    raise HTTPException(409, "报告限定资料已变化或不可用，请重新选择范围")
                raise HTTPException(422, "报告限定文档必须属于指定知识库")
        try:
            return await asyncio.to_thread(preflight_report, kn, payload.model_dump())
        except ScopeChanged as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.post("/api/reports")
    async def create_report(payload: ReportRequest):
        if payload.year_from > payload.year_to:
            raise HTTPException(422, "起始年份不能晚于结束年份")
        kn = await knowledge_for_request(payload.corpus_id)
        if payload.doc_ids:
            available_ids = {doc["doc_id"] for doc in await asyncio.to_thread(kn.current)}
            if not set(payload.doc_ids) <= available_ids:
                stored_ids = {doc["doc_id"] for doc in await asyncio.to_thread(kn.all)}
                if set(payload.doc_ids) & (stored_ids - available_ids):
                    raise HTTPException(409, "报告限定资料已变化或不可用，请重新选择范围")
                raise HTTPException(422, "报告限定文档必须属于指定知识库")
        try:
            scope = await asyncio.to_thread(preflight_report, kn, payload.model_dump())
        except ScopeChanged as exc:
            raise HTTPException(409, str(exc)) from exc
        if payload.scope_fingerprint and payload.scope_fingerprint != scope["fingerprint"]:
            raise HTTPException(409, "资料范围已变化，请重新预检后再生成")
        if not scope["eligible_count"]:
            raise HTTPException(422, "所选范围内没有项目区间与年份窗口相交且符合基金类别的资料；请调整范围或查看缺失元数据")
        session_key = payload.session_key or ""
        template_content: str | None = None
        template_version = 0
        task_id = "task4"
        task_version = None
        task_definition = None
        task_values, task_sources = {}, {}
        if payload.task_id is not None:
            if payload.task_id in {task["id"] for task in list_tasks()}:
                if payload.task_id != "task4":
                    raise HTTPException(422, "报告只能由 task4 或报告型自定义任务生成")
                if payload.task_version is not None or payload.task_params:
                    raise HTTPException(422, "内置 task4 不接受自定义任务参数")
            else:
                if payload.task_version is None:
                    raise HTTPException(422, "报告型自定义任务必须显式指定 task_version")
                try:
                    task_definition = await asyncio.to_thread(
                        app.state.custom_tasks.version, payload.task_id, payload.task_version)
                except TaskMissing as exc:
                    raise HTTPException(422, "报告型自定义任务不存在或尚未发布") from exc
                if task_definition.get("engine_task_id") != "task4":
                    raise HTTPException(422, "该自定义任务不是报告型任务")
                task_id = payload.task_id
                task_version = int(task_definition["version"])
                bound_template_id = task_definition.get("report_template_id")
                bound_template_version = task_definition.get("report_template_version")
                requested_template_version = payload.template_version if payload.template_id not in REPORT_TEMPLATES else 0
                if payload.template_id != bound_template_id or requested_template_version != bound_template_version:
                    raise HTTPException(422, "请求报告模版与发布任务绑定不一致")
                try:
                    task_values, task_sources = resolve_task_params(task_definition, payload.task_params)
                except ValueError as exc:
                    raise HTTPException(422, str(exc)) from exc
        else:
            if payload.task_version is not None or payload.task_params:
                raise HTTPException(422, "task_version 和 task_params 仅适用于自定义报告任务")
            task_values, task_sources = {}, {}

        if payload.template_id in REPORT_TEMPLATES:
            if payload.template_version not in (None, 0):
                raise HTTPException(422, "内置报告模版版本只能为 0")
        else:
            if payload.template_version == 0:
                raise HTTPException(422, "自定义报告模版必须使用已发布版本")
            try:
                current_template = await asyncio.to_thread(app.state.custom_templates.get, payload.template_id)
                if task_definition is None and current_template.get("archived"):
                    raise HTTPException(422, "已归档模版不能用于新的报告运行")
                definition = await asyncio.to_thread(app.state.custom_templates.version,
                                                      payload.template_id, payload.template_version)
            except TemplateMissing as exc:
                raise HTTPException(422, "自定义报告模版不存在或尚未发布") from exc
            template_version = int(definition.get("version", 0))
            template_content = render_template(definition["content"], {
                "domain": payload.domain, "year_range": f"{payload.year_from}–{payload.year_to}",
                "year_from": payload.year_from, "year_to": payload.year_to,
                "fund_type": payload.fund_type or "不限", "focus": payload.focus or "无",
            })
        # W3-A: a report is an independent run whose parent is the task4 intake chat run.
        # The fingerprint check runs first: reusing a run_id with different parameters is a
        # conflict (409) rather than silently returning a differently-scoped report.
        run_id = payload.run_id or uuid4().hex
        report_params = {
            **payload.model_dump(exclude={"run_id", "parent_run_id"}),
            "template_version": template_version,
            "task_id": task_id,
            "task_version": task_version,
            "task_params": task_values,
            "task_param_sources": task_sources,
        }
        report_params["scope_fingerprint"] = scope["fingerprint"]
        report_params["candidate_count"] = scope["eligible_count"]
        report_params["candidate_docs"] = scope["eligible"]
        report_sources = {key: "user_confirmed" for key in (
            "domain", "year_from", "year_to", "fund_type", "focus", "purpose", "audience", "length", "illustrated")}
        report_sources["template_id"] = "published_task" if task_definition else "user_confirmed"
        if payload.parent_run_id:
            try:
                parent = await asyncio.to_thread(app.state.runs.get, payload.parent_run_id)
                proposal = parent.get("metrics", {}).get("report_brief") or {}
                proposed_sources = proposal.get("sources") or {}
                if (parent.get("run_type") == "chat" and parent.get("status") == "completed"
                        and parent.get("session_key") == session_key
                        and parent.get("engine_task_id") == "task4"
                        and payload.corpus_id in (parent.get("effective_corpus_ids") or [])):
                    for key in report_sources:
                        if key == "template_id" and task_definition:
                            continue
                        if key in proposal:
                            report_sources[key] = (proposed_sources.get(key, "user_confirmed")
                                                   if proposal[key] == report_params[key] else "user_edit")
            except KeyError:
                pass  # Historical report runs may not have an intake snapshot.
        report_params["brief_sources"] = report_sources
        fingerprint = request_fingerprint({"type": "report", **report_params,
                                           "doc_ids": payload.doc_ids or [],
                                           "corpus_id": payload.corpus_id or ""})
        try:
            snapshot, created = await asyncio.to_thread(
                app.state.runs.create, run_id, fingerprint,
                session_key=session_key, parent_run_id=payload.parent_run_id or "",
                run_type="report", task_id=task_id, task_version=task_version, engine_task_id="task4",
                model=settings.model_name,
                resource_policy="local_only",
                requested_corpus_ids=[payload.corpus_id] if payload.corpus_id else [],
                effective_corpus_ids=[payload.corpus_id] if payload.corpus_id else [],
                allowed_doc_ids=payload.doc_ids,
                params=report_params,
                # Task input names may equal brief fields (for example "domain"); namespace
                # their origins so neither provenance record silently replaces the other.
                param_sources={**report_sources, **{f"task_params.{key}": value
                                                    for key, value in task_sources.items()}},
                output_intent="document")
        except RunConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except Exception:  # noqa: BLE001 - snapshot bookkeeping must never block report generation
            logger.warning("run snapshot create failed: %s", run_id)
            snapshot, created = {}, True
        if payload.run_id:  # M3: idempotent per (session_key, run_id), same fingerprint only
            existing = await asyncio.to_thread(app.state.artifacts.find_report, session_key, payload.run_id)
            if existing is not None:
                return JSONResponse({**await get_report(existing["report_id"]), "idempotent": True}, status_code=200)
        if not created and snapshot.get("status") == "running":
            # A1: a second request while this report run is still generating must not race it.
            raise HTTPException(409, "该报告正在生成中")
        resolved_info = await asyncio.to_thread(find_corpus, payload.corpus_id) if payload.corpus_id else await asyncio.to_thread(default_corpus_info, settings)
        report_params["session_key"] = session_key
        await asyncio.to_thread(app.state.artifacts.begin_report, run_id, {**report_params,"corpus_id":resolved_info.id if resolved_info else ""})
        # One generating entity owns this attempt.
        hierarchy_record: dict | None = None
        if resolved_info is not None:
            try:
                library = await asyncio.to_thread(app.state.project_index.library, resolved_info,
                                                 knowledge_for(resolved_info))
                hierarchy_record = await read_hierarchy(resolved_info, library)
            except Exception:  # a hierarchy read must never block report generation
                logger.warning("hierarchy read failed for report", exc_info=True)
        if hierarchy_record is not None:
            # Passed inside the run params so the call signature stays stable; generate_markdown
            # replaces it with the small snapshot that is persisted with the artifact.
            report_params["hierarchy_record"] = hierarchy_record
        try:
            visible_sources: list[dict] = []
            markdown = await generate_markdown(
                kn, settings, report_params,
                **({"template_content": template_content} if template_content is not None else {}),
                **({"task_definition": task_definition} if task_definition is not None else {}),
                visible_sources=visible_sources)
        except asyncio.CancelledError:
            await record_report_failure(run_id, report_params, "报告生成已中断")
            raise
        except ScopeChanged as exc:
            await record_report_failure(run_id, report_params, str(exc))
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            await record_report_failure(run_id, report_params, str(exc))
            raise HTTPException(422, str(exc)) from exc
        except Exception as exc:
            await record_report_failure(run_id, report_params, "报告生成失败")
            logger.warning("report generation failed: %s", type(exc).__name__)
            raise HTTPException(500, "报告生成失败，请检查模型配置或稍后重试") from exc
        figures: list[dict] = []
        info = (await asyncio.to_thread(find_corpus, payload.corpus_id) if payload.corpus_id
                else await asyncio.to_thread(default_corpus_info, settings))
        if payload.illustrated:
            if info is not None:
                try:
                    figures = await asyncio.to_thread(select_figures, kn, info, visible_sources, markdown)
                    markdown = insert_figures(markdown, figures)
                    figures = [figure for figure in figures if f"figures/{figure['figure_id']}." in markdown]
                except Exception:  # An image cache failure cannot discard the completed text report.
                    logger.exception("illustrated report figure selection failed")
                    figures = []
            if not figures:
                note = "\n\n> 未找到可可靠复用的图，本报告以文字呈现。\n"
                marker = "\n\n## 来源附录（系统记录）"
                markdown = markdown.replace(marker, note + marker, 1) if marker in markdown else markdown + note
        report_params["visible_sources"] = visible_sources
        try:
            saved = await asyncio.to_thread(app.state.artifacts.finish_report, run_id, report_params, markdown, figures)
        except Exception:  # a failed atomic save must leave a recoverable failure
            logger.exception("report artifact save failed")
            await record_report_failure(run_id, report_params, "保存到报告中心失败")
            raise HTTPException(500, "保存到报告中心失败，请重试") from None
        try:
            await asyncio.to_thread(app.state.runs.update, run_id, status="completed", ended_at=datetime.now(UTC).isoformat(), metrics={"report_id": saved["report_id"]})
        except Exception: logger.exception("report run update failed")
        return JSONResponse({**saved, "idempotent": False}, status_code=201)

    @router.post("/api/artifacts/{artifact_id}/retry", status_code=201)
    async def retry_report(artifact_id: str, request: Request):
        """Run a failed or interrupted report again with the settings it was started with (card B1).

        The new attempt is a report of its own, checked and generated like any other; once it is
        saved, the failed record moves to the recycle bin, where it can still be restored."""
        try:
            item = await asyncio.to_thread(app.state.artifacts.get, artifact_id)
        except KeyError as exc:
            raise HTTPException(404, "报告中心没有这条记录") from exc
        if item["type"] != "report" or item["status"] != "failed":
            raise HTTPException(409, "只有未完成的报告可以重新生成")
        if item.get("task_id") == "intelligence":
            raise HTTPException(409, "情报分析报告依赖当时上传的外部材料，请在情报分析页重新发起")
        params = item.get("report_params") or {}
        fields = {key: params[key] for key in ReportRequest.model_fields
                  if key not in ("run_id", "parent_run_id", "scope_fingerprint") and params.get(key) is not None}
        try:
            payload = ReportRequest(**fields)
        except ValidationError as exc:
            raise HTTPException(422, "原报告的设置不完整，请从分析页重新发起") from exc
        response = await create_report(payload)
        if may_delete(request, item):  # someone else's failed record is theirs to remove
            try:
                await asyncio.to_thread(app.state.artifacts.transition, artifact_id, "trash", item["revision"])
            except HTTPException:
                pass  # someone changed or removed the failed record meanwhile; leave it as it is
        return response

    @router.get("/api/reports/{report_id}")
    async def get_report(report_id: str):
        try:
            report = await asyncio.to_thread(app.state.artifacts.get_report, report_id)
        except KeyError as exc:
            raise HTTPException(404, "报告不存在") from exc
        return report

    @router.get("/api/reports/{report_id}/figures/{figure_id}")
    async def report_figure(report_id: str, figure_id: str):
        report = await get_report(report_id)
        return await artifact_figure(report["artifact_id"], report["generated_version"], figure_id)

    @router.get("/api/runs/{run_id}")
    async def get_run(run_id: str):
        """W3-A: read back the persisted run snapshot; legacy runs without one return 404."""
        try:
            return await asyncio.to_thread(app.state.runs.get, run_id)
        except KeyError as exc:
            raise HTTPException(404, "运行记录未记录") from exc

    async def resolve_artifact(artifact_id: str, version: int | None = None, include_trashed=False) -> dict:
        try:
            if artifact_id.startswith("report:"):
                artifact_id = await asyncio.to_thread(app.state.artifacts.report_identity, artifact_id[7:])
            item = await asyncio.to_thread(app.state.artifacts.get, artifact_id, version, include_trashed=include_trashed)
        except KeyError as exc: raise HTTPException(404, "报告中心没有这条记录") from exc
        available = await asyncio.to_thread(app.state.runs.existing_ids, [item.get("run_id", "")])
        return {**item, "run_available": item.get("run_id", "") in available}

    @router.get("/api/artifacts")
    async def list_artifacts(session_key: str | None = None, type: str | None = None, status: str | None = None, limit: int = 50, view: str = "active", cursor: str | None = None,
                             created_by: str | None = None):
        if view not in ("active","trash"): raise HTTPException(422,"未知的报告中心视图")
        items=await asyncio.to_thread(app.state.artifacts.list,session_key=session_key,type=type,status=status,limit=limit,view=view,cursor=cursor,created_by=created_by)
        available=await asyncio.to_thread(app.state.runs.existing_ids,[item["run_id"] for item in items])
        return [{**item,"run_available":item["run_id"] in available} for item in items]

    def match_revision(request: Request):
        value=request.headers.get("if-match")
        if value is None: raise HTTPException(428,"修改报告需要 If-Match")
        if not re.fullmatch(r'"[0-9]+"',value): raise HTTPException(400,"If-Match 格式无效")
        return int(value[1:-1])

    def may_delete(request: Request, item: dict) -> bool:
        """Moving a report to the recycle bin or purging it is for its author or an administrator
        (user, 2026-10-20). Reports from before authorship was recorded are the administrator's."""
        username, role = request.state.user[:2]
        return role == "admin" or (bool(item.get("created_by")) and item["created_by"] == username)

    async def lifecycle_change(artifact_id, action, request):
        if action in ("trash", "purge"):
            try:
                item = await asyncio.to_thread(app.state.artifacts.get, artifact_id, include_trashed=True)
            except KeyError as exc:
                raise HTTPException(404, "报告中心没有这条记录") from exc
            except HTTPException as exc:
                if exc.status_code != 410:
                    raise
                item = None  # already purged: the store answers that itself
            if item is not None and not may_delete(request, item):
                raise HTTPException(403, "只有报告的生成人或管理员可以删除")
        try:
            result=await asyncio.to_thread(app.state.artifacts.transition,artifact_id,action,match_revision(request))
        except KeyError as exc: raise HTTPException(404,"报告中心没有这条记录") from exc
        return JSONResponse(result,headers={"Cache-Control":"no-store",**({"ETag":f'"{result["revision"]}"'} if "revision" in result else {})})

    @router.delete("/api/artifacts/{artifact_id}")
    async def trash_artifact(artifact_id: str, request: Request):
        return await lifecycle_change(artifact_id,"trash",request)
    @router.post("/api/artifacts/{artifact_id}/restore")
    async def restore_artifact(artifact_id: str, request: Request):
        return await lifecycle_change(artifact_id,"restore",request)
    @router.delete("/api/artifacts/{artifact_id}/purge")
    async def purge_artifact(artifact_id: str, request: Request):
        return await lifecycle_change(artifact_id,"purge",request)

    @router.post("/api/artifacts", status_code=201)
    async def create_artifact(payload: ArtifactCreate):
        """Save only the exact completed chat output as an original answer snapshot."""
        try:
            snapshot = await asyncio.to_thread(app.state.runs.get, payload.run_id)
        except KeyError as exc:
            raise HTTPException(422, "该次回答没有运行记录，不能保存到报告中心") from exc
        if payload.type != "answer_snapshot" or snapshot.get("run_type") != "chat":
            raise HTTPException(422, "此入口只能保存问答运行的回答快照")
        if snapshot.get("status") != "completed":
            raise HTTPException(422, "运行尚未完成，不能保存原始回答快照")
        if snapshot.get("metrics", {}).get("report_brief") is not None:
            raise HTTPException(422, "报告需求说明不是报告正文，请生成报告后打开报告")
        expected_hash = snapshot.get("answer_sha256")
        if not expected_hash:
            raise HTTPException(422, "该运行没有可核验的输出；旧运行不能保存为原始回答快照")
        if hashlib.sha256(payload.markdown.encode("utf-8")).hexdigest() != expected_hash:
            raise HTTPException(422, "保存的正文与该次回答不一致")
        if payload.session_key is not None and payload.session_key != snapshot.get("session_key", ""):
            raise HTTPException(422, "保存的会话与来源回答不一致")
        if payload.corpus_ids is not None and payload.corpus_ids != snapshot.get("effective_corpus_ids", []):
            raise HTTPException(422, "保存的资料库范围与来源回答不一致")
        title = payload.title.strip() or (payload.markdown.strip().splitlines() or ["未命名回答"])[0][:60]
        created = await asyncio.to_thread(
            app.state.artifacts.create, uuid4().hex, type="answer_snapshot", title=title,
            markdown=payload.markdown, session_key=snapshot.get("session_key", ""),
            run_id=payload.run_id, corpus_ids=snapshot.get("effective_corpus_ids", []),
            task_id=snapshot.get("task_id", ""), task_version=snapshot.get("task_version"),
            citations=snapshot.get("citations", []),
            source_verification="verified")
        return created

    @router.get("/api/artifacts/{artifact_id}")
    async def get_artifact(artifact_id: str, version: int | None = None, include_trashed: bool = False):
        item=await resolve_artifact(artifact_id,version,include_trashed)
        return JSONResponse(item,headers={"ETag":f'"{item["revision"]}"',"Cache-Control":"no-store"})

    @router.get("/api/artifacts/{artifact_id}/versions")
    async def list_artifact_versions(artifact_id: str, include_trashed: bool = False):
        item=await resolve_artifact(artifact_id,include_trashed=include_trashed)
        return await asyncio.to_thread(app.state.artifacts.list_versions,item["artifact_id"],include_trashed=include_trashed)

    @router.post("/api/artifacts/{artifact_id}/versions", status_code=201)
    async def add_artifact_version(artifact_id: str, payload: ArtifactVersionCreate, request: Request):
        current = await resolve_artifact(artifact_id)
        artifact_id = current["artifact_id"]
        if current["status"] == "generating":
            raise HTTPException(409, "报告生成中，不能编辑")
        if current["status"] == "failed" and payload.status != "draft":
            raise HTTPException(409, "未完成的报告须先保存为草稿再完成")
        try:
            return await asyncio.to_thread(app.state.artifacts.add_version, artifact_id,
                                           markdown=payload.markdown, citations=current["citations"],
                                           status=payload.status, revision=match_revision(request))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    async def figure_candidates_for_artifact(artifact_id: str) -> list[dict]:
        item = await resolve_artifact(artifact_id)
        if item["type"] != "report" or item.get("legacy") or len(item["corpus_ids"]) != 1:
            raise HTTPException(422, "该报告没有可替换的原 PDF 图片")
        reports = await asyncio.to_thread(app.state.artifacts.list_reports, run_id=item["run_id"], limit=1)
        if not reports:
            raise HTTPException(422, "来源报告未记录")
        report = await asyncio.to_thread(app.state.artifacts.get_report, reports[0]["report_id"])
        visible = report["params"].get("visible_sources") or []
        info = await asyncio.to_thread(find_corpus, item["corpus_ids"][0])
        if not info or not visible:
            return []
        knowledge = knowledge_for(info)
        return await asyncio.to_thread(select_figures, knowledge, info, visible, report["markdown"], 12, False)

    @router.get("/api/artifacts/{artifact_id}/figure-candidates")
    async def artifact_figure_candidates(artifact_id: str):
        candidates = await figure_candidates_for_artifact(artifact_id)
        return [{key: value for key, value in figure.items() if key != "bytes"} for figure in candidates]

    async def change_artifact_figure(artifact_id: str, figure_id: str, replacement: dict | None, revision: int):
        item = await resolve_artifact(artifact_id)
        if item["type"] != "report" or item.get("legacy") or item["status"] == "generating":
            raise HTTPException(409, "当前报告不能修改图片")
        old = next((figure for figure in item["figures"] if figure["figure_id"] == figure_id), None)
        if not old:
            raise HTTPException(404, "图片不属于当前报告版本")
        if replacement and replacement["figure_id"] == figure_id:
            raise HTTPException(422, "请选择另一张图片")
        if replacement and any(figure["figure_id"] == replacement["figure_id"] for figure in item["figures"]):
            raise HTTPException(422, "该图片已在当前报告中")
        try:
            markdown = change_figure(item["markdown"], old, replacement)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        figures = [figure for figure in item["figures"] if figure["figure_id"] != figure_id]
        if replacement:
            figures.append(replacement)
        return await asyncio.to_thread(app.state.artifacts.add_version, artifact_id,
                                       markdown=markdown, citations=item["citations"],
                                       status="completed", figures=figures, revision=revision)

    @router.delete("/api/artifacts/{artifact_id}/figures/{figure_id}", status_code=201)
    async def remove_artifact_figure(artifact_id: str, figure_id: str, request: Request):
        return await change_artifact_figure(artifact_id, figure_id, None, match_revision(request))

    @router.post("/api/artifacts/{artifact_id}/figures/{figure_id}/replace", status_code=201)
    async def replace_artifact_figure(artifact_id: str, figure_id: str, payload: FigureReplaceRequest, request: Request):
        current = await resolve_artifact(artifact_id)
        old = next((item for item in current.get("figures", []) if item["figure_id"] == figure_id), None)
        if not old:
            raise HTTPException(404, "图片不属于当前报告版本")
        candidates = await figure_candidates_for_artifact(artifact_id)
        replacement = next((item for item in candidates if item["figure_id"] == payload.figure_id
                            and item["doc_id"] == old["doc_id"] and item["citation"] == old["citation"]), None)
        if not replacement:
            raise HTTPException(422, "候选图片必须来自该处论点引用的同一份资料")
        return await change_artifact_figure(artifact_id, figure_id, replacement, match_revision(request))

    @router.get("/api/artifacts/{artifact_id}/export")
    async def export_artifact(artifact_id: str, format: str = "md", version: int | None = None):
        item = await resolve_artifact(artifact_id, version)
        artifact_id = item["artifact_id"]
        filename = artifact_id.replace(":", "-")
        images = {}
        for figure in item.get("figures", []):
            extension = "png" if figure["media_type"] == "image/png" else "jpg"
            try:
                data, _ = await asyncio.to_thread(app.state.artifacts.image, artifact_id,
                                                   item["version"], figure["figure_id"])
            except KeyError as exc:
                raise HTTPException(409, "报告图片附件缺失") from exc
            images[f"figures/{figure['figure_id']}.{extension}"] = data
        if format == "md":
            if images:
                raise HTTPException(422, "图文报告请下载 Markdown + 图片 ZIP")
            return Response(item["markdown"], media_type="text/markdown; charset=utf-8",
                            headers={"Content-Disposition": f'attachment; filename="{filename}.md"'})
        if format == "docx":
            try:
                data = await asyncio.to_thread(markdown_to_docx, item["markdown"], images, item.get("citations") or [])
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
            return Response(data, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'})
        if format == "zip" and images:
            output = io.BytesIO()
            with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
                bundle.writestr("report.md", item["markdown"])
                for name, data in images.items():
                    bundle.writestr(name, data)
            return Response(output.getvalue(), media_type="application/zip",
                            headers={"Content-Disposition": f'attachment; filename="{filename}.zip"'})
        raise HTTPException(422, "可导出 md / docx；图文报告还可导出 zip")

    @router.get("/api/artifacts/{artifact_id}/versions/{version}/figures/{figure_id}")
    async def artifact_figure(artifact_id: str, version: int, figure_id: str, include_trashed: bool = False):
        try:
            data, media_type = await asyncio.to_thread(app.state.artifacts.image, artifact_id, version, figure_id, include_trashed=include_trashed)
        except KeyError as exc:
            raise HTTPException(404, "报告图片不存在") from exc
        return Response(data, media_type=media_type, headers={"Cache-Control": "no-store"})

    @router.get("/api/reports/{report_id}/export")
    async def export_report(report_id: str, format: str = "md"):
        report = await get_report(report_id)
        return await export_artifact(report["artifact_id"],format,report["generated_version"])


    app.include_router(router)
