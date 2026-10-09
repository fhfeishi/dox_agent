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

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from . import audit, guidelines, metadata, sections, templates
from . import storage as db
from .export import export_report
from .model_client import Client, ModelError, config, model_configured
from .models import EvidenceInput, MappingUpdate, MetadataUpdate, ResearchQuery, ReviewRequest, RulePack
from .parser import parse_document
from .presentation import present_report
from .research import redact, search_crossref

logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=2)
metadata_executor = ThreadPoolExecutor(max_workers=2)
metadata_lock = threading.RLock()

router = APIRouter(prefix="/api/review")


def init_storage(path):
    # Review data lives under the app's own state directory, never a process-wide default.
    db.DATA = Path(path).resolve()
    db.init()
    for rule in templates.builtins():
        old = db.get("rule", rule["id"])
        if old and all(old.get(k) == rule[k] for k in ("name", "scope_note", "checks")):
            continue
        # Built-in examples change only with code; each change is a new readable version.
        publish(rule, old)


def publish(data, old):
    data["version"] = (old["version"] + 1) if old else 1
    db.save("rule_version", {
        "id": f'{data["id"]}-v{data["version"]}',
        **{k: v for k, v in data.items() if k != "id"},
        "rule_id": data["id"],
    })
    return db.save("rule", data)


def require(kind, id):
    value = db.get(kind, id)
    if not value:
        raise HTTPException(404, "记录不存在。")
    return value


def public_doc(doc):
    return {k: v for k, v in doc.items() if k not in ("pages", "path", "blocks")}


def blank(value):
    return value in (None, "", [])


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
            suggested = result["metadata"]
            if current.get("confirmed_at") or current.get("metadata_revision", 0) != revision:
                # Confirmed or edited values are never replaced; differences stay as suggestions.
                differ = [f for f, v in suggested.items() if not blank(v) and current["metadata"].get(f) != v]
                result["extraction"]["notes"].append(
                    "已保留人工确认或修改的字段；模型建议仅作参考" + (f"，与当前值不同：{'、'.join(differ)}。" if differ else "。"))
            else:
                # Unconfirmed: fill empty fields only, so earlier manual entry survives a re-run.
                current["metadata"] = {**current["metadata"], **{f: v for f, v in suggested.items()
                                                                if not blank(v) and blank(current["metadata"].get(f))}}
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
    if suffix not in (".pdf", ".doc", ".docx", ".md", ".txt"):
        raise HTTPException(400, "仅支持 PDF、DOC、DOCX、Markdown 和 TXT。")
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
        doc["metadata"]["organizations"] = list(dict.fromkeys(n.strip() for n in meta.organizations if n.strip()))
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
    media = {"pdf": "application/pdf", "doc": "application/msword", "md": "text/markdown; charset=utf-8",
             "txt": "text/plain; charset=utf-8"}.get(doc["kind"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return FileResponse(doc["path"], media_type=media, content_disposition_type="inline", filename=doc["filename"])


@router.get("/rules")
def rules():
    return db.all_items("rule")


@router.post("/rules")
def save_rule(rule: RulePack):
    data = rule.model_dump(mode="json")
    if data["id"].startswith("builtin-") or data["source_kind"] == "builtin":
        raise HTTPException(403, "内置模板只读，请复制后编辑。")
    old = db.get("rule", rule.id)
    if old and old.get("kind") and old["kind"] != data["kind"]:
        raise HTTPException(422, "已保存模板不能改变审查类型，请另存为新模板。")
    known = [c["original"] for v in db.all_items("rule_version") for c in v.get("checks", []) if c.get("original")]
    templates.preserve_origins(data, old, known)
    if data["confirmed"]:
        try:
            templates.validate_enabled(data)
        except ValueError as e:
            raise HTTPException(422, str(e))
    return publish(data, old)


@router.get("/rules/{id}/versions/{version}")
def rule_version(id: str, version: int):
    return require("rule_version", f"{id}-v{version}")


def proposal_blocks(doc):
    if "blocks" not in doc:
        raise HTTPException(409, "该申请书在章节识别功能之前上传，请重新上传以识别章节。")
    return doc["blocks"]


@router.get("/documents/{id}/mappings")
def mappings(id: str, rule_id: str):
    doc, rule = require("document", id), require("rule", rule_id)
    blocks = proposal_blocks(doc)
    saved = db.get("mapping", f"{id}:{rule_id}") or {}
    return {"rule_id": rule_id, "rule_version": rule["version"], "revision": saved.get("revision", 0),
            "saved_at": saved.get("saved_at"), "algorithm": sections.ALGORITHM_NOTE,
            "mappings": sections.effective(blocks, rule, saved),
            "blocks": [{"id": b["id"], "page": b["page"], "level": b["level"], "image": b.get("image", False),
                        "text": b["text"][:160]} for b in blocks]}


@router.put("/documents/{id}/mappings")
def save_mappings(id: str, update: MappingUpdate):
    doc, rule = require("document", id), require("rule", update.rule_id)
    blocks = {b["id"] for b in proposal_blocks(doc)}
    key = f"{id}:{update.rule_id}"
    saved = db.get("mapping", key) or {}
    if update.revision != saved.get("revision", 0):
        raise HTTPException(409, "章节对应已在其他页面修改，请刷新后再保存。")
    if update.rule_version != rule["version"]:
        raise HTTPException(409, "模板已更新，请刷新后重新核对章节。")
    targets = {c["id"]: c["execution"]["section"] for c in sections.section_checks(rule)}
    for row in update.mappings:
        if row.check_id not in targets or not set(row.block_ids) <= blocks or (row.missing and row.block_ids):
            raise HTTPException(422, "章节对应包含未知条目或文本块。")
    chosen = {row.check_id: row for row in update.mappings}
    record = {"id": key, "document_id": id, "rule_id": update.rule_id, "rule_version": rule["version"],
              "revision": update.revision + 1, "saved_at": db.now(),
              "targets": {k: v for k, v in targets.items() if k in chosen},
              "mappings": [row.model_dump() for row in chosen.values()]}
    db.save("mapping", record)
    return mappings(id, update.rule_id)


@router.post("/rules/validate")
def validate_rule(rule: RulePack):
    return rule.model_dump(mode="json")


@router.post("/guidelines/plan")
async def plan_guidelines(files: list[UploadFile] = File(...), kind: str = Form("formal")):
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
        if kind not in ("formal", "professional"):
            raise HTTPException(422, "请选择形式或专业模板。")
        draft = await run_in_threadpool(guidelines.generate, documents, kind)
        return publish(draft, None)
    except ModelError as e:
        raise HTTPException(502, str(e))


@router.get("/guidelines/{id}/file")
def guideline_file(id: str):
    guide = require("guideline", id)
    return FileResponse(guide["path"], filename=guide["filename"])




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


def run_review(id, doc, rule, req, evidence, settings):
    run = require("run", id)

    def progress(step, label=None):
        order = [0, 1, 2, 4] if req["kind"] == "formal" else [0, 3, 4]
        run.update(stage=order.index(step) if step in order else 0, stage_label=label or STAGES[step])
        db.save("run", run)

    try:
        client = Client()
        run["audit"] = {"provider": "OpenAI 兼容模型服务", "model": client.settings["model"], "calls": client.calls}
        guides = [require("guideline", gid) for gid in rule.get("guideline_ids", [])]
        local_count = 0
        if req["kind"] == "professional":
            from urllib.parse import urlencode

            from dataclasses import replace

            from ..intelligence import corpus_knowledge
            from ..retrieval import RetrievalConfig, assemble_reports
            project_evidence = []
            # The chosen library's most similar reports are read in full as the comparison set.
            wanted = req["reference_count"]
            knowledge = corpus_knowledge(settings, req["corpus_ids"])
            query = str(doc["metadata"].get("title") or "申报技术方案") + " " + doc.get("proposal_text", "")[:2400]
            # Fill to the requested count by score; weaker matches are flagged partial by retrieval.
            base = RetrievalConfig()
            config = replace(base, min_reports={**base.min_reports, "task2": wanted},
                             max_reports={**base.max_reports, "task2": wanted})
            matches = knowledge.retrieve(query, task_id="task2", config=config)
            context = assemble_reports(matches.reports[:wanted], knowledge.read_markdown,
                                       total_tokens=wanted * 4000, report_tokens=4000)
            for report in context.reports:
                source = next((m for m in matches.reports if m.doc.doc_id == report["doc"].doc_id), None)
                if source:
                    project_evidence.append({"id": "project:" + source.corpus_id + ":" + source.doc.doc_id,
                                     "kind": "project", "title": source.doc.title, "published": None,
                                     "summary": redact(report["markdown"]), "project_period": [source.doc.year_from, source.doc.year_to],
                                     "url": "/api/documents/" + source.doc.doc_id + "/markdown?" + urlencode({"corpus": source.corpus_id, "version": source.doc.version}),
                                     "version": source.doc.version, "doc_id": source.doc.doc_id, "corpus_id": source.corpus_id})
            policy_evidence = [{"id": "policy:" + g["id"], "kind": "policy", "title": g["filename"],
                                "published": None, "summary": redact("\n".join(p["text"] for p in g["pages"])[:8000]),
                                "url": "/api/review/guidelines/" + g["id"] + "/file"} for g in guides]
            evidence = project_evidence + policy_evidence + evidence
            local_count = len(project_evidence)
        cutoff = req["cutoff_date"] or db.now()[:10]
        run.update(audit.review(doc, rule, evidence, cutoff, progress, client, guides, kind=req["kind"], mode=req["mode"]))
        if req["kind"] == "professional":
            run["technical"]["local_matches"] = local_count
            run["audit"]["limitations"].append("项目区间不代表发表时间；未检索到相近项目不等于原创。规划符合性需要提供有效政策原文。")
            if local_count < req["reference_count"]:
                run["audit"]["limitations"].insert(0, f"对照资料库中仅检索到 {local_count} 篇相近报告（设定 {req['reference_count']} 篇），对比范围相应缩小。")
        run["source_locations"] = doc["source_locations"]
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


def material_bundle(proposal, sheet):
    from copy import deepcopy
    merged = deepcopy(proposal)
    merged["proposal_text"] = "\n".join(p["text"] for p in proposal["pages"])
    merged["proposal_pages"] = len(proposal["pages"])
    merged["information_sheet_present"] = sheet is not None
    # Only human-confirmed values feed program checks; an unconfirmed file contributes nothing.
    merged["metadata"] = dict(proposal["metadata"]) if proposal.get("confirmed_at") else {}
    merged.pop("confirmed_at", None)
    if proposal.get("confirmed_at"):
        merged["confirmed_at"] = proposal["confirmed_at"]
    merged["pages"], merged["source_locations"], merged["field_conflicts"] = [], {}, []
    for doc in [proposal] + ([sheet] if sheet else []):
        for page in doc["pages"]:
            number = len(merged["pages"]) + 1
            merged["pages"].append({**page, "page": number})
            merged["source_locations"][str(number)] = {"file_id": doc["id"], "source_page": page["page"],
                                                       "kind": doc["kind"], "filename": doc["filename"]}
    if sheet and sheet.get("confirmed_at"):
        # Conflicting fields do not acquire a "latest file wins" interpretation; empty is no value.
        for field, value in sheet["metadata"].items():
            previous = merged["metadata"].get(field)
            if field == "title" or blank(value):
                continue
            if not blank(previous) and previous != value:
                merged["field_conflicts"].append(field)
                merged["metadata"][field] = None
            else:
                merged["metadata"][field] = value
        merged["confirmed_at"] = merged.get("confirmed_at") or sheet["confirmed_at"]
    return merged

@router.post("/runs")
def new_run(req: ReviewRequest, request: Request):
    doc = require("document", req.document_id)
    sheet = require("document", req.information_sheet_id) if req.information_sheet_id else None
    if sheet and sheet["id"] == doc["id"]:
        raise HTTPException(422, "正文和信息表须分别指定，不能用同一文件冒充两份材料")
    if doc.get("metadata_extraction", {}).get("status") == "running" or (sheet and sheet.get("metadata_extraction", {}).get("status") == "running"):
        raise HTTPException(409, "材料基本信息仍在提取，请完成后核对")
    if not doc["metadata"].get("title", "").strip():
        raise HTTPException(400, "请先确认项目名称")
    current = require("rule", req.rule_id)
    if current.get("kind") != req.kind:
        raise HTTPException(422, "模板类型与审查任务不一致，请选择对应类型的模板")
    if req.rule_version != current["version"]:
        raise HTTPException(409, "模板已更新，请刷新后确认使用最新保存的版本")
    rule = {**require("rule_version", f"{req.rule_id}-v{req.rule_version}"), "id": req.rule_id}
    if not rule.get("confirmed"):
        raise HTTPException(400, "请先保存并启用模板")
    try:
        templates.validate_enabled(rule)
    except ValueError as e:
        raise HTTPException(422, str(e))
    if not model_configured():
        raise HTTPException(400, "审查模型尚未配置")
    if sum(r["status"] == "running" for r in db.all_items("run")) >= 2:
        raise HTTPException(429, "已有两个审核任务在执行，请稍后再试")
    if req.kind == "professional":
        from ..agent.corpora import scan_corpora
        libraries = {c.id: c for c in scan_corpora(request.app.state.settings)}
        if req.corpus_ids[0] not in libraries or libraries[req.corpus_ids[0]].missing:
            raise HTTPException(422, "对照资料库不存在或目录已缺失，请重新选择")
    # Only explicitly chosen literature is read; an empty choice adds none from the stock.
    items = [e for e in db.all_items("evidence") if e["id"] in req.evidence_ids]
    if len(items) != len(req.evidence_ids):
        raise HTTPException(422, "所选文献不存在，请刷新后重新选择")
    ident = uuid.uuid4().hex
    data = req.model_dump(mode="json")
    bundle = material_bundle(doc, sheet)
    mapping = db.get("mapping", f"{doc['id']}:{req.rule_id}") or {}
    rows = sections.effective(doc.get("blocks", []), rule, mapping) if req.kind == "formal" else []
    bundle["blocks"] = doc.get("blocks", [])
    bundle["section_mappings"] = {r["check_id"]: r for r in rows}
    run = {"id": ident, "created_at": db.now(), "status": "running", "stage": 0,
           "stage_label": STAGES[0], "request": data, "rule": rule, "document": public_doc(doc),
           "information_sheet": public_doc(sheet) if sheet else None, "findings": [],
           "mappings": {"revision": mapping.get("revision", 0),
                        "rows": [{k: v for k, v in r.items() if k != "candidates"} for r in rows]},
           "evidence_selection": {"corpus_ids": req.corpus_ids, "evidence_ids": req.evidence_ids},
           "source_locations": bundle["source_locations"],
           "input_versions": [{"file_id": d["id"], "sha256": hashlib.sha256(Path(d["path"]).read_bytes()).hexdigest(), "metadata_revision": d.get("metadata_revision", 0)}
                              for d in [doc] + ([sheet] if sheet else [])]}
    db.save("run", run)
    executor.submit(run_review, ident, bundle, rule, data, items, request.app.state.settings)
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
