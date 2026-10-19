#!/usr/bin/env python3
"""target-v2 全文提取：把 .knowledge/<库>/target/<doc_id>.json 升级为 schema_version=2。

数据契约与校验在 src/targets.py（应用与本脚本共用同一份），提示词为
src/prompts/target_extract.md。本脚本只负责选择文件、调度模型、汇总清单。

    python datapipe/scripts/extract_targets.py                       # 只读计划：各库待提取/已是 v2/待入库
    python datapipe/scripts/extract_targets.py --corpus 医疗 --trial 3   # 试跑 3 份，写入临时目录并输出新旧对照，不改 target/
    python datapipe/scripts/extract_targets.py --corpus 医疗 --apply     # 实际提取并原子替换

选择：--corpus 为库 id 或名称子串（可重复，默认全部）；--doc 指定 doc_id（可重复）；
--limit 限制本次最多处理份数。已是当前版本、规则和 v2 的文件自动跳过，
失败或未完成的文件保留旧记录，下次运行只重做它们。
每次运行的结果清单写入 .knowledge/.state/target_v2_report.json（试跑写到临时目录）。

使用现有 MODEL_* 配置与代理开关（src/agent/models.py）；未配置密钥时直接失败。
"""

from __future__ import annotations

import argparse
import asyncio
import dataclasses
import json
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src import targets  # noqa: E402
from src.agent.config import get_settings  # noqa: E402
from src.agent.corpora import scan_corpora  # noqa: E402
from src.knowledge import Knowledge  # noqa: E402

REPORT = ROOT / ".knowledge" / ".state" / "target_v2_report.json"


def select_corpora(settings, wanted: list[str]):
    infos = [i for i in scan_corpora(settings) if not i.missing and i.sqlite and i.sqlite.is_file()]
    if not wanted:
        return infos
    return [i for i in infos if any(w == i.id or w in i.name or w in i.dir_name for w in wanted)]


def plan_corpus(info, knowledge, only: set[str]) -> dict:
    todo, done, failed_before = [], 0, 0
    for doc in knowledge.current():
        if only and doc["doc_id"] not in only:
            continue
        record, error = targets._load(info, doc["doc_id"])
        if targets.needs_extraction(record, error, doc):
            todo.append(doc)
            failed_before += bool(record and record.get("schema_version") == targets.SCHEMA_VERSION)
        else:
            done += 1
    return {"todo": todo, "done_v2": done, "retry": failed_before}


def sample_comparison(old: dict | None, new: dict) -> dict:
    """Old-vs-new counts for one document: what v2 found that the v1 sentences did not."""
    v1 = {f["key"]: len(f["items"]) for f in (old or {}).get("facets", [])}
    return {
        "doc_id": new["doc_id"], "status": new["process"]["status"],
        "v1_items": v1 or None,
        "v2_items": {f["key"]: len(f["items"]) for f in new["facets"]},
        "v2_outputs": len(new["outputs"]), "v2_events": len(new["events"]),
        "v2_relations": len(new["relations"]), "rejected": len(new["rejected"]),
        "outputs_check": new["outputs_check"], "error": new.get("error", ""),
    }


async def run(args) -> int:
    settings = get_settings()
    infos = select_corpora(settings, args.corpus)
    only = set(args.doc or [])
    plans = []
    for info in infos:
        knowledge = Knowledge(info.sqlite, settings=settings, vectordb_dir=info.vectordb_dir,
                              source_root=info.source_dir)
        plans.append((info, knowledge, plan_corpus(info, knowledge, only)))

    print(f"{'库':<28}{'待提取':>8}{'已是v2':>8}{'v2待重做':>10}")
    for info, _, plan in plans:
        print(f"{info.name:<28}{len(plan['todo']):>8}{plan['done_v2']:>8}{plan['retry']:>10}")
    jobs = [(info, knowledge, doc) for info, knowledge, plan in plans for doc in plan["todo"]]
    if args.limit or args.trial:
        jobs = jobs[: args.trial or args.limit]
    if not (args.apply or args.trial):
        print(f"\n只读计划：本次将处理 {len(jobs)} 份。加 --trial N 试跑或 --apply 执行。")
        return 0
    if not settings.model_api_key:
        print("未配置 MODEL_API_KEY，无法调用模型。", file=sys.stderr)
        return 2

    scratch = tempfile.mkdtemp(prefix="target-v2-trial-") if args.trial else None
    semaphore = asyncio.Semaphore(args.concurrency)
    results: list[dict] = []
    started = time.monotonic()

    async def one(info, knowledge, doc):
        # A trial publishes into a throw-away corpus root, so target/ is never touched.
        target_info = dataclasses.replace(info, root=Path(scratch) / info.id) if scratch else info
        old, _ = targets._load(info, doc["doc_id"])
        async with semaphore:
            try:
                record = await targets.extract_target(
                    target_info, knowledge, settings, doc["doc_id"], force=True,
                    max_calls=args.max_calls, timeout=args.timeout)
            except Exception as exc:  # per-file failure goes to the list, never stops the run
                results.append({"corpus": info.name, "doc_id": doc["doc_id"], "title": doc["title"],
                                "outcome": "失败", "error": f"{type(exc).__name__}: {exc}"})
                return
        item = {"corpus": info.name, "doc_id": doc["doc_id"], "title": doc["title"],
                "outcome": "成功" if record["process"]["status"] == "已完成" else "未完成",
                "model_calls": record["params"]["model_calls"], **sample_comparison(old, record)}
        results.append(item)
        print(f"[{len(results)}/{len(jobs)}] {item['outcome']} {doc['title'][:40]} "
              f"成果{item['v2_outputs']} 事件{item['v2_events']} 拒绝{item['rejected']}")

    await asyncio.gather(*(one(*job) for job in jobs))
    summary = {"mode": "trial" if args.trial else "apply", "finished_at": time.strftime("%F %T"),
               "seconds": round(time.monotonic() - started), "model": settings.model_name,
               "model_calls": sum(r.get("model_calls", 0) for r in results),
               "counts": {k: sum(r["outcome"] == k for r in results) for k in ("成功", "未完成", "失败")},
               "results": results}
    path = Path(scratch) / "report.json" if scratch else REPORT
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{summary['counts']}，模型调用 {summary['model_calls']} 次，清单：{path}")
    return 0 if not summary["counts"]["失败"] and not summary["counts"]["未完成"] else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--corpus", action="append", default=[])
    parser.add_argument("--doc", action="append", default=[])
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--trial", type=int, default=0, help="试跑 N 份，不改 target/")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--max-calls", type=int, default=40, help="每份文档最多调用模型次数")
    parser.add_argument("--timeout", type=float, default=900, help="每份文档的运行时限（秒）")
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
