"""P0-1: MinerU parse cache — one canonical directory per rel plus at most one staging parse.

Layout under a corpus ``parsed/``:

- ``<rel>/``: the canonical parse of the published source; ``cache.json`` names it.
- ``.staging/<sha256(rel)[:16]>-<source_sha>/``: a parse not yet promoted. ``cache.json`` is
  written last, so a staging directory with a valid ``cache.json`` holds a complete parse.
- ``.trash/``: only ``promote`` moves anything here, and only after SQLite published the staging
  parse, so whatever sits in trash was already replaced and has no reader.

``cache.json`` records two identities: ``source_sha256`` (which source bytes were parsed) and
``version`` (the ``docs.version`` this parse publishes as; ``null`` for an adopted pre-P0 cache,
whose origin is not proven: ``profile = "legacy-unverified"``).
"""

import hashlib
import json
import logging
import os
import shlex
import shutil
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from .knowledge import Page, content_version_of

logger = logging.getLogger(__name__)

CACHE_FILE = "cache.json"
LEGACY = "legacy-unverified"
STAGING = ".staging"
TRASH = ".trash"
FIELDS = ("rel", "source_sha256", "version", "profile", "pages", "written_at")


def staging_key(rel: str) -> str:
    return hashlib.sha256(rel.encode()).hexdigest()[:16]


def staging_dir(parsed_root: Path, rel: str, source_sha: str) -> Path:
    return parsed_root / STAGING / f"{staging_key(rel)}-{source_sha}"


def canonical_dir(parsed_root: Path, rel: str) -> Path:
    return parsed_root / rel


def parser_profile(settings) -> str:
    """The MinerU options a parse ran with (recorded only; the cache key stays the source sha, U14)."""
    try:
        args = shlex.split(settings.mineru_cmd)
    except ValueError:
        return "mineru"
    return " ".join(["mineru", *(arg for arg in args[1:] if "{" not in arg)])


def read_cache(directory: Path) -> dict | None:
    try:
        data = json.loads((directory / CACHE_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or any(field not in data for field in FIELDS):
        return None
    if not isinstance(data["rel"], str) or not isinstance(data["source_sha256"], str):
        return None
    return data


def write_cache(directory: Path, *, rel: str, source_sha: str, version: str | None, profile: str,
                pages: int | None) -> dict:
    """Write ``cache.json`` atomically; callers write it only after every product is in place."""
    data = {"rel": rel, "source_sha256": source_sha, "version": version, "profile": profile,
            "pages": pages, "written_at": datetime.now(UTC).isoformat()}
    temporary = directory / f".{CACHE_FILE}.{uuid4().hex}.tmp"
    temporary.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    try:
        os.replace(temporary, directory / CACHE_FILE)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise
    return data


def drop_marker(directory: Path) -> None:
    """Before anything rewrites a staging directory, it stops counting as complete."""
    (directory / CACHE_FILE).unlink(missing_ok=True)


def load_output(directory: Path) -> tuple[str, list[Page], list]:
    from .parsers import read_mineru_blocks, read_mineru_output
    markdown, pages = read_mineru_output(directory)
    return markdown, pages, read_mineru_blocks(directory)


def output_page_count(directory: Path) -> int | None:
    """Pages in the MinerU middle JSON (``pages[]`` includes empty pages); None without one."""
    candidates = sorted(directory.glob("*.json"), key=lambda path: ("middle" not in path.name, path.name))
    for candidate in candidates:
        if candidate.name == CACHE_FILE:
            continue
        try:
            data = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and isinstance(data.get("pages"), list):
            return len(data["pages"])
    return None


def pdf_page_count(path: Path) -> int | None:
    """Pages of the full page tree (pypdf walks it; ``/Count`` alone is not trusted)."""
    try:
        from pypdf import PdfReader
        return len(PdfReader(str(path)).pages)
    except Exception:  # noqa: BLE001 - an unreadable PDF has no known page count
        return None


def complete(directory: Path, rel: str, source_sha: str) -> dict | None:
    """The ``cache.json`` of a complete parse of ``rel`` at ``source_sha``, else None.

    Complete: the marker parses with every field and names this rel and sha; the middle JSON and
    the markdown both read back, with text; and the content version re-derived from the products
    equals the marker's. ``version = null`` is accepted only for an adopted legacy cache in the
    canonical directory, never for a staging parse.
    """
    info = read_cache(directory)
    if info is None or info["rel"] != rel or info["source_sha256"] != source_sha:
        return None
    staged = directory.parent.name == STAGING
    if staged and directory.name != f"{staging_key(rel)}-{source_sha}":
        return None
    if info["version"] is None and (staged or info["profile"] != LEGACY):
        return None
    if output_page_count(directory) is None:
        return None
    try:
        markdown, pages, _ = load_output(directory)
    except (OSError, ValueError):
        return None
    if not markdown.strip() or not any(page.text.strip() for page in pages):
        return None
    if info["version"] is not None and content_version_of(pages, markdown) != info["version"]:
        return None
    return info


def cache_state(parsed_root: Path, rel: str, source_sha: str, version: str | None) -> str:
    """Read-only parse-cache state of an indexed PDF, for the stage view (P0-4) and the logs.

    ``ok`` / ``legacy`` (canonical agrees), ``promotion_pending`` (published, not promoted),
    ``publish_pending`` (complete staging not yet published), ``cache_mismatch``, ``cache_missing``.
    """
    staging = staging_dir(parsed_root, rel, source_sha)
    pending = complete(staging, rel, source_sha) if staging.is_dir() else None
    if pending is not None:
        return "promotion_pending" if pending["version"] == version else "publish_pending"
    canonical = canonical_dir(parsed_root, rel)
    info = read_cache(canonical)
    if publishes(info, source_sha, version):
        return "legacy" if info["version"] is None else "ok"
    return "cache_mismatch" if canonical.exists() else "cache_missing"


def publishes(info: dict | None, source_sha: str, version: str | None) -> bool:
    """A canonical cache agrees with what SQLite publishes for this source (B3 #3/#4)."""
    if info is None or info["source_sha256"] != source_sha:
        return False
    if info["version"] is None:
        return info["profile"] == LEGACY
    return info["version"] == version


def promote(parsed_root: Path, rel: str, staging: Path) -> None:
    """Make a published staging parse canonical: canonical → trash, staging → canonical, drop trash.

    Called only after SQLite committed the parse. Each step leaves a state ``reconcile_cache``
    recovers: before step 1 / after it (the staging still exists) → promote again; after step 2
    → the canonical cache already matches and the sweep removes the trash.
    """
    canonical = canonical_dir(parsed_root, rel)
    trash = parsed_root / TRASH / f"{staging_key(rel)}-{uuid4().hex}"
    if canonical.exists():
        trash.parent.mkdir(parents=True, exist_ok=True)
        os.replace(canonical, trash)
    canonical.parent.mkdir(parents=True, exist_ok=True)
    os.replace(staging, canonical)
    if trash.exists():
        shutil.rmtree(trash)
    for name in (STAGING, TRASH):
        try:
            (parsed_root / name).rmdir()  # only when nothing else is pending there
        except OSError:
            pass


def sweep(parsed_root: Path, sources: dict[str, Path]) -> None:
    """Start of an import: drop trash, historical ``.versions`` and incomplete or stale staging.

    A complete staging parse of a listed rel at its current source sha is kept for reuse (U9) or
    for ``reconcile_cache``. Only rels with a staging directory get their source hashed.
    """
    from .parsers import sha256_file
    shutil.rmtree(parsed_root / TRASH, ignore_errors=True)
    for rel in sources:
        shutil.rmtree(canonical_dir(parsed_root, rel) / ".versions", ignore_errors=True)
    staging_root = parsed_root / STAGING
    if not staging_root.is_dir():
        return
    for directory in sorted(staging_root.iterdir()):
        info = read_cache(directory)
        path = sources.get(info["rel"]) if info else None
        keep = False
        if info is not None and path is not None:
            try:
                keep = (sha256_file(path) == info["source_sha256"]
                        and complete(directory, info["rel"], info["source_sha256"]) is not None)
            except OSError:
                keep = False
        if not keep:
            shutil.rmtree(directory, ignore_errors=True) if directory.is_dir() else directory.unlink(missing_ok=True)
    try:
        staging_root.rmdir()  # only when empty
    except OSError:
        pass
