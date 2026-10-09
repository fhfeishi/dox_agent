#!/usr/bin/env python3
"""统计各库正文中可溯源事件线索的规模，用于评估补 events 的工作量。

判据（保守、可溯源）：
  A. 专利条目行形如「…，YYYY-MM-DD至…，ZL …」或正文专利段落含「申请日期:YYYY」
  B. 含明确年份的成果表述，如「2024年获…」「2025-03-14 至」
不做任何推断，只统计原文中真实出现的日期串及其上下文。
"""
import re
import sqlite3
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATE = re.compile(r"(19|20)\d{2}\s*[-年]\s*\d{1,2}\s*[-月]\s*\d{1,2}|"
                  r"(19|20)\d{2}\s*[-年]\s*\d{1,2}|(19|20)\d{2}\s*年")


def scan(corpus: Path):
    db = corpus / "datadb" / "knowledge.sqlite3"
    if not db.is_file():
        return None
    tmp = Path(tempfile.gettempdir()) / f"evscan_{corpus.name[-4:]}.db"
    shutil.copyfile(db, tmp)
    con = sqlite3.connect(str(tmp))
    rows = con.execute("SELECT doc_id, markdown FROM doc_markdown").fetchall()
    con.close()
    hits = []
    for doc_id, md in rows:
        found = DATE.findall(md or "")
        if found:
            hits.append((doc_id, len(found)))
    return len(rows), hits


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    grand_docs = grand_hits = 0
    for corpus in sorted((ROOT / ".knowledge").glob("自然科学基金-*")):
        if only and only not in corpus.name:
            continue
        result = scan(corpus)
        if result is None:
            continue
        total, hits = result
        grand_docs += total
        grand_hits += len(hits)
        print(f"{corpus.name}: 文档 {total} | 含可溯源日期串的文档 {len(hits)} "
              f"({len(hits)*100//max(total,1)}%) | 日期串总数 {sum(n for _, n in hits)}")
    print(f"\n合计: 文档 {grand_docs} | 含日期文档 {grand_hits}")


if __name__ == "__main__":
    main()