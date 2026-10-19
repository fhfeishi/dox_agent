#!/usr/bin/env python3
"""全库 target 契约复验：复刻 src/targets.py 的 current/stale 判定，逐库统计。"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src import targets  # noqa: E402
from src.agent.config import get_settings  # noqa: E402
from src.agent.corpora import scan_corpora  # noqa: E402
from src.knowledge import Knowledge  # noqa: E402

settings = get_settings()
grand_docs = grand_files = grand_cur = 0
grand_out = grand_evt = 0
rows = []
for info in sorted(scan_corpora(settings), key=lambda i: i.name):
    if info.missing or not info.sqlite or not info.sqlite.is_file():
        continue
    kn = Knowledge(info.sqlite, settings=settings,
                   vectordb_dir=info.vectordb_dir, source_root=info.source_dir)
    docs = kn.current()
    cur = miss = invalid = 0
    n_out = n_evt = n_rej = 0
    for doc in docs:
        rec, err = targets._load(info, doc["doc_id"])
        state, _ = targets._record_state(rec, err, doc)
        if state == "current":
            cur += 1
            n_out += len(rec.get("outputs") or [])
            n_evt += len(rec.get("events") or [])
            n_rej += len(rec.get("rejected") or [])
        elif state == "missing":
            miss += 1
        else:
            invalid += 1
    files = len([f for f in (info.root / "target").glob("*.json") if not f.name.startswith(".")])
    rows.append((info.name, len(docs), files, cur, miss, invalid, n_out, n_evt, n_rej))
    grand_docs += len(docs)
    grand_files += files
    grand_cur += cur
    grand_out += n_out
    grand_evt += n_evt

print(f"{'库':<30}{'docs':>6}{'files':>7}{'current':>9}{'missing':>9}{'stale':>7}"
      f"{'outputs':>9}{'events':>8}{'rejected':>9}")
for name, n, f, c, m, inv, o, e, r in rows:
    print(f"{name:<30}{n:>6}{f:>7}{c:>9}{m:>9}{inv:>7}{o:>9}{e:>8}{r:>9}")
print(f"\n合计 docs={grand_docs} files={grand_files} current={grand_cur} "
      f"outputs={grand_out} events={grand_evt}")
print(f"完成率 {grand_cur}/{grand_docs} ({grand_cur * 100 // max(grand_docs, 1)}%)")