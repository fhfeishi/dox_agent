"""Shared analysis assets: prompt skills, analysis tasks and report templates."""

import asyncio

from fastapi import APIRouter, HTTPException

from ..auth import ADMIN_ONLY
from ..custom_tasks import (
    TaskConflict,
    TaskInvalid,
    TaskMissing,
)
from ..custom_templates import (
    TemplateConflict,
    TemplateMissing,
)
from ..prompt_skills import (
    AssetConflict,
    AssetInvalid,
    AssetMissing,
    render_skill,
    validate_asset,
)
from ..prompts import list_tasks, list_templates
from .common import (
    AssetCreate,
    AssetDraft,
    AssetRevision,
    AssetTest,
    TaskCopy,
    TaskDraft,
    TaskPublish,
    TemplateCopy,
    TemplateDraft,
    TemplatePublish,
)


def install(app, ctx):
    router = APIRouter()

    @router.get("/api/prompt-skills")
    async def list_prompt_skills(include_archived: bool = False):
        items = await asyncio.to_thread(app.state.prompt_skills.list, include_archived)
        for item in items:
            if item["kind"] == "skill":
                item["referenced_by"] = await asyncio.to_thread(app.state.custom_tasks.referenced_by_skill, item["id"])
        return items

    @router.post("/api/prompt-skills", dependencies=ADMIN_ONLY, status_code=201)
    async def create_prompt_skill(payload: AssetCreate):
        try:
            return await asyncio.to_thread(app.state.prompt_skills.create, payload.kind, payload.source_id)
        except AssetMissing as exc:
            raise HTTPException(404, str(exc)) from exc
        except AssetInvalid as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.get("/api/prompt-skills/{asset_id}")
    async def get_prompt_skill(asset_id: str):
        try:
            return await asyncio.to_thread(app.state.prompt_skills.get, asset_id)
        except AssetMissing as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.get("/api/prompt-skills/{asset_id}/versions/{version}")
    async def get_prompt_skill_version(asset_id: str, version: int):
        try:
            return await asyncio.to_thread(app.state.prompt_skills.version, asset_id, version)
        except AssetMissing as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.put("/api/prompt-skills/{asset_id}/draft", dependencies=ADMIN_ONLY)
    async def save_prompt_skill(asset_id: str, payload: AssetDraft):
        try:
            return await asyncio.to_thread(app.state.prompt_skills.save, asset_id, payload.revision,
                                           payload.model_dump(exclude={"revision"}, exclude_unset=True))
        except AssetMissing as exc:
            raise HTTPException(404, str(exc)) from exc
        except AssetConflict as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.post("/api/prompt-skills/{asset_id}/publish", dependencies=ADMIN_ONLY)
    async def publish_prompt_skill(asset_id: str, payload: AssetRevision):
        try:
            return await asyncio.to_thread(app.state.prompt_skills.publish, asset_id, payload.revision)
        except AssetMissing as exc:
            raise HTTPException(404, str(exc)) from exc
        except AssetConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except AssetInvalid as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.post("/api/prompt-skills/{asset_id}/enable", dependencies=ADMIN_ONLY)
    async def enable_prompt_skill(asset_id: str):
        return await set_prompt_skill_enabled(asset_id, True)

    @router.post("/api/prompt-skills/{asset_id}/disable", dependencies=ADMIN_ONLY)
    async def disable_prompt_skill(asset_id: str):
        return await set_prompt_skill_enabled(asset_id, False)

    async def set_prompt_skill_enabled(asset_id: str, enabled: bool):
        try:
            return await asyncio.to_thread(app.state.prompt_skills.set_enabled, asset_id, enabled)
        except AssetMissing as exc:
            raise HTTPException(404, str(exc)) from exc
        except AssetInvalid as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.post("/api/prompt-skills/{asset_id}/archive", dependencies=ADMIN_ONLY)
    async def archive_prompt_skill(asset_id: str):
        try:
            return await asyncio.to_thread(app.state.prompt_skills.archive, asset_id)
        except AssetMissing as exc:
            raise HTTPException(404, str(exc)) from exc
        except AssetInvalid as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.post("/api/prompt-skills/{asset_id}/test", dependencies=ADMIN_ONLY)
    async def test_prompt_skill(asset_id: str, payload: AssetTest):
        try:
            item = await asyncio.to_thread(app.state.prompt_skills.get, asset_id)
            if item["kind"] != "skill":
                raise AssetInvalid("只有 Skill 可以测试")
            prompt = await asyncio.to_thread(app.state.prompt_skills.version, item["prompt_id"], item["prompt_version"])
            validate_asset(item, prompt)
            rendered = render_skill(item, prompt, payload.inputs)
            stages = (["检索"] if "knowledge_search" in item["tools"] else []) + (["阅读"] if "knowledge_read" in item["tools"] else []) + ["回答"]
            return {"rendered_prompt": rendered, "stages": stages,
                    "structure_valid": True, "model_executed": False}
        except AssetMissing as exc:
            raise HTTPException(404, str(exc)) from exc
        except AssetInvalid as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.get("/api/tasks")
    async def tasks(include_archived: bool = False):
        return [{**task, "kind": "builtin", "status": "published", "version": 0}
                for task in list_tasks()] + await asyncio.to_thread(app.state.custom_tasks.list,
                                                                       include_archived=include_archived)

    @router.post("/api/tasks/custom", dependencies=ADMIN_ONLY, status_code=201)
    async def copy_task(payload: TaskCopy):
        try:
            return await asyncio.to_thread(app.state.custom_tasks.copy_builtin, payload.source_task_id)
        except TaskMissing as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.delete("/api/tasks/custom/{task_id}", dependencies=ADMIN_ONLY, status_code=204)
    async def delete_task(task_id: str):
        try:
            await asyncio.to_thread(app.state.custom_tasks.delete, task_id)
        except TaskMissing as exc:
            raise HTTPException(404, str(exc)) from exc
        except TaskConflict as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.post("/api/tasks/custom/{task_id}/archive", dependencies=ADMIN_ONLY)
    async def archive_task(task_id: str):
        try:
            return await asyncio.to_thread(app.state.custom_tasks.archive, task_id)
        except TaskMissing as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.post("/api/tasks/custom/{task_id}/restore", dependencies=ADMIN_ONLY)
    async def restore_task(task_id: str):
        try:
            return await asyncio.to_thread(app.state.custom_tasks.restore, task_id)
        except TaskMissing as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.get("/api/tasks/custom/{task_id}")
    async def custom_task(task_id: str):
        try:
            return await asyncio.to_thread(app.state.custom_tasks.get, task_id)
        except TaskMissing as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.get("/api/tasks/custom/{task_id}/versions/{version}")
    async def custom_task_version(task_id: str, version: int):
        try:
            return await asyncio.to_thread(app.state.custom_tasks.version, task_id, version)
        except TaskMissing as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.put("/api/tasks/custom/{task_id}/draft", dependencies=ADMIN_ONLY)
    async def save_task_draft(task_id: str, payload: TaskDraft):
        changes = payload.model_dump(exclude={"revision"}, exclude_unset=True)
        if payload.parameters is not None and payload.parameter_defaults is not None and (
            {item.key for item in payload.parameters} & payload.parameter_defaults.keys()
        ):
            raise HTTPException(422, "参数名称与旧文本默认值重复")
        if payload.parameters is not None and len({item.key for item in payload.parameters}) != len(payload.parameters):
            raise HTTPException(422, "参数名称不能重复")
        try:
            return await asyncio.to_thread(app.state.custom_tasks.save_draft, task_id, payload.revision, changes)
        except TaskMissing as exc:
            raise HTTPException(404, str(exc)) from exc
        except TaskConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except TaskInvalid as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.post("/api/tasks/custom/{task_id}/publish", dependencies=ADMIN_ONLY)
    async def publish_task(task_id: str, payload: TaskPublish):
        try:
            return await asyncio.to_thread(app.state.custom_tasks.publish, task_id, payload.revision)
        except TaskMissing as exc:
            raise HTTPException(404, str(exc)) from exc
        except TaskConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except TaskInvalid as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.get("/api/templates")
    async def templates(include_archived: bool = False):
        """W1/W4-B: built-in catalogue plus custom template drafts/published versions."""
        builtins = [{**item, "kind": "builtin", "status": "published", "version": 0}
                    for item in list_templates()]
        custom = await asyncio.to_thread(app.state.custom_templates.list,
                                         include_archived=include_archived)
        return builtins + custom

    @router.post("/api/templates/custom", status_code=201)
    async def copy_template(payload: TemplateCopy):
        try:
            return await asyncio.to_thread(app.state.custom_templates.copy_builtin, payload.source_template_id)
        except TemplateMissing as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.delete("/api/templates/custom/{template_id}", status_code=204)
    async def delete_template(template_id: str):
        try:
            await asyncio.to_thread(app.state.custom_templates.delete, template_id)
        except TemplateMissing as exc:
            raise HTTPException(404, str(exc)) from exc
        except TemplateConflict as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.post("/api/templates/custom/{template_id}/archive")
    async def archive_template(template_id: str):
        try:
            return await asyncio.to_thread(app.state.custom_templates.archive, template_id)
        except TemplateMissing as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.post("/api/templates/custom/{template_id}/restore")
    async def restore_template(template_id: str):
        try:
            return await asyncio.to_thread(app.state.custom_templates.restore, template_id)
        except TemplateMissing as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.get("/api/templates/custom/{template_id}")
    async def custom_template(template_id: str):
        try:
            return await asyncio.to_thread(app.state.custom_templates.get, template_id)
        except TemplateMissing as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.get("/api/templates/custom/{template_id}/versions/{version}")
    async def custom_template_version(template_id: str, version: int):
        try:
            return await asyncio.to_thread(app.state.custom_templates.version, template_id, version)
        except TemplateMissing as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.put("/api/templates/custom/{template_id}/draft")
    async def save_template_draft(template_id: str, payload: TemplateDraft):
        changes = payload.model_dump(exclude={"revision"}, exclude_unset=True)
        try:
            return await asyncio.to_thread(app.state.custom_templates.save_draft,
                                           template_id, payload.revision, changes)
        except TemplateMissing as exc:
            raise HTTPException(404, str(exc)) from exc
        except TemplateConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.post("/api/templates/custom/{template_id}/publish")
    async def publish_template(template_id: str, payload: TemplatePublish):
        try:
            return await asyncio.to_thread(app.state.custom_templates.publish, template_id, payload.revision)
        except TemplateMissing as exc:
            raise HTTPException(404, str(exc)) from exc
        except TemplateConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.get("/api/templates/{template_id}")
    async def template_detail(template_id: str, version: int | None = None):
        """W1/W4-B: built-in structure or a custom published version, for the inspector preview."""
        builtin = next((item for item in list_templates() if item["id"] == template_id), None)
        if builtin is not None:
            return {**builtin, "kind": "builtin", "variables": [], "version": 0}
        try:
            return await asyncio.to_thread(app.state.custom_templates.version, template_id, version)
        except TemplateMissing as exc:
            raise HTTPException(404, "报告模板不存在") from exc

    app.include_router(router)
