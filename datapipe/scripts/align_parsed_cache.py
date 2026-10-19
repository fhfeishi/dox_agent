#!/usr/bin/env python3
"""Align `.knowledge/<corpus>/` with the code interface.

Per top-level corpus:
  * ensure the role dirs ``source/ parsed/ datadb/ vectordb/`` exist;
  * dedup source PDFs by ratifyNo, keeping the well-formed / real-PI copy;
  * for every source PDF that already has a MinerU cache anywhere under
    ``.knowledge/``, copy it to ``parsed/<source-relative-path>/`` (code expects
    this mirror; otherwise ``import_defaults`` re-runs MinerU);
  * move any ``pending/`` PDF that now has a cache into ``source/`` and place the cache;
  * delete ``*Zone.Identifier*`` Windows sidecar files.

Never deletes a top-level corpus directory. Does not touch ``datadb``/``vectordb``.

Usage:
    python datapipe/scripts/align_parsed_cache.py            # dry run
    python datapipe/scripts/align_parsed_cache.py --apply
"""

from __future__ import annotations

import argparse
import collections
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KB = ROOT / ".knowledge"

FUND_RE = re.compile(r"^(\d{4})_(\d{4})_([A-Za-z0-9]+)_([^_]+)_(.+)$")
CATEGORY_PI = ("面上项目", "青年科学基金项目", "重点项目", "重大研究计划",
               "联合基金项目", "地区科学基金项目", "国家杰出青年科学基金")
ROLE_DIRS = ("source", "parsed", "datadb", "vectordb")


def is_zone(path: Path) -> bool:
    return "Zone.Identifier" in path.name


def has_cache(directory: Path) -> bool:
    return directory.is_dir() and (directory / "middle_json.json").is_file()


def parse_identity(stem: str) -> tuple[str, int]:
    """(ratifyNo, preference) — preference 2 = well-formed real PI, 1 = well-formed category
    PI, 0 = malformed / unknown."""
    match = FUND_RE.match(stem)
    if match:
        pi = match.group(4)
        return match.group(3), (1 if pi.startswith(CATEGORY_PI) else 2)
    for token in stem.split("_"):
        if re.fullmatch(r"[0-9A-Za-z]{6,}", token):
            return token, 0
    return stem, 0


def dedupe(pdfs: list[Path]) -> tuple[list[Path], list[Path]]:
    groups: dict[str, list[Path]] = collections.defaultdict(list)
    for pdf in pdfs:
        ratify, _ = parse_identity(pdf.stem)
        groups[ratify].append(pdf)
    kept: list[Path] = []
    dropped: list[Path] = []
    for group in groups.values():
        best = max(parse_identity(p.stem)[1] for p in group)
        for pdf in group:
            (kept if parse_identity(pdf.stem)[1] == best else dropped).append(pdf)
    return sorted(kept), sorted(dropped)


def build_cache_index() -> dict[str, Path]:
    index: dict[str, Path] = {}
    for corpus in sorted(p for p in KB.iterdir() if p.is_dir() and not p.name.startswith(".")):
        parsed = corpus / "parsed"
        if not parsed.is_dir():
            continue
        for directory in parsed.rglob("*"):
            if has_cache(directory):
                index.setdefault(directory.name, directory)
    return index


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    cache_index = build_cache_index()
    print(f"parsed cache index: {len(cache_index)} pdf names")

    for corpus in sorted(p for p in KB.iterdir() if p.is_dir() and not p.name.startswith(".")):
        source = corpus / "source"
        if not source.is_dir():
            continue
        lines: list[str] = []
        if args.apply:
            for role in ROLE_DIRS:
                (corpus / role).mkdir(exist_ok=True)

        # 1) Windows junk
        zones = [p for p in corpus.rglob("*") if is_zone(p)]
        if args.apply:
            for path in zones:
                path.unlink(missing_ok=True)
        lines.append(f"zone_removed={len(zones)}")

        # 2) pending -> source when a cache exists
        moved_pending = 0
        pending = corpus / "pending"
        if pending.is_dir():
            for pdf in sorted(pending.glob("*.pdf")):
                if pdf.name in cache_index:
                    if args.apply:
                        shutil.move(str(pdf), str(source / pdf.name))
                    moved_pending += 1
            if args.apply and not any(pending.iterdir()):
                pending.rmdir()
        lines.append(f"pending_with_cache_moved={moved_pending}")

        # 3) dedup source PDFs (recursive: the legacy aggregate nests by domain)
        pdfs = sorted(source.rglob("*.pdf"))
        kept, dropped = dedupe(pdfs)
        if args.apply:
            for path in dropped:
                path.unlink()
        lines.append(f"pdf={len(kept)} md={len(list(source.rglob('*.md')))} dup_removed={len(dropped)}")

        # 4) place parsed caches so parsed/<rel> mirrors source/<rel>. Skip the legacy
        # aggregate (its cache is already present under old names; copying would double ~1.1G).
        placed = missing = 0
        for pdf in ([] if corpus.name == "自然科学基金" else kept):
            target = corpus / "parsed" / pdf.relative_to(source)
            if has_cache(target):
                continue
            cached = cache_index.get(pdf.name)
            if cached is None:
                missing += 1
                continue
            if args.apply:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(cached, target)
            placed += 1
        lines.append(f"parsed_placed={placed} parsed_missing={missing}")

        print(f"{corpus.name:32} " + " ".join(lines))
        if dropped:
            for path in dropped:
                print(f"    drop: {path.name}")


if __name__ == "__main__":
    main()
