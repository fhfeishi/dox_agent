#!/usr/bin/env python3
"""Continue MinerU parsing for PDFs that have no cache yet.

Runs ``mineru-kit parse`` per missing PDF and extracts the result into the code's
expected cache path ``<corpus>/parsed/<source-relative-path>/`` so a later import
reuses it instead of re-parsing. ``pending/`` PDFs get a flat cache under ``parsed/``.

Resumable: already-cached PDFs are skipped. Never touches the legacy
``自然科学基金/`` library. Default tier is ``flash`` (CPU-friendly OCR); pass
``--tier standard`` for the slow VLM pipeline.

Usage:
    python datapipe/scripts/parse_missing_pdf.py --tier flash
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KB = ROOT / ".knowledge"
LEGACY = "自然科学基金"


def has_cache(directory: Path) -> bool:
    return (directory / "middle_json.json").is_file()


def targets() -> list[tuple[Path, Path]]:
    """(target parsed dir, source pdf) for every missing PDF in the new corpora."""
    tasks: list[tuple[Path, Path]] = []
    for corpus in sorted(p for p in KB.iterdir() if p.is_dir() and not p.name.startswith(".")):
        if corpus.name == LEGACY:
            continue
        source = corpus / "source"
        if source.is_dir():
            for pdf in sorted(source.rglob("*.pdf")):
                target = corpus / "parsed" / pdf.relative_to(source)
                if not has_cache(target):
                    tasks.append((target, pdf))
        pending = corpus / "pending"
        if pending.is_dir():
            for pdf in sorted(pending.glob("*.pdf")):
                target = corpus / "parsed" / pdf.name
                if not has_cache(target):
                    tasks.append((target, pdf))
    return tasks


def parse_one(pdf: Path, target: Path, tier: str, timeout: int) -> tuple[bool, str]:
    target.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / "result.zip"
        command = f'mineru-kit parse "{pdf}" -o "{archive}" --tier {tier} --ocr-mode auto --format zip'
        env = {**os.environ}
        env["PATH"] = str(Path(sys.executable).parent) + os.pathsep + env.get("PATH", "")
        try:
            proc = subprocess.run(command, shell=True, env=env, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, timeout=timeout, start_new_session=True)
        except subprocess.TimeoutExpired:
            return False, f"timeout>{timeout}s"
        if proc.returncode != 0:
            return False, (proc.stdout or b"")[-300:].decode("utf-8", "ignore")
        if not archive.is_file():
            return False, "no result.zip"
        with zipfile.ZipFile(archive) as bundle:
            bundle.extractall(target)
    if not has_cache(target):
        return False, "no middle_json.json after extract"
    return True, "ok"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tier", default="flash", choices=["flash", "basic", "standard", "advanced"])
    parser.add_argument("--timeout", type=int, default=7200, help="per-file seconds")
    parser.add_argument("--limit", type=int, default=0, help="stop after N files (0 = all)")
    args = parser.parse_args()

    tasks = targets()
    print(f"[{time.strftime('%H:%M:%S')}] missing PDFs: {len(tasks)} (tier={args.tier})", flush=True)
    done = failed = 0
    for index, (target, pdf) in enumerate(tasks, 1):
        if args.limit and done >= args.limit:
            break
        start = time.time()
        ok, message = parse_one(pdf, target, args.tier, args.timeout)
        elapsed = int(time.time() - start)
        status = "OK" if ok else "FAIL"
        done += ok
        failed += not ok
        print(f"[{time.strftime('%H:%M:%S')}] {index}/{len(tasks)} {status} {elapsed}s "
              f"{pdf.name} ({message})", flush=True)
    print(f"[{time.strftime('%H:%M:%S')}] finished: ok={done} failed={failed}", flush=True)


if __name__ == "__main__":
    main()
