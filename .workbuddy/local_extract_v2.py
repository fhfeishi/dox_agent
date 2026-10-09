#!/usr/bin/env python3
"""本地 target-v2 提取（零模型调用，全部引文逐字取自原文）。

背景：deepseek api 不可用，机器人自动化库尚无任何四维产物（target/ 仅剩 4 个
损坏的 sed 临时文件）。本脚本按 NSFC 结题/成果报告的固定版式，用确定性规则把
「场景 / 问题 / 技术 / 成果」四维 + 可枚举成果(outputs) + 事件(events) 抽出来，
再交给 src/targets.py 的 _normalize_segment / _Merge / _outputs_check 做与线上
**完全相同**的校验，因此 schema、枚举、引文可溯源、id 派生与模型产出同构。

设计原则（保守，宁缺毋滥）：
  四维  —— 只从明确的版式小节取句子（科学问题→问题；关键技术/研究内容→技术；
           应用背景/应用场景/应用示范→场景；成果/进展/结论→成果），引文=原句。
  outputs —— 直接消费报告自带的「成果列表(N)」著录（achievement_list.parse），
           每条 title 就是原文行，kind 由 type 映射，status 按 type 固定。
  events —— 复用 derive_events 的规则（仅专利/论文/样机/部署/试验叙述段）。

用法：
    python3 .workbuddy/local_extract_v2.py 机器人自动化 --dry     # 只统计不落盘
    python3 .workbuddy/local_extract_v2.py 机器人自动化           # 实际写入
"""
from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src import achievement_list, targets  # noqa: E402

sys.path.insert(0, str(ROOT / ".workbuddy"))
import derive_events  # noqa: E402


# ---------- 版式小节 -> 维度 ----------
# 命中「标题行 + 其后正文」，取正文首句作为该维度条目。宁可漏，不可编。
DIM_SECTIONS = {
    "问题": [
        re.compile(r"(科学问题|关键科学问题|研究的关键科学问题|拟解决的关键科学问题)"),
        re.compile(r"(面临的关键(科学)?(问题|技术问题)|存在的主要问题|主要挑战|研究难点)"),
    ],
    "技术": [
        re.compile(r"(关键技术|研究内容|主要研究内容|技术路线|研究方法|技术方案|研究方案)"),
        re.compile(r"(拟解决的关键技术问题|主要研究内容与目标|研究目标)"),
    ],
    "场景": [
        re.compile(r"(应用背景|研究背景|应用场景|应用前景|应用需求|应用示范|应用价值)"),
        re.compile(r"(项目背景|立项依据|背景与意义)"),
    ],
    "成果": [
        re.compile(r"(主要研究成果|研究成果|研究进展|阶段成果|预期成果|成果形式|结论与展望|结题摘要|中文摘要|项目摘要)"),
    ],
}
# 正文首句过短或像目录/表格行则跳过
BAD_HEAD = re.compile(r"^(表|图|附表|附图|\d+[\.、]?\s*$|说明|注[:：])")
HEADING = re.compile(r"^#{1,6}\s*(.+?)\s*$")

# 关键词挖掘用词表：句子需命中 >=2 个才采信（泛词单独出现不构成证据）
DIM_KEYWORDS = {
    "问题": ("问题", "挑战", "难点", "瓶颈", "难以", "缺乏", "不足", "局限",
             "尚未", "亟需", "待解决", "关键科学问题", "需求急迫"),
    "技术": ("技术", "方法", "模型", "算法", "架构", "框架", "策略", "机制",
             "设计", "构建", "研发", "优化", "训练", "识别", "感知", "定位",
             "规划", "控制", "决策", "融合", "网络", "系统"),
    "场景": ("应用", "场景", "需求", "背景", "前景", "部署", "示范", "推广",
             "服务", "领域", "行业", "面向", "工程", "产业化", "作战", "诊疗"),
    "成果": ("成果", "发表", "论文", "专利", "授权", "申请", "研制", "开发",
             "完成", "实现", "突破", "提升", "达到", "指标", "验收", "部署",
             "推广应用", "获得", "构建了", "形成了"),
}


def _clean_sentence(sent: str) -> str:
    s = sent.strip()
    s = re.sub(r"^[\s、，,。；;：:\-—•*]+", "", s)
    return s.strip()


def _sections(markdown: str) -> list[tuple[str, int, int]]:
    """返回 (标题文本, 小节正文起, 小节正文止)。以 ATX 标题为界。"""
    marks = [(m.start(), m.end(), m.group(1).strip())
             for m in re.finditer(r"(?m)^#{1,6}\s*(.+?)\s*$", markdown)]
    out = []
    for i, (_s, body_start, head) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(markdown)
        out.append((head, body_start, end))
    return out


def _first_sentence(body: str, lo: int = 12, hi: int = 300) -> str:
    """小节正文首个像样的句子（按中文句读切分）。"""
    body = re.sub(r"\s+", " ", body).strip()
    if not body:
        return ""
    # 去掉表格行/图题等噪声
    for part in re.split(r"(?<=[。！？；])", body):
        cand = _clean_sentence(part)
        if not (lo <= len(cand) <= hi):
            continue
        if BAD_HEAD.match(cand) or cand.startswith("|"):
            continue
        if not re.search(r"[一-鿿A-Za-z]", cand):
            continue
        return cand
    return ""


def _mine_sentences(markdown: str, dim: str, need: int) -> list[str]:
    """关键词评分的句子挖掘：给版式未命中的维度兜底。

    510 份报告版式高度不统一（仅约 202 份含「科学问题/研究内容」小节），
    只靠标题匹配会让问题/技术两维几乎为空。这里对全文句子按维度关键词
    命中数打分，取分最高且长度合规的若干句——引文仍是原句，逐字可溯源。
    """
    keywords = DIM_KEYWORDS.get(dim, ())
    if not keywords:
        return []
    cands: list[tuple[int, int, str]] = []  # (score, 起始位置, 句子)
    for m in re.finditer(r"[^。！？；\n]{%d,%d}[。！？；]?" % (14, 220), markdown):
        sent = m.group(0).strip()
        if not (14 <= len(sent) <= 220):
            continue
        if sent.startswith("|") or sent.startswith("#") or BAD_HEAD.match(sent):
            continue
        if sent not in markdown:
            continue
        score = sum(1 for kw in keywords if kw in sent)
        if score >= 2:  # 至少命中 2 个关键词，避免泛词误抓
            cands.append((score, m.start(), sent))
    # 分数优先；同分取靠前（背景/问题/技术通常在成果之前）
    cands.sort(key=lambda x: (-x[0], x[1]))
    out, seen = [], set()
    for _score, _pos, sent in cands:
        key = re.sub(r"\s+", "", sent)[:60]
        if key in seen:
            continue
        seen.add(key)
        out.append(sent)
        if len(out) >= need:
            break
    return out


def extract_facets(markdown: str) -> dict[str, list[dict]]:
    secs = _sections(markdown)
    facets: dict[str, list[dict]] = {k: [] for k in targets.DIMENSIONS}
    for dim, patterns in DIM_SECTIONS.items():
        for head, bstart, bend in secs:
            if not any(p.search(head) for p in patterns):
                continue
            sent = _first_sentence(markdown[bstart:bend])
            if not sent:
                continue
            # 引文必须逐字在原文中（_locate 会再校验，这里先自检）
            if sent not in markdown:
                continue
            item = {
                "id": f"{dim}-{len(facets[dim]) + 1}",
                "name": sent[:60],
                "desc": sent[:400],
                "evidence": [{"quote": sent}],
            }
            if dim == "成果":
                item["status"] = "已取得"
                item["status_raw"] = ""
                item["self_reported"] = True
            if dim == "技术":
                item["role"] = "关键创新"
            facets[dim].append(item)
            if len(facets[dim]) >= 3:  # 每维最多 3 条，避免噪声
                break
        # 场景维若版式未命中，用摘要首句兜底仍算「引文在原文」，但仅当确有摘要
        if dim == "场景" and not facets[dim]:
            m = re.search(r"(?s)(中文摘要|项目摘要|结题摘要)[:：]?\s*(.+?)(?=\n##\s|\Z)", markdown)
            if m:
                sent = _first_sentence(m.group(2))
                if sent and sent in markdown:
                    facets[dim].append({
                        "id": "场景-1", "name": sent[:60], "desc": sent[:400],
                        "evidence": [{"quote": sent}]})

    # 兜底：任何维度仍不足 2 条时，用关键词挖掘补齐（引文仍是原句）
    for dim in targets.DIMENSIONS:
        have = len(facets[dim])
        if have >= 2:
            continue
        need = 2 - have
        existing = {re.sub(r"\s+", "", it["evidence"][0]["quote"])[:60] for it in facets[dim]}
        for sent in _mine_sentences(markdown, dim, need):
            key = re.sub(r"\s+", "", sent)[:60]
            if key in existing:
                continue
            existing.add(key)
            item = {
                "id": f"{dim}-{len(facets[dim]) + 1}",
                "name": sent[:60], "desc": sent[:400],
                "evidence": [{"quote": sent}],
            }
            if dim == "成果":
                item["status"] = "已取得"
                item["status_raw"] = ""
                item["self_reported"] = True
            if dim == "技术":
                item["role"] = "关键创新"
            facets[dim].append(item)
    return facets


# ---------- outputs：消费报告自带「成果列表(N)」 ----------
KIND_MAP = {
    "期刊论文": "期刊论文", "会议论文": "会议论文", "专利": "专利",
    "奖励": "奖励/专著", "专著": "奖励/专著",
}
STATUS_MAP = {
    "期刊论文": "已发表", "会议论文": "已发表", "专利": "授权",
    "奖励": "已取得", "专著": "已取得",
}


def extract_outputs(markdown: str) -> list[dict]:
    parsed = achievement_list.parse(markdown)
    if parsed is None:
        return []
    outputs = []
    for i, item in enumerate(parsed["items"]):
        kind = KIND_MAP.get(item["type"])
        if not kind:
            continue
        title = item["title"]
        if not title or title not in markdown:
            continue
        quote = title if len(title) <= 2000 else title[:2000]
        if quote not in markdown:
            continue
        outputs.append({
            "id": f"out-{i + 1}",
            "kind": kind,
            "attribution": "本项目",
            "status": STATUS_MAP[item["type"]],
            "title": title[:300],
            "status_raw": "",
            "evidence": [{"quote": quote}],
        })
    return outputs


def build_record(info, doc, markdown: str, chunks: list[dict], is_pdf: bool) -> dict:
    facets = extract_facets(markdown)
    outputs = extract_outputs(markdown)
    events = derive_events.extract_events(markdown)

    raw = {
        "facets": [{"key": key, "items": facets.get(key, [])} for key in targets.DIMENSIONS],
        "relations": [],  # 关系需原文明示，规则难以可靠判定，宁缺毋滥
        "outputs": outputs,
        "events": events,
    }
    start, end = 0, len(markdown)
    segment = targets._normalize_segment(raw, markdown, start, end, chunks, is_pdf)
    merge = targets._Merge(doc["version"])
    merge.add(segment)
    outs = list(merge.outputs.values())
    record = {
        "doc_id": doc["doc_id"],
        "version": doc["version"],
        "source_hash": doc.get("source_sha256", ""),
        "schema_version": targets.SCHEMA_VERSION,
        "prompt_version": targets.PROMPT_VERSION,
        "model": "local-extraction",
        "params": {"segment_chars": 6000, "model_calls": 0},
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").UTC).isoformat(),
        "process": {"status": "已完成",
                    "coverage": {"processed": 1, "total": 1, "failed": []}},
        "facets": [{"key": dim, "state": ("has" if items else "未提及"),
                    "items": list(items.values())} for dim, items in merge.facets.items()],
        "relations": merge.relations,
        "outputs": outs,
        "events": list(merge.events.values()),
        "rejected": merge.rejected,
        "outputs_check": targets._outputs_check(markdown, outs),
    }
    return record


def main() -> int:
    corpus = sys.argv[1] if len(sys.argv) > 1 else "机器人自动化"
    dry = "--dry" in sys.argv
    from src.agent.config import get_settings
    from src.agent.corpora import scan_corpora
    from src.knowledge import Knowledge

    settings = get_settings()
    info = next(i for i in scan_corpora(settings) if corpus in i.name)
    knowledge = Knowledge(info.sqlite, settings=settings,
                          vectordb_dir=info.vectordb_dir, source_root=info.source_dir)

    docs = knowledge.current()
    chunks_by_doc: dict[str, list[dict]] = {}
    for c in knowledge.chunk_rows():
        chunks_by_doc.setdefault(c["doc_id"], []).append(c)

    ok = fail = skipped = 0
    tot_out = tot_evt = tot_rej = 0
    facet_counts = {k: 0 for k in targets.DIMENSIONS}
    for doc in docs:
        target_path = info.root / targets.TARGET_DIRNAME / f"{doc['doc_id']}.json"
        if target_path.is_file():
            try:
                existing, err = targets._load(info, doc["doc_id"])
                if not err and not targets.needs_extraction(existing, err, doc):
                    skipped += 1
                    continue
            except Exception:
                pass
        try:
            markdown = knowledge.read_markdown(doc["doc_id"], doc["version"])
        except Exception as exc:
            print(f"读取失败 {doc['doc_id']}: {exc}")
            fail += 1
            continue
        if not markdown:
            skipped += 1
            continue
        chunks = [c for c in chunks_by_doc.get(doc["doc_id"], []) if c["version"] == doc["version"]]
        is_pdf = doc.get("kind") == "pdf"
        try:
            record = build_record(info, doc, markdown, chunks, is_pdf)
        except Exception as exc:
            print(f"构建失败 {doc['doc_id']}: {type(exc).__name__}: {exc}")
            fail += 1
            continue
        for f in record["facets"]:
            facet_counts[f["key"]] += len(f["items"])
        tot_out += len(record["outputs"])
        tot_evt += len(record["events"])
        tot_rej += len(record["rejected"])
        if not dry:
            targets._save(info, record)
        ok += 1

    verb = "试跑" if dry else "已写入"
    print(f"\n{verb}：成功 {ok}，跳过 {skipped}，失败 {fail}")
    print(f"四维条目合计：{facet_counts}")
    print(f"outputs {tot_out}，events {tot_evt}，rejected {tot_rej}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
