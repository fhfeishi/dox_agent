"""One archive record per document (2026-11-09).

A corpus keeps two different things apart:

- ``parsed/<rel>/`` is the parse product of one source file: MinerU output, cache marker, corrections.
- ``archive/<doc_id>.json`` is the semantic record of one document: source identity, parse facts,
  project metadata, funding facts and the four-dimension extraction.

The record is keyed by ``doc_id`` because a document keeps its id when its path changes; the parse
directory stays keyed by source-relative path because it is an artifact of that file. The old
``target/<doc_id>.json`` files are read as legacy records: their top-level extraction fields are
wrapped into the new envelope, and nothing is rewritten until the document is extracted again.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import threading
from contextlib import contextmanager, suppress
from datetime import UTC, datetime
from pathlib import Path

try:  # POSIX advisory locks; on Windows the thread lock still serialises this process
    import fcntl
except ImportError:  # pragma: no cover - Windows
    fcntl = None

from . import corrections
from .parse_cache import output_page_count, output_page_texts, parse_quality, quality_grade, read_cache

ARCHIVE_DIRNAME = "archive"
LEGACY_DIRNAME = "target"
RECORD_VERSION = 1
# The extraction fields the old top-level ``target`` record held; kept as the nested section now.
EXTRACTION_FIELDS = ("schema_version", "prompt_version", "model", "params", "generated_at", "process",
                     "facets", "relations", "outputs", "events", "rejected", "outputs_check", "error")
DEFAULT_VERSIONS = {"record": RECORD_VERSION, "parse": 1, "metadata_schema": 1,
                    "metadata_dictionary": 1, "metadata_prompt": 1,
                    "extraction_schema": 2, "extraction_prompt": 2, "extraction_template": 1}


def path(info, doc_id: str) -> Path:
    return info.root / ARCHIVE_DIRNAME / f"{doc_id}.json"


def legacy_path(info, doc_id: str) -> Path:
    return info.root / LEGACY_DIRNAME / f"{doc_id}.json"


def _read(path_: Path) -> tuple[dict | None, str]:
    if not path_.is_file():
        return None, ""
    try:
        value = json.loads(path_.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ValueError("记录不是对象")
        return value, ""
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        return None, f"文档记录损坏：{exc}"


def normalize(record: dict) -> dict:
    """The archive envelope, accepting a legacy top-level extraction record unchanged."""
    value = dict(record)
    if "extraction" not in value:
        extraction = {key: value[key] for key in EXTRACTION_FIELDS if key in value}
        value = {key: item for key, item in value.items() if key not in EXTRACTION_FIELDS}
        value["extraction"] = extraction
    value.setdefault("record_version", RECORD_VERSION)
    value.setdefault("doc_version", value.get("version", ""))
    value.setdefault("source", None)
    value.setdefault("parse", None)
    value.setdefault("metadata", None)
    versions = value.get("versions") if isinstance(value.get("versions"), dict) else {}
    value["versions"] = {**DEFAULT_VERSIONS, **versions}
    return value


def load(info, doc_id: str) -> tuple[dict | None, str]:
    """The record for one document: archive first, legacy ``target/`` second."""
    for candidate in (path(info, doc_id), legacy_path(info, doc_id)):
        record, error = _read(candidate)
        if error:
            return None, error
        if record is None:
            continue
        if record.get("doc_id") not in (None, doc_id):
            return None, "文档记录身份不匹配"
        record["doc_id"] = doc_id
        return normalize(record), ""
    return None, ""


# One record file has three writers (parse refresh, four-dimension extraction, project facts). Each
# write is read-modify-write, so they must not interleave: a per-record lock file serialises them
# within the process and across processes on the same machine. It is a lock on the *write*, not on
# the reader: a reader always sees either the old or the new file (``os.replace`` is atomic).
_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()


@contextmanager
def _record_lock(info, doc_id: str):
    key = str(path(info, doc_id))
    with _LOCKS_GUARD:
        thread_lock = _LOCKS.setdefault(key, threading.Lock())
    with thread_lock:
        lock_path = path(info, doc_id).with_suffix(".lock")
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        handle = None
        try:
            handle = open(lock_path, "a+")
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            yield
        finally:
            if handle is not None:
                if fcntl is not None:
                    with suppress(OSError):
                        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
                handle.close()


def save(info, record: dict) -> None:
    """Write one record atomically; the caller has already serialized same-document writes."""
    target = path(info, record["doc_id"])
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".record-", suffix=".json", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(record, handle, ensure_ascii=False, indent=1)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)


def mtime(info, doc_id: str) -> int | None:
    """Last write of the record file; a lock file is not a record and is never considered."""
    for candidate in (path(info, doc_id), legacy_path(info, doc_id)):
        try:
            stat = candidate.stat()
            return stat.st_mtime_ns
        except OSError:
            continue
    return None


def remove(info, doc_id: str) -> None:
    path(info, doc_id).unlink(missing_ok=True)
    path(info, doc_id).with_suffix(".lock").unlink(missing_ok=True)
    legacy_path(info, doc_id).unlink(missing_ok=True)


def extraction_of(record: dict | None) -> dict:
    if not record:
        return {}
    value = record.get("extraction")
    return value if isinstance(value, dict) else {}


def metadata_of(record: dict | None) -> dict:
    if not record:
        return {}
    value = record.get("metadata")
    return value if isinstance(value, dict) else {}


def parse_of(record: dict | None) -> dict:
    if not record:
        return {}
    value = record.get("parse")
    return value if isinstance(value, dict) else {}


def _rel(knowledge, doc_id: str) -> str:
    return next((rel for rel, item in knowledge.files().items() if item.get("doc_id") == doc_id), "")


def _sha(path_: Path) -> str:
    try:
        return hashlib.sha256(path_.read_bytes()).hexdigest()
    except OSError:
        return ""


def corrected_text(info, knowledge, doc: dict) -> tuple[str, str, str, bool]:
    """The text extraction must read: the stored body with the current correction overlay applied.

    Returns ``(text, text_sha256, corrections_sha256, corrections_invalidated)``. A page-level
    correction is applied when its ``before`` still matches; a blank-before correction (a page the
    parser left empty) makes the whole text fall back to page texts, because there is no anchor in
    the Markdown to replace. A block correction is applied by its own ``before`` text; with no
    anchor it falls back the same way. An overlay written against other source bytes is reported as
    invalidated and not applied.
    """
    rel = _rel(knowledge, doc["doc_id"])
    parsed_dir = info.root / "parsed" / rel if rel else None
    markdown = knowledge.read_markdown(doc["doc_id"], doc["version"])
    source_sha = knowledge.source_sha256(doc["doc_id"]) or doc.get("source_sha256", "")
    overlay = corrections.load(parsed_dir, source_sha) if parsed_dir is not None else {"active": False, "invalidated": False, "pages": {}}
    corrections_sha = _sha(parsed_dir / corrections.CORRECTIONS_FILE) if parsed_dir is not None else ""
    if not overlay.get("active"):
        return markdown, hashlib.sha256(markdown.encode()).hexdigest(), corrections_sha, bool(overlay.get("invalidated"))
    text = markdown
    needs_pages = False
    for entry in overlay["pages"].values():
        before, after = entry.get("before"), entry.get("after")
        if isinstance(before, str) and isinstance(after, str) and (before or after):
            if before:
                text = text.replace(before, after, 1)
            else:
                needs_pages = True
        for block in (entry.get("blocks") or {}).values():
            before, after = block.get("before"), block.get("after")
            if isinstance(before, str) and isinstance(after, str) and (before or after):
                if before:
                    text = text.replace(before, after, 1)
                else:
                    needs_pages = True
    if needs_pages and parsed_dir is not None:
        pages = output_page_texts(parsed_dir)
        if pages:
            corrected = []
            for index, page in enumerate(pages):
                entry = overlay["pages"].get(str(index)) or {}
                corrected.append(corrections.apply(page, {str(index): entry}))
            text = "\n\n".join(corrected)
    return text, hashlib.sha256(text.encode()).hexdigest(), corrections_sha, False


def build_source(knowledge, doc: dict) -> dict:
    return {
        "rel": _rel(knowledge, doc["doc_id"]),
        "title": doc.get("title", ""),
        "kind": doc.get("kind", ""),
        "sha256": knowledge.source_sha256(doc["doc_id"]) or doc.get("source_sha256", ""),
        "page_count": doc.get("page_count", 0),
        "captured_at": doc.get("captured_at", ""),
    }


def build_parse(info, knowledge, doc: dict, settings) -> dict:
    rel = _rel(knowledge, doc["doc_id"])
    parsed_dir = info.root / "parsed" / rel if rel else None
    cache = read_cache(parsed_dir) if parsed_dir is not None else None
    quality = (cache or {}).get("quality")
    if not isinstance(quality, dict):
        texts = output_page_texts(parsed_dir) if parsed_dir is not None else None
        expected = output_page_count(parsed_dir) if parsed_dir is not None else doc.get("page_count")
        quality = parse_quality(texts or [], expected)
    text, text_sha, corrections_sha, invalidated = corrected_text(info, knowledge, doc)
    return {
        "status": "parsed" if text else "failed",
        "parsed_rel": rel,
        "profile": (cache or {}).get("profile", ""),
        "parser": doc.get("parser", ""),
        "source_sha256": knowledge.source_sha256(doc["doc_id"]) or doc.get("source_sha256", ""),
        "text_sha256": text_sha,
        "corrections_hash": corrections_sha,
        "corrections_invalidated": invalidated,
        "quality": quality,
        "grade": quality_grade(quality, getattr(settings, "parse_quality_grades", None)),
        "parsed_at": (cache or {}).get("written_at", ""),
        "parse_version": 1,
        "error": "",
    }


def _versions(existing: dict, parse: dict, **changes) -> dict:
    versions = {**DEFAULT_VERSIONS, **(existing.get("versions") or {})}
    versions["record"] = RECORD_VERSION
    versions["parse"] = parse.get("parse_version", 1)
    versions.update(changes)
    return versions


def project_facts(info, doc_id: str) -> dict:
    """The project identity/funding facts of one document, flattened for readers that have no ``info``.

    ``ProjectIndex`` and ``ReportDoc`` need the four values the filename used to supply (number,
    years, PI) plus the scheme; this returns them from the archive record only, with no fallback —
    a caller decides what to do when a fact is absent. A date keeps its stated precision and is
    reduced to a year only here, which is the unit the report window compares.
    """
    record, error = load(info, doc_id)
    if error:
        return {}
    metadata = metadata_of(record)
    project = metadata.get("project") or {}
    if not project:
        return {}
    def value(key: str) -> str:
        item = project.get(key) or {}
        return str(item.get("value") or "").strip() if isinstance(item, dict) else ""

    def year(key: str) -> int | None:
        text = value(key)
        match = re.match(r"(\d{4})", text)
        return int(match.group(1)) if match else None

    return {
        "identity": str(project.get("identity") or ""),
        "scheme": value("project_scheme"),
        "number": value("project_no"),
        "name": value("project_name"),
        "category": value("project_category"),
        "unit": value("lead_unit"),
        "pi": value("principal_investigator"),
        "start_year": year("start_date"),
        "end_year": year("end_date"),
        "has_facts": True,
    }


def write_extraction(info, knowledge, doc: dict, extraction: dict, settings) -> dict:
    with _record_lock(info, doc["doc_id"]):
        return _write_extraction_locked(info, knowledge, doc, extraction, settings)


def _write_extraction_locked(info, knowledge, doc: dict, extraction: dict, settings) -> dict:
    existing, _error = load(info, doc["doc_id"])
    base = existing or {"doc_id": doc["doc_id"]}
    source = base.get("source") or build_source(knowledge, doc)
    parse = base.get("parse") or build_parse(info, knowledge, doc, settings)
    versions = _versions(base, parse,
                         extraction_schema=extraction.get("schema_version", 2),
                         extraction_prompt=extraction.get("prompt_version", 2),
                         extraction_template=extraction.get("template_version", 1))
    record = {
        **base,
        "record_version": RECORD_VERSION,
        "doc_id": doc["doc_id"],
        "doc_version": doc["version"],
        "version": doc["version"],
        "source_hash": source.get("sha256", ""),
        "source": source,
        "parse": parse,
        "extraction": {**extraction, "template_id": extraction.get("template_id", "project-report-four-facets")},
        "versions": versions,
        "updated_at": datetime.now(UTC).isoformat(),
    }
    save(info, record)
    return record


# The four states a person sees (2026-11-09). Parsing and extraction stay separate internally; this
# is the single answer the library list and the document detail show.
STATE_PROCESSING = "处理中"
STATE_REVIEW = "待核对"
STATE_READY = "已入库"
STATE_FAILED = "失败"


def lifecycle(record: dict | None, doc: dict, *, running: bool = False) -> dict:
    """``{state, reasons}`` for one document; ``running`` says a parse/extraction job is active.

    Nothing is inferred: a missing section is "not done yet", a section that failed is "失败", and
    "待核对" names the concrete reasons (missing required project fields, conflicting funding, a low
    parse grade, rejected extraction items) rather than a vague warning.
    """
    if running:
        return {"state": STATE_PROCESSING, "reasons": []}
    parse = parse_of(record)
    metadata = metadata_of(record)
    extraction = extraction_of(record)
    reasons: list[str] = []
    failed = []
    if parse.get("status") == "failed":
        failed.append("解析失败" + (f"：{parse.get('error')}" if parse.get("error") else ""))
    if metadata.get("status") == "failed":
        failed.append("项目元数据/资金抽取失败"
                      + (f"：{(metadata.get('process') or {}).get('error')}" if (metadata.get("process") or {}).get("error") else ""))
    if extraction.get("process", {}).get("status") == "未完成" and extraction.get("error"):
        failed.append(f"四维抽取未完成：{extraction['error']}")
    if failed:
        return {"state": STATE_FAILED, "reasons": failed}
    if not parse and not extraction and not metadata:
        return {"state": STATE_PROCESSING, "reasons": ["尚未开始抽取"]}
    if (record or {}).get("doc_version") not in (None, doc["version"]):
        reasons.append("资料已更新，需要重新解析/抽取")
    if parse.get("corrections_invalidated"):
        reasons.append("原件已变化，人工校正已失效")
    grade = parse.get("grade")
    if grade in ("C", "D"):
        reasons.append(f"解析质量 {grade} 级")
    if metadata:
        missing = metadata.get("missing") or []
        if missing:
            reasons.append("项目字段缺失：" + "、".join(missing))
        terms = [item.get("term") for item in metadata.get("funding") or []]
        duplicates = {term for term in terms if term and terms.count(term) > 1}
        if duplicates:
            reasons.append("资金同口径多值：" + "、".join(sorted(duplicates)))
        rejected = metadata.get("rejected") or []
        if rejected:
            reasons.append(f"{len(rejected)} 个字段未通过校验")
    if extraction:
        if extraction.get("process", {}).get("status") == "未完成":
            reasons.append("四维抽取未完成")
        if extraction.get("rejected"):
            reasons.append(f"{len(extraction['rejected'])} 条四维条目被拒收")
    if parse:
        # A new archive record parsed but has only one of the two extraction sections. Legacy
        # records predate the split and have no parse section, so they are not marked for this.
        if not extraction:
            reasons.append("四维未抽取")
        if not metadata:
            reasons.append("项目元数据/资金未抽取")
    if not parse and not extraction:
        reasons.append("尚未解析/抽取")
    return {"state": STATE_REVIEW if reasons else STATE_READY, "reasons": reasons}


def write_metadata(info, knowledge, doc: dict, metadata: dict, settings) -> dict:
    with _record_lock(info, doc["doc_id"]):
        return _write_metadata_locked(info, knowledge, doc, metadata, settings)


def _write_metadata_locked(info, knowledge, doc: dict, metadata: dict, settings) -> dict:
    existing, _error = load(info, doc["doc_id"])
    base = existing or {"doc_id": doc["doc_id"]}
    source = base.get("source") or build_source(knowledge, doc)
    parse = base.get("parse") or build_parse(info, knowledge, doc, settings)
    versions = _versions(base, parse,
                         metadata_schema=metadata.get("schema_version", 1),
                         metadata_dictionary=metadata.get("dictionary_version", 1),
                         metadata_prompt=metadata.get("prompt_version", 1))
    record = {
        **base,
        "record_version": RECORD_VERSION,
        "doc_id": doc["doc_id"],
        "doc_version": doc["version"],
        "version": doc["version"],
        "source_hash": source.get("sha256", ""),
        "source": source,
        "parse": parse,
        "metadata": metadata,
        "versions": versions,
        "updated_at": datetime.now(UTC).isoformat(),
    }
    save(info, record)
    return record
