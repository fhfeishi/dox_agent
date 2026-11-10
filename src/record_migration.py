"""One-time migration: ``<corpus>/target/`` → ``<corpus>/archive/`` (2026-11-09).

The archive record is the same envelope the application now reads (``src/records.py``): a legacy
``target/<doc_id>.json`` is valid input, so the migration only moves the directory. Nothing is
rewritten, no model is called, and the operation is idempotent — running it twice changes nothing
the second time.

Usage (service stopped):

    python -m src.record_migration --root .knowledge
    python -m src.record_migration --root .knowledge --dry-run
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from .records import ARCHIVE_DIRNAME, LEGACY_DIRNAME


def corpora(root: Path) -> list[Path]:
    """Every directory that holds a ``target/`` or ``archive/`` record directory."""
    return sorted({item.parent for item in Path(root).glob(f"*/{LEGACY_DIRNAME}")
                   if item.is_dir()} | {item.parent for item in Path(root).glob(f"*/{ARCHIVE_DIRNAME}")
                                        if item.is_dir()})


def migrate(root: Path, *, dry_run: bool = False) -> list[dict]:
    report = []
    for corpus in corpora(root):
        legacy, archive = corpus / LEGACY_DIRNAME, corpus / ARCHIVE_DIRNAME
        moved = skipped = 0
        if legacy.is_dir():
            archive.mkdir(parents=True, exist_ok=True)
            for item in sorted(legacy.iterdir()):
                destination = archive / item.name
                if destination.exists():
                    # A record already in the archive wins; the legacy copy is left in place so a
                    # human can compare them instead of one silently overwriting the other.
                    skipped += 1
                    continue
                if not dry_run:
                    shutil.move(str(item), str(destination))
                moved += 1
            if not dry_run and not any(legacy.iterdir()):
                legacy.rmdir()
        report.append({"corpus": corpus.name, "moved": moved, "skipped": skipped,
                       "dry_run": dry_run})
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="把各资料库的 target/ 记录迁到 archive/")
    parser.add_argument("--root", default=".knowledge", help="资料库根目录（默认 .knowledge）")
    parser.add_argument("--dry-run", action="store_true", help="只报告将移动的文件，不改动磁盘")
    args = parser.parse_args(argv)
    root = Path(args.root)
    if not root.is_dir():
        parser.error(f"目录不存在：{root}")
    rows = migrate(root, dry_run=args.dry_run)
    total = sum(row["moved"] for row in rows)
    skipped = sum(row["skipped"] for row in rows)
    for row in rows:
        print(f"{row['corpus']}: 移动 {row['moved']}，已存在跳过 {row['skipped']}")
    print(f"合计：{len(rows)} 个资料库，移动 {total} 份记录，跳过 {skipped} 份"
          + ("（预演，未改动磁盘）" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
