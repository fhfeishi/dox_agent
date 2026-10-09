#!/usr/bin/env python3
"""从原文按定位词直接截取引文，替代手工转写——根除「凭印象改写」类失败。

用法：在 CASES 里给出 doc_id、条目键与定位子串（该子串必须在原文中存在），
本脚本以命中位置为中心向两侧扩展到句边界，产出可直接放进 draft 的引文。
"""
import sqlite3
import shutil
import tempfile
from pathlib import Path

CORPUS = Path(".knowledge/自然科学基金-AI与农业")
# (doc_id, 条目类型, 条目名, 定位子串, 取前文长度, 取后文长度)
CASES = [
    ("162b0c7e55c4123cb195", "问题", "遗传互作解析困难", "传统育种技术已不能适应当前玉米生产的需求", 30, 0),
    ("162b0c7e55c4123cb195", "关系", "场景-问题", "以指导多基因不同表达量的精准组合", 0, 0),
    ("dda1cb293ef91592ecb8", "关系", "验证", "本方法依旧能够维持较高且稳定的准确率", 45, 0),
]


def load(db_id):
    tmp = Path(tempfile.gettempdir()) / f"slice_{db_id[-4:]}.db"
    shutil.copyfile(CORPUS / "datadb" / "knowledge.sqlite3", tmp)
    con = sqlite3.connect(str(tmp))
    md = con.execute("SELECT markdown FROM doc_markdown WHERE doc_id=?", (db_id,)).fetchone()[0]
    con.close()
    return md


SENT_END = "。；\n"


def slice_quote(md, anchor, before, after):
    i = md.find(anchor)
    if i < 0:
        return None
    start = i
    steps = 0
    while steps < before and start > 0 and md[start - 1] not in SENT_END:
        start -= 1
        steps += 1
    # 向前扩到最近的句读边界起点
    while start > 0 and md[start - 1] not in SENT_END:
        start -= 1
    end = i + len(anchor)
    if after:
        steps = 0
        while steps < after and end < len(md) and md[end] not in SENT_END:
            end += 1
            steps += 1
    while end < len(md) and md[end] not in SENT_END:
        end += 1
    return md[start:end].strip()


def main():
    for db_id, kind, name, anchor, before, after in CASES:
        md = load(db_id)
        q = slice_quote(md, anchor, before, after)
        ok = bool(q) and q in md
        print(f"{db_id} | {kind}:{name}")
        print(f"   命中: {ok}")
        print(f"   引文: {q}")


if __name__ == "__main__":
    main()