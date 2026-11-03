#!/usr/bin/env python3
"""P0-4 阶段视图巡检：逐库报 source / parse / search / extract 四组计数（只读）。

替代 `README.md` 巡检第 3 条的 shell 版：那条只数文件，会把 `.versions` 旧目录重复计入，
也说不清“有缓存但没发布”“原件变了但仍可检索”这类情况。这里调用 `src.stages.stage_view`，
与库卡片和 `verify_targets.py` 用同一套判定。不写数据库、不写缓存、不调 MinerU。

    python datapipe/scripts/stage_report.py             # 逐库一行
    python datapipe/scripts/stage_report.py --json      # 完整行，含每份文件的阶段
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src.agent.config import get_settings  # noqa: E402
from src.agent.corpora import scan_corpora  # noqa: E402
from src.knowledge import Knowledge  # noqa: E402
from src.stages import stage_view  # noqa: E402

STAGES = ("source", "parse", "search", "extract")


def one_line(row: dict) -> str:
    counts = row["counts"]
    parts = []
    for stage in STAGES:
        # A stage with a single value reads "parse: cached 91"; mixed values are listed in full.
        pairs = "，".join(f"{value} {n}" for value, n in sorted(counts[stage].items()))
        parts.append(f"{stage}: {pairs or '—'}")
    return f"{row['name'][:26]:28} {row['documents']:>5}  " + " | ".join(parts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="每份文件的完整阶段行，而不是逐库汇总")
    args = parser.parse_args()
    settings = get_settings()
    rows, total = [], Counter()
    for info in sorted(scan_corpora(settings), key=lambda i: i.name):
        if info.missing or not info.sqlite or not info.sqlite.is_file():
            continue
        view = stage_view(Knowledge(info.sqlite, settings=settings, vectordb_dir=info.vectordb_dir,
                                    source_root=info.source_dir), info)
        rows.append(view)
        total.update({f"{stage}.{value}": n for stage in STAGES
                      for value, n in view["counts"][stage].items()})
        if not args.json:
            print(one_line(view))
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
    else:
        print(f"\n库 {len(rows)} 个，条目 {sum(r['documents'] for r in rows)} 份；"
              + "，".join(f"{k} {v}" for k, v in sorted(total.items())))


if __name__ == "__main__":
    main()
