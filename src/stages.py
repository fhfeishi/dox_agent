"""P0-4: a read-only per-document stage view for one corpus.

Each source file moves through four stages — ``source`` (the original on disk), ``parse`` (the
MinerU cache), ``search`` (the searchable document in SQLite) and ``extract`` (its four-facet
record) — plus a library-level ``index`` (the generated lineage/hierarchy). The stages fail and
recover independently: a parse can fail while the previously published text is still searchable, and
a source can be missing while its text stays readable. Reporting one merged word hides exactly those
cases, so every stage gets its own value and the library reports counts per stage.

Nothing here writes: no database, no cache, no ``mtime``. It reads the manifest, the published
documents, ``parsed/`` and ``target/`` and derives the values. Values follow the P0-4 design
(``.logsdev/pipeline梳理和优化-20261103/reviews/2026-11-02_Opus_数据处理分析.md`` §4.1).
"""

from __future__ import annotations

from pathlib import Path

from .agent.corpora import PARSED_DIRNAME
from .knowledge import is_virtual_rel
from .parse_cache import CACHE_FILE, cache_state
from .targets import _load, _record_state

# ``cache_state`` values: a published cache that agrees, and a complete parse not yet published.
PUBLISHED = ("ok", "legacy")
UNPUBLISHED = ("promotion_pending", "publish_pending")
STAGES = ("source", "parse", "search", "extract")


def _source_state(rel: str, entry: dict, source_dir: Path) -> str:
    """``present`` / ``changed`` / ``missing`` — the original against the manifest, as ``current()``."""
    if is_virtual_rel(rel):
        return "present"  # manual text and web pages have no file to compare
    path = source_dir / rel
    try:
        stat = path.stat()
    except OSError:
        return "missing"
    if stat.st_size == entry["size"] and stat.st_mtime_ns == entry["mtime_ns"]:
        return "present"
    # A changed timestamp alone need not mean changed bytes, so compare the content before saying so.
    from .parsers import sha256_file

    try:
        digest = sha256_file(path)
    except OSError:
        return "missing"
    return "present" if digest == entry["sha256"] else "changed"


def _parse_state(entry: dict, version: str | None, parsed_root: Path) -> tuple[str, str]:
    """``(state, reason)`` for the MinerU cache: ``none`` / ``cached`` / ``parsed`` / ``stale`` / ``failed``.

    ``cached`` is a cache that agrees with what SQLite publishes; ``parsed`` is a complete parse that
    has not been published (or promoted) yet; ``stale`` is a cache on disk that disagrees — a state to
    show, never to auto-fix (B3).

    A parse produced before P0-1 has no ``cache.json``, so ``cache_state`` cannot confirm it. Its
    directory and pages still exist and the document is published, which is the same "adopted legacy
    cache" P0-1 recognises; reporting all of them ``stale`` would tell the reader nothing about the
    one case that matters. They read ``cached`` with reason ``legacy-unmarked``, and a directory with
    no pages at all is the one that reads ``stale``.
    """
    if entry["status"] == "error" or entry.get("last_error"):
        return "failed", entry.get("last_error", "")
    rel = entry["rel_path"]
    if is_virtual_rel(rel):
        return "none", ""  # text and web pages are never parsed
    state = cache_state(parsed_root, rel, entry["sha256"], version)
    if state in PUBLISHED:
        return "cached", ""
    if state in UNPUBLISHED:
        return "parsed", state
    directory = parsed_root / rel
    if not directory.is_dir():
        # Only PDFs are parsed (MinerU); a text or Markdown source legitimately has no cache, so it
        # has no parse stage to report rather than a missing one.
        return ("none", "") if not rel.lower().endswith(".pdf") else ("stale", "cache_missing")
    if (not (directory / CACHE_FILE).exists()
            and any(directory.glob("*.json")) and any(directory.glob("*.md"))):
        return "cached", "legacy-unmarked"
    return "stale", state


def _search_state(entry: dict, current_ids: set[str]) -> str:
    """``current`` / ``superseded`` / ``failed`` / ``none`` — whether new work may use this document.

    ``superseded`` is a published document that ``current()`` no longer offers (its source changed,
    or the file is gone): the text stays readable for history, but new work must not cite it.
    """
    if not entry["doc_id"]:
        return "none"
    if entry["status"] == "error":
        return "failed"
    if entry["status"] != "indexed":
        return "none"
    return "current" if entry["doc_id"] in current_ids else "superseded"


def _extract_state(info, doc: dict | None) -> str:
    """``missing`` / ``current`` / ``stale`` / ``invalid``, from the four-facet record (``targets``)."""
    if doc is None:
        return "missing"
    record, error = _load(info, doc["doc_id"])
    state, _ = _record_state(record, error, doc)
    return state


def stage_view(knowledge, info) -> dict:
    """The stage view of one corpus: per-document rows plus counts for every stage.

    ``rows`` carry ``rel_path``, ``doc_id``, ``last_error``, the four stage values and ``parse_reason``
    (why ``parse`` reads as it does, empty when there is nothing to explain); ``counts`` counts each
    value across the documents. Read-only, so it is safe to run against a live library.
    """
    manifest = knowledge.files()
    current_ids = {doc["doc_id"] for doc in knowledge.current()}
    published = {doc["doc_id"]: doc for doc in knowledge.all()}
    # The cache must agree with the published version (B3), which is not always the current one.
    versions = {doc_id: doc["version"] for doc_id, doc in published.items()}
    parsed_root = info.root / PARSED_DIRNAME
    rows = []
    for rel, entry in sorted(manifest.items()):
        doc_id = entry["doc_id"] or ""
        parse, reason = _parse_state(entry, versions.get(doc_id), parsed_root)
        doc = published.get(doc_id)
        extract = _extract_state(info, {**doc, "source_sha256": entry["sha256"]} if doc else None)
        if extract == "current" and doc_id not in current_ids:
            extract = "stale"
        rows.append({
            "rel_path": rel,
            "doc_id": doc_id,
            "status": entry["status"],
            "last_error": entry.get("last_error", ""),
            "source": _source_state(rel, entry, info.source_dir),
            "parse": parse,
            "parse_reason": reason,
            "search": _search_state(entry, current_ids),
            "extract": extract,
        })
    counts = {stage: {} for stage in STAGES}
    for row in rows:
        for stage in STAGES:
            counts[stage][row[stage]] = counts[stage].get(row[stage], 0) + 1
    return {"corpus_id": info.id, "name": info.name, "documents": len(rows), "counts": counts, "rows": rows}
