"""Reproducible retrieval evaluation against the versioned project fixtures."""

import argparse
import json
from pathlib import Path

from .agent.config import get_settings
from .knowledge import Knowledge


def evaluate(store: Knowledge, cases: list[dict], limit: int = 6) -> dict:
    rows = []
    for case in cases:
        hits = store.search(case["query"], limit=limit)
        reads = [
            store.read(hit["doc_id"], hit["page"], hit["start_line"], 60, hit["version"])
            for hit in hits
        ]
        relevant = [
            (rank, item) for rank, item in enumerate(reads, 1)
            if Path(item["origin"]).name == case["expected_source"]
        ]
        source_text = "\n".join(item["text"] for _, item in relevant)
        missing = [term for term in case["expected_terms"] if term not in source_text]
        rows.append({
            "id": case["id"], "query": case["query"],
            "source_rank": relevant[0][0] if relevant else None,
            "missing_terms": missing,
            "evidence_hit": bool(relevant) and not missing,
            "retrieved_titles": [item["title"] for item in reads],
        })
    count = len(rows)
    return {
        "scope": "retrieval plus version-checked read; not answer accuracy",
        "cases": count, "limit": limit,
        "source_recall": sum(row["source_rank"] is not None for row in rows) / count if count else 0,
        "evidence_recall": sum(row["evidence_hit"] for row in rows) / count if count else 0,
        "mrr": sum(1 / row["source_rank"] for row in rows if row["source_rank"]) / count if count else 0,
        "results": rows,
    }


def main():
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=settings.knowledge_root / "project_progress/evals/retrieval_v4.jsonl")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    cases = [json.loads(line) for line in args.dataset.read_text(encoding="utf-8").splitlines() if line.strip()]
    result = evaluate(Knowledge(settings.data_dir / "knowledge.sqlite3", settings=settings), cases)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key != "results"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
