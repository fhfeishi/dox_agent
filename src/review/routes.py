"""形式审查 API：/api/review/* 前缀挂载，与既有接口语义隔离。

删减说明（2026-09-29 裁决）：删除 /documents/sample 样例端点、use_model=false 独立程序
核对路径、local_review 关键词本地评议；TrustedHost/Origin 与静态托管由主应用提供。
存储初始化与中断任务恢复由 init_storage() 在主应用 lifespan 中调用。
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from . import audit, guidelines, metadata
from . import storage as db
from .export import export_report
from .model_client import Client, ModelError, config, model_configured
from .models import EvidenceInput, MetadataUpdate, ResearchQuery, ReviewRequest, RulePack
from .parser import parse_document
from .presentation import present_report
from .research import search_crossref

logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=2)
metadata_executor = ThreadPoolExecutor(max_workers=2)
metadata_lock = threading.RLock()

router = APIRouter(prefix="/api/review")


def init_storage():
    db.init()


def require(kind, id):
    value = db.get(kind, id)
    if not value:
        raise HTTPException(404, "记录不存在。")
    return value


def public_doc(doc):
    return {k: v for k, v in doc.items() if k not in ("pages", "path")}


def extract_document_metadata(id, revision):
    def progress(index, total):
        with metadata_lock:
            current = require("document", id)
            current["metadata_extraction"].update(stage_label=f"模型提取基本信息 · {index}/{total} 块")
            db.save("document", current)

    try:
        doc = require("document", id)
        result = metadata.extract(doc, progress=progress)
        with metadata_lock:
            current = require("document", id)
            result["extraction"]["finished_at"] = db.now()
            if current.get("metadata_revision", 0) == revision:
                current["metadata"] = result["metadata"]
                current.pop("confirmed_at", None)
            else:
                result["extraction"]["notes"].append("识别期间你已修改字段，已保留手工输入；模型建议值仅保存在识别记录中。")
            current["metadata_extraction"] = {**result["extraction"], "suggested_metadata": result["metadata"]}
            db.save("document", current)
    except Exception as e:
        with metadata_lock:
            current = require("document", id)
            current["metadata_extraction"] = {
                "status": "failed",
                "method": "model",
                "error": str(e) if isinstance(e, ModelError) else "基本信息提取失败，文件已保存；可重试或手工填写。",
                "finished_at": db.now(),
            }
            db.save("document", current)


def start_metadata(id):
    with metadata_lock:
        doc = require("document", id)
        if doc.get("metadata_extraction", {}).get("status") == "running":
            return public_doc(doc)
        if not model_configured():
            doc["metadata_extraction"] = {
                "status": "unavailable", "method": "model",
                "error": "审查模型尚未配置，未执行模型提取。可配置后重试或手动填写。",
            }
            db.save("document", doc)
            return public_doc(doc)
        revision = doc.get("metadata_revision", 0)
        doc["metadata_extraction"] = {"status": "running", "method": "model", "stage_label": "等待模型读取申请书"}
        db.save("document", doc)
        metadata_executor.submit(extract_document_metadata, id, revision)
    return public_doc(require("document", id))


def ingest(path, name, id=None):
    parsed = parse_document(path, extract_fields=False)
    id = id or uuid.uuid4().hex
    doc = {
        **parsed, "id": id, "filename": name, "path": str(path), "created_at": db.now(),
        "page_count": len(parsed["pages"]), "metadata_revision": 0,
    }
    db.save("document", doc)
    return start_metadata(id)


def connection_id(settings):
    return hashlib.sha256(json.dumps([settings["base"], settings["model"], settings["key"]]).encode()).hexdigest()


def connection_state(settings):
    record = db.get("model_connection", connection_id(settings)) or {}
    return {"model_connection": record.get("status", "untested"), "model_tested_at": record.get("tested_at")}


@router.get("/health")
def health():
    settings = config()
    return {
        **connection_state(settings),
        "ok": True,
        "app_id": "dox-agent-review",
        "model_configured": model_configured(),
        "model_name": settings["model"],
        "provider": "OpenAI 兼容模型服务",
    }


@router.post("/model/test")
def test_connection():
    if not model_configured():
        raise HTTPException(400, "请先配置 MODEL_API_KEY（或 REVIEW_MODEL_*）。")
    client = Client()
    try:
        client.ask("00_plan", {
            "sources": [],
            "note": "连接测试，不包含指南。返回 JSON：空 checks 数组、空 notes 数组。",
        })
        db.save("model_connection", {"id": connection_id(client.settings), "status": "connected", "tested_at": db.now()})
        return {"ok": True, **connection_state(client.settings), "model": client.settings["model"], "message": "模型连接及 JSON 输出测试成功。"}
    except ModelError as e:
        db.save("model_connection", {"id": connection_id(client.settings), "status": "failed", "tested_at": db.now()})
        raise HTTPException(502, str(e))


@router.get("/documents")
def documents():
    return [public_doc(d) for d in db.all_items("document")]


async def persist_upload(file: UploadFile, folder: str):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".pdf", ".doc", ".docx"):
        raise HTTPException(400, "仅支持 PDF、DOC 和 DOCX。")
    id = uuid.uuid4().hex
    path = db.DATA / folder / (id + suffix)
    path.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    try:
        with path.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > 30 * 1024 * 1024:
                    raise HTTPException(413, "文件请控制在 30 MB 以内。")
                target.write(chunk)
        if size == 0:
            raise HTTPException(400, "文件为空。")
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    return id, path


@router.post("/documents")
async def upload_document(file: UploadFile = File(...)):
    name = Path(file.filename or "申请书").name
    id, path = await persist_upload(file, "uploads")
    try:
        return await run_in_threadpool(ingest, path, name, id)
    except Exception as e:
        path.unlink(missing_ok=True)
        raise HTTPException(400, str(e) if isinstance(e, ValueError) else "文件无法解析，请检查是否为完整且未加密的 PDF / DOCX。")


@router.get("/documents/{id}")
def document(id: str):
    return public_doc(require("document", id))


@router.post("/documents/{id}/extract")
def reextract_document(id: str):
    return start_metadata(id)


@router.patch("/documents/{id}")
def update_document(id: str, meta: MetadataUpdate):
    with metadata_lock:
        doc = require("document", id)
        doc["metadata"] = meta.model_dump(mode="json")
        doc["confirmed_at"] = db.now()
        doc["metadata_revision"] = doc.get("metadata_revision", 0) + 1
        db.save("document", doc)
        return public_doc(doc)


@router.get("/documents/{id}/pages")
def pages(id: str):
    return require("document", id)["pages"]


@router.get("/documents/{id}/file")
def original(id: str):
    doc = require("document", id)
    media = "application/pdf" if doc["kind"] == "pdf" else (
        "application/msword" if doc["kind"] == "doc"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return FileResponse(doc["path"], media_type=media, content_disposition_type="inline", filename=doc["filename"])


@router.get("/rules")
def rules():
    return db.all_items("rule")


@router.post("/rules")
def save_rule(rule: RulePack):
    data = rule.model_dump(mode="json")
    old = db.get("rule", rule.id)
    data["version"] = (old["version"] + 1) if old else 1
    db.save("rule_version", {
        "id": f'{data["id"]}-v{data["version"]}',
        **{k: v for k, v in data.items() if k != "id"},
        "rule_id": data["id"],
    })
    return db.save("rule", data)


@router.post("/rules/validate")
def validate_rule(rule: RulePack):
    return rule.model_dump(mode="json")


@router.post("/guidelines/plan")
async def plan_guidelines(files: list[UploadFile] = File(...)):
    if not model_configured():
        raise HTTPException(400, "请先配置审查模型，检查清单由大模型生成。")
    if not 1 <= len(files) <= 5:
        raise HTTPException(400, "每次请上传1至5份相关指南。")
    documents = []
    for file in files:
        name = Path(file.filename or "指南").name
        gid, path = await persist_upload(file, "guidelines")
        try:
            parsed = await run_in_threadpool(parse_document, path)
        except ValueError as e:
            raise HTTPException(400, str(e))
        guide = {**parsed, "id": gid, "filename": name, "path": str(path)}
        db.save("guideline", guide)
        documents.append(guide)
    try:
        draft = await run_in_threadpool(guidelines.generate, documents)
        db.save("rule", draft)
        return draft
    except ModelError as e:
        raise HTTPException(502, str(e))


@router.get("/guidelines/{id}/file")
def guideline_file(id: str):
    guide = require("guideline", id)
    return FileResponse(guide["path"], filename=guide["filename"])


@router.post("/rules/preview")
async def preview_rule(file: UploadFile = File(...)):
    return await plan_guidelines([file])


@router.get("/evidence")
def evidence():
    return db.all_items("evidence")


@router.post("/evidence")
def add_evidence(item: EvidenceInput):
    return db.save("evidence", {
        "id": uuid.uuid4().hex,
        **item.model_dump(mode="json"),
        "origin": "用户录入 · 内容待人工核实",
        "verified": False,
    })


@router.post("/research")
def research(q: ResearchQuery):
    try:
        return search_crossref(q.query, q.cutoff.isoformat())
    except Exception:
        raise HTTPException(502, "公开文献检索暂不可用。可改用本地证据或手动录入，不影响规范审核。")


STAGES = audit.STAGES


def run_review(id, doc, rule, req, evidence):
    run = require("run", id)

    def progress(step, label=None):
        run.update(stage=step, stage_label=label or STAGES[step])
        db.save("run", run)

    try:
        client = Client()
        run["audit"] = {"provider": "OpenAI 兼容模型服务", "model": client.settings["model"], "calls": client.calls}
        guides = [require("guideline", gid) for gid in rule.get("guideline_ids", [])]
        run.update(audit.review(doc, rule, evidence, req["cutoff_date"], progress, client, guides))
        counts = {status: sum(f["status"] == status for f in run["findings"]) for status in ["pass", "issue", "warning", "pending", "na"]}
        run.update(status="completed", summary=counts, finished_at=db.now())
        db.save("run", run)
        output = db.DATA / "reports" / id
        output.mkdir(parents=True, exist_ok=True)
        (output / "report.json").write_text(json.dumps(run, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        logger.warning("Review failed: %s", type(e).__name__)
        message = str(e) if isinstance(e, ModelError) else "模型结果结构或审核过程异常，未形成完整报告，请检查材料后重试。"
        run.update(status="failed", error=message, finished_at=db.now())
        db.save("run", run)


@router.post("/runs")
def new_run(req: ReviewRequest):
    doc = require("document", req.document_id)
    rule = require("rule", req.rule_id)
    if doc.get("metadata_extraction", {}).get("status") == "running":
        raise HTTPException(409, "基本信息仍在提取，请完成后核对再开始审核。")
    if not doc["metadata"].get("title", "").strip():
        raise HTTPException(400, "请先确认并填写项目名称。")
    if not rule.get("confirmed"):
        raise HTTPException(400, "检查清单仍为草稿，请先核对并启用。")
    if not any(c.get("enabled", True) for c in rule.get("checks", [])):
        raise HTTPException(400, "请至少启用一个指南检查项。")
    if not model_configured():
        raise HTTPException(400, "请先配置审查模型（MODEL_API_KEY 或 REVIEW_MODEL_*）。")
    if sum(r["status"] == "running" for r in db.all_items("run")) >= 2:
        raise HTTPException(429, "已有两个审核任务在执行，请稍后再试。")
    id = uuid.uuid4().hex
    data = req.model_dump(mode="json")
    items = db.all_items("evidence")
    if req.evidence_ids:
        items = [e for e in items if e["id"] in req.evidence_ids]
    run = {
        "id": id, "created_at": db.now(), "status": "running", "stage": 0,
        "stage_label": STAGES[0], "request": data, "rule": rule,
        "document": public_doc(doc), "findings": [],
    }
    db.save("run", run)
    executor.submit(run_review, id, doc, rule, data, items)
    return run


@router.get("/runs")
def runs():
    return [{k: v for k, v in r.items() if k not in ("findings", "technical", "budget")} for r in db.all_items("run")]


@router.get("/runs/{id}")
def run(id: str):
    return present_report(require("run", id))


@router.get("/runs/{id}/export/{kind}")
def download(id: str, kind: str):
    run = require("run", id)
    if run["status"] != "completed":
        raise HTTPException(409, "审核尚未完成。")
    output = db.DATA / "reports" / id
    output.mkdir(parents=True, exist_ok=True)
    if kind == "docx":
        path = export_report(run, output / "report.docx")
        return FileResponse(path, filename="申请书预审报告.docx")
    if kind == "json":
        path = output / "report.json"
        path.write_text(json.dumps(run, ensure_ascii=False, indent=2), encoding="utf-8")
        return FileResponse(path, filename="审核结果.json")
    raise HTTPException(404, "不支持该导出格式。")
