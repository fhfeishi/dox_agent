#!/usr/bin/env python3
"""target-v2 本地提交器：不调用模型，用草稿产出 schema_version=2 记录。

与 tools/get_target_v2.py 的线上产出走**同一份**校验与合并逻辑
（src/targets.py 的 _normalize_segment / _Merge / _outputs_check），因此
schema、枚举校验、引文可溯源、id 派生、证据定位与线上完全一致；
唯一区别是四维内容来自草稿而非模型。

用法:
    python3 .workbuddy/commit_target_v2.py <库名片段> <draft.json> [...]
    python3 .workbuddy/commit_target_v2.py 医疗 draft1.json draft2.json
"""
from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src import targets  # noqa: E402
from src.agent.config import get_settings  # noqa: E402
from src.agent.corpora import scan_corpora  # noqa: E402
from src.knowledge import Knowledge  # noqa: E402
from src.reports import review_segments  # noqa: E402


def build_record(info, knowledge, item):
    doc_id = item["doc_id"]
    docs = {d["doc_id"]: d for d in knowledge.current()}
    doc = docs.get(doc_id)
    if doc is None:
        return None, "文档不存在或当前不可用于提取"
    markdown = knowledge.read_markdown(doc_id, doc["version"])
    pieces = review_segments(markdown)
    if not pieces:
        return None, "解析正文为空"
    chunks = [c for c in knowledge.chunk_rows()
              if c["doc_id"] == doc_id and c["version"] == doc["version"]]
    is_pdf = doc.get("kind") == "pdf"
    start, end = pieces[0][0], pieces[-1][1]

    raw = {
        "facets": [{"key": key, "items": item["facets"].get(key, [])} for key in targets.DIMENSIONS],
        "relations": item.get("relations", []),
        "outputs": item.get("outputs", []),
        "events": item.get("events", []),
    }
    segment = targets._normalize_segment(raw, markdown, start, end, chunks, is_pdf)
    merge = targets._Merge(doc["version"])
    merge.add(segment)
    outputs = list(merge.outputs.values())
    record = {
        "doc_id": doc_id,
        "version": doc["version"],
        "source_hash": doc.get("source_sha256", ""),
        "schema_version": targets.SCHEMA_VERSION,
        "prompt_version": targets.PROMPT_VERSION,
        "model": "local-extraction",
        "params": {"segment_chars": 6000, "model_calls": 0},
        "generated_at": datetime.now(UTC).isoformat(),
        "process": {"status": "已完成",
                    "coverage": {"processed": len(pieces), "total": len(pieces), "failed": []}},
        "facets": [{"key": dim, "state": ("has" if items else "未提及"),
                    "items": list(items.values())} for dim, items in merge.facets.items()],
        "relations": merge.relations,
        "outputs": outputs,
        "events": list(merge.events.values()),
        "rejected": merge.rejected,
        "outputs_check": targets._outputs_check(markdown, outputs),
    }
    return record, ""


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    wanted, drafts = sys.argv[1], sys.argv[2:]
    settings = get_settings()
    infos = [i for i in scan_corpora(settings)
             if not i.missing and i.sqlite and i.sqlite.is_file()
             and (wanted == i.id or wanted in i.name or wanted in i.dir_name)]
    if not infos:
        print(f"未找到知识库：{wanted}")
        return 2
    info = infos[0]
    knowledge = Knowledge(info.sqlite, settings=settings,
                          vectordb_dir=info.vectordb_dir, source_root=info.source_dir)
    print(f"目标库：{info.name}（{info.id}）")

    ok = fail = 0
    for path in drafts:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        for item in payload.get("items", []):
            doc_id = item["doc_id"]
            record, error = build_record(info, knowledge, item)
            if error:
                print(f"失败 {doc_id}: {error}")
                fail += 1
                continue
            targets._save(info, record)
            n_rej = len(record["rejected"])
            print(f"成功 {doc_id} | "
                  + " ".join(f"{f['key']}{len(f['items'])}" for f in record["facets"])
                  + f" | outputs{len(record['outputs'])} events{len(record['events'])}"
                  + f" relations{len(record['relations'])}"
                  + (f" | 拒绝{n_rej}" if n_rej else ""))
            for r in record["rejected"]:
                print(f"    拒绝 [{r['kind']}] {str(r['name'])[:40]}: {r['reason']}")
            ok += 1
    print(f"\n完成 {ok}，失败 {fail}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())