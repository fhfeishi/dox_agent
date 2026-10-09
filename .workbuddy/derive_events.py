#!/usr/bin/env python3
"""从已落盘的 target v2 记录派生 events（可溯源，零模型调用）。

为什么需要它：`成果列表` 是系统渲染的简化著录（形如 `[期刊论文] 题名 — 作者`），
不含发表日期，因此无法从中派生事件；真实日期只出现在正文的「专利申报或授权情况」
等叙述段落。本脚本只在**原文明确写出事件 + 日期 + 状态**时才生成事件，
生成后交给 src/targets.py 的 _normalize_segment / _Merge 做同一套校验，
因此落盘结果与模型产出的契约完全一致。

保守策略（宁可少提取，不推断）：
  事件类型由原文状态词决定，缺状态词则不提取；
  日期必须能在该条引文中读到（targets._normalize_event 会再校验一次）；
  派生出的事件 id 与 _Merge 一致（type\\0date\\0desc），重复运行幂等。
"""
from __future__ import annotations

import json
import re
import sqlite3
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src import targets  # noqa: E402

# 事件类型 <- 原文状态词。顺序有意义，先匹配更具体的状态。
EVENT_RULES = [
    # 专利授权：出现授权/颁证/证书号 ZL 且同段有授权字样
    (re.compile(r"(专利|发明)[^。；\n]{0,40}?(授权|已授权)"), "专利授权"),
    (re.compile(r"专利申请|申请日期|受理"), "专利申请"),
    (re.compile(r"(论文|文章|研究)[^。；\n]{0,20}?(发表|已发表|发表在|刊发)"), "论文发表"),
    (re.compile(r"(样机|原型机|装置|系统)[^。；\n]{0,20}?(研制成功|研制完成|样机完成|建成|通过验收)"), "样机"),
    (re.compile(r"(部署|上线|推广应用|应用于临床|临床应用|落地应用|应用示范)"), "部署"),
    (re.compile(r"(完成|开展|进行了|进行了为期)[^。；\n]{0,25}?(试验|实验|验证|测试)"), "试验"),
]
# 这些词说明该句是「计划/拟」而非已完成，不提取为事件
FUTURE = re.compile(r"(拟将|拟开展|拟申请|拟发表|计划|将于|拟建立|拟构建|预期|有望|下一步拟)")
# 否定/未完成事实：出现即整句丢弃，避免把「没有公开发表」当成论文发表事件
NEGATIVE = re.compile(r"(未公开发表|尚未发表|没有公开发表|未发表|尚未公开|未公开|尚未见刊|未见刊|投稿至|已投稿|在审|尚未授权|未授权|申请中|实审中|公开中)")
# 「部署/推广」类里这些是学术报告而非部署事件
NOT_DEPLOY = re.compile(r"(推广项目|培训班|学术报告|学术会议|会议报告|论坛|讲座|研讨会|大会)")

DATE_FULL = re.compile(r"(19|20)\d{2}\s*[-年]\s*\d{1,2}\s*[-月]\s*\d{1,2}\s*日?")
DATE_YM = re.compile(r"(19|20)\d{2}\s*[-年]\s*\d{1,2}\s*月?")
DATE_Y = re.compile(r"(19|20)\d{2}\s*年")
# 专利状态：优先取这类字段给出的日期，而非句子里任意位置的第一��日期
PAT_FIELD_DATE = re.compile(r"(申请日期|授权公告日|公开日|公告日)\s*[:：]\s*((19|20)\d{2}\s*[-年.]\s*\d{1,2}\s*[-月.]\s*\d{1,2}|"
                            r"(19|20)\d{2}\s*[-年.]\s*\d{1,2}|(19|20)\d{2})")


def norm_date(raw: str) -> str:
    text = raw.strip()
    nums = re.findall(r"\d+", text)
    if len(nums) >= 3:
        return f"{nums[0]}-{int(nums[1]):02d}-{int(nums[2]):02d}"
    if len(nums) == 2:
        return f"{nums[0]}-{int(nums[1]):02d}"
    return nums[0] if nums else ""


def sentences(markdown: str, lo: int, hi: int) -> list[str]:
    body = markdown[lo:hi]
    parts = re.split(r"(?<=[。；\n])", body)
    return [p.strip() for p in parts if p.strip()]


def extract_events(markdown: str) -> list[dict]:
    """逐句找「事件 + 状态词 + 可溯源日期」。返回未归一化的原始条目。"""
    found: list[dict] = []
    seen: set[str] = set()
    for sentence in sentences(markdown, 0, len(markdown)):
        if not (12 <= len(sentence) <= 400):
            continue
        if FUTURE.search(sentence) or NEGATIVE.search(sentence):
            continue
        if not re.search(r"(申请日期|授权公告日|授权|公告号|专利|发表|刊发|研制|样机|部署|上线|推广应用|临床应用|完成.{0,6}(试验|实验|验证))", sentence):
            continue
        etype = None
        for pattern, kind in EVENT_RULES:
            if pattern.search(sentence):
                etype = kind
                break
        if not etype:
            continue
        if etype == "部署" and NOT_DEPLOY.search(sentence):
            continue
        # 日期优先取「申请日期/授权公告日」这类字段值，避免抓到状态括号里的审查日期
        field = PAT_FIELD_DATE.search(sentence)
        if field:
            date = norm_date(field.group(2))
        else:
            m = DATE_FULL.search(sentence) or DATE_YM.search(sentence) or DATE_Y.search(sentence)
            date = norm_date(m.group(0)) if m else ""
        if not date:
            continue
        desc = sentence if len(sentence) <= 300 else sentence[:300]
        key = f"{etype}\0{date}\0{desc[:80]}"
        if key in seen:
            continue
        seen.add(key)
        found.append({
            "id": f"evt-{len(found) + 1}",
            "type": etype,
            "status": "已取得",
            "date": date,
            "desc": desc,
            "result": "",
            "environment": "",
            "self_reported": True,
            "tech_ids": [],
            "output_ids": [],
            "evidence": [{"quote": sentence if len(sentence) <= 2000 else sentence[:2000]}],
        })
    return found


def main() -> int:
    corpus = sys.argv[1] if len(sys.argv) > 1 else "AI与医疗"
    dry = "--apply" not in sys.argv
    from src.agent.config import get_settings
    from src.agent.corpora import scan_corpora

    settings = get_settings()
    info = next(i for i in scan_corpora(settings) if corpus in i.name)
    db = info.sqlite
    tmp = Path(tempfile.gettempdir()) / f"evt_{info.id[-6:]}.db"
    shutil.copyfile(db, tmp)
    con = sqlite3.connect(str(tmp))
    rows = con.execute("SELECT doc_id, markdown FROM doc_markdown").fetchall()
    con.close()

    added_docs = added_events = 0
    skipped_no_quote = 0
    sample_doc = "--sample" in sys.argv
    shown = 0
    for doc_id, markdown in rows:
        path = info.root / targets.TARGET_DIRNAME / f"{doc_id}.json"
        if not path.is_file() or not markdown:
            continue
        record = json.loads(path.read_text(encoding="utf-8"))
        # 去重口径与 _Merge 一致：type + date + 归一化 desc 前 120 字
        existing = {(e["type"], e["date"], targets._norm(e["desc"])[:120])
                    for e in record.get("events") or []}
        raw = extract_events(markdown)
        fresh = []
        for item in raw:
            key = (item["type"], item["date"], targets._norm(item["desc"])[:120])
            if key in existing:
                continue
            fresh.append(item)
        if not fresh:
            continue
        try:
            segment = targets._normalize_segment(
                {"facets": [{"key": k, "items": []} for k in targets.DIMENSIONS],
                 "relations": [], "outputs": [], "events": fresh},
                markdown, 0, len(markdown), [], False)
        except ValueError as exc:
            skipped_no_quote += len(fresh)
            print(f"  跳过 {doc_id}: {exc}")
            continue
        merge = targets._Merge(record["version"])
        # 复用 _Merge 的 id 派生与去重：先灌入已有事件，再灌新事件
        for e in record.get("events") or []:
            identity = f"{e['type']}\0{e['date']}\0" + targets._norm(e["desc"])[:120]
            merge.events[identity] = {
                **{k: v for k, v in e.items() if k not in ("tech_refs", "output_refs")},
                "tech_ids": e.get("tech_ids", []), "output_ids": e.get("output_ids", []),
                "evidence": e.get("evidence", [])}
        before = len(record.get("events") or [])
        merge.add(segment)
        new_events = list(merge.events.values())
        gained = len(new_events) - before
        if gained <= 0:
            continue
        record["events"] = new_events
        added_docs += 1
        added_events += gained
        if sample_doc and shown < 4:
            shown += 1
            print(f"  样本 {doc_id}：新增 {gained} 条")
            for e in new_events:
                print(f"    [{e['type']}|{e['date']}] {e['desc'][:100]}")
        if not dry:
            targets._save(info, record)
    print(f"{'试跑' if dry else '已写入'}：{added_docs} 份文档新增 {added_events} 条事件"
          f"（结构校验失败跳过 {skipped_no_quote} 条）")
    return 0


if __name__ == "__main__":
    sys.exit(main())