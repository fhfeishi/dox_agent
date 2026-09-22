"""Reproducible report-level retrieval evaluation (L7).

Reuses the retrieval engine — no separate framework. Metrics: ``report_recall@k``,
``MRR``, retrieval latency (P50/P95), average context tokens, no-match rate and
project-dedup accuracy. Only the four calibrated parameters are exposed via CLI
(``MIN_TERM_COVER``, ``PER_DOC_TOP_M``, ``MIN/MAX_REPORTS``); ``REL_COVER`` and
``GENERIC_DF_RATIO`` stay at their fixed defaults.
"""

import argparse
import json
import statistics
import time
from dataclasses import replace
from pathlib import Path

from .agent.config import get_settings
from .knowledge import Knowledge
from .retrieval import RetrievalConfig, assemble_reports

DATASET = Path(__file__).resolve().parents[1] / "tests/data/fund_retrieval.jsonl"


def _p95(values: list[float]) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return round(values[0], 1)
    return round(statistics.quantiles(values, n=20)[18], 1)


def evaluate(store: Knowledge, cases: list[dict], *, task_id: str = "task1",
             config: RetrievalConfig | None = None) -> dict:
    config = config or RetrievalConfig()
    rows: list[dict] = []
    latencies: list[float] = []
    context_tokens: list[int] = []
    matched = dedup_ok = 0
    for case in cases:
        started = time.perf_counter()
        result = store.retrieve(case["query"], task_id=task_id, config=config)
        latencies.append((time.perf_counter() - started) * 1000)
        expected = case.get("expected_source", "")
        rank = next((index for index, report in enumerate(result.reports, 1)
                     if Path(report.doc.origin).name == expected), None)
        projects = [report.doc.project_no or report.doc.doc_id for report in result.reports]
        dedup = len(projects) == len(set(projects))
        if result.matched:
            matched += 1
            dedup_ok += dedup
            context = assemble_reports(result.reports, store.read_markdown,
                                       total_tokens=10 ** 9, report_tokens=10 ** 9)
            context_tokens.append(context.tokens)
        rows.append({"id": case.get("id", ""), "query": case["query"], "matched": result.matched,
                     "reason": result.reason, "report_rank": rank, "project_dedup": dedup,
                     "reports": [report.doc.title for report in result.reports]})
    count = len(rows) or 1
    return {
        "scope": "report-level retrieval (BM25-only); not answer accuracy",
        "task_id": task_id,
        "config": {"min_term_cover": config.min_term_cover, "per_doc_top_m": config.per_doc_top_m,
                   "min_reports": config.min_reports, "max_reports": config.max_reports,
                   "rel_cover": config.rel_cover, "generic_df_ratio": config.generic_df_ratio},
        "cases": len(rows),
        "report_recall": sum(row["report_rank"] is not None for row in rows) / count,
        "mrr": sum(1 / row["report_rank"] for row in rows if row["report_rank"]) / count,
        "no_match_rate": 1 - matched / count,
        "project_dedup_accuracy": dedup_ok / matched if matched else 0.0,
        "avg_context_tokens": round(statistics.mean(context_tokens)) if context_tokens else 0,
        "latency_ms_p50": round(statistics.median(latencies), 1),
        "latency_ms_p95": _p95(latencies),
        "results": rows,
    }


def load_cases(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main():
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--db", type=Path, default=settings.data_dir / "knowledge.sqlite3")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--task", default="task1")
    parser.add_argument("--min-term-cover", type=float, default=None)
    parser.add_argument("--per-doc-top-m", type=int, default=None)
    parser.add_argument("--max-reports", type=int, default=None)
    args = parser.parse_args()

    config = RetrievalConfig()
    updates: dict = {}
    if args.min_term_cover is not None:
        updates["min_term_cover"] = args.min_term_cover
    if args.per_doc_top_m is not None:
        updates["per_doc_top_m"] = args.per_doc_top_m
    if args.max_reports is not None:
        updates["max_reports"] = {**config.max_reports, args.task: args.max_reports}
    if updates:
        config = replace(config, **updates)

    result = evaluate(Knowledge(args.db, settings=settings), load_cases(args.dataset),
                      task_id=args.task, config=config)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key != "results"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
