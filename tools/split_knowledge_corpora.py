#!/usr/bin/env python3
"""One-off: split `.knowledge/自然科学基金` into per-domain `自然科学基金-AI与xx` corpora.

Plan (confirmed 2026-09-23):
  * distribute the 35 fund-report PDFs from the old library's topic folders;
  * reuse the existing MinerU output under `parsed/` (no re-parse) by copying each
    per-document folder next to its source PDF;
  * distribute the 50 AI project Markdown files from `.logsdev/archive/mds/` into `source/`;
  * rebuild `datadb/` (import reuse of the parsed cache) and `vectordb/` (dense index) per corpus;
  * delete the old library and the empty placeholder corpora, then rewrite `.state/corpora.json`.

Usage:
    python tools/split_knowledge_corpora.py            # dry run: print the plan only
    python tools/split_knowledge_corpora.py --apply    # execute
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KB = ROOT / ".knowledge"
OLD = KB / "自然科学基金"
MDS = ROOT / ".logsdev" / "archive" / "mds"
sys.path.insert(0, str(ROOT))

# Old source topic folder -> target corpus.
PDF_TOPICS = {
    "自然科学基金-AI与医疗": ["人工智能与健康管理", "人工智能与生物识别"],
    "自然科学基金-AI与农业": ["人工智能与农业"],
    "自然科学基金-AI与机器人自动化": ["人工智能与机器人自动化"],
    "自然科学基金-AI与金融经济": ["人工智能与金融"],
    "自然科学基金-AI与隐私保护": ["人工智能与隐私保护"],
    "自然科学基金-AI与材料": ["人工智能与复合材料"],
    "自然科学基金-AI与大数据": ["人工智能与大数据"],
}

# The downloader first saved some reports with the funding category in the PI slot
# (e.g. ``..._62172313_面上项目_...``) and later re-saved them with the real PI. Drop the
# category-named duplicate when a same-ratifyNo file with a real PI exists.
CATEGORY_PI_MARKERS = ("面上项目", "青年科学基金项目", "重点项目", "重大研究计划",
                       "联合基金项目", "地区科学基金项目", "国家杰出青年科学基金")

# ratifyNo (3rd underscore field of the markdown filename) -> target corpus.
MD_RATIFY = {
    "自然科学基金-AI与医疗": [
        "82171095", "62176166", "U21A20383", "92270108", "82204278", "82170329",
        "82203194", "82030058", "82171100", "32201234", "82172525", "82170861",
        "82171934", "82174224", "82202244", "82203188", "82170309", "82173746", "82172524",
    ],
    "自然科学基金-AI与生物医药": [
        "32030063", "22033001", "62206081", "62172274", "22208217", "22174046",
        "22174120", "22203089", "22204069",
    ],
    "自然科学基金-AI与金融经济": [
        "72172132", "72201289", "72162003", "72202066", "72203051", "72203208",
        "72201077", "72202083",
    ],
    "自然科学基金-AI与信息智能": ["92270001", "62176006", "62206053", "62206118", "62206176"],
    "自然科学基金-AI与社会治理": ["72164004", "72172030", "72172067", "72174172"],
    "自然科学基金-AI与材料": ["52178483", "52208199", "42204152", "52208021"],
    "自然科学基金-AI与农业": ["62206154"],
}

TARGETS = sorted({*PDF_TOPICS, *MD_RATIFY})
# Empty or superseded placeholders to remove (the old library is handled separately).
PLACEHOLDERS = [
    "自然科学基金-AI与健康管理",
    "自然科学基金-AI与生物识别",
    "自然科学基金-AI与复合材料",  # merged into 材料
    "自然科学基金-AI与工程材料",  # merged into 材料
    "自然科学基金-AI与金融",      # renamed to 金融经济
]
ALIAS = {
    "自然科学基金-AI与医疗": "自然科学基金项目-AI与医疗",
    "自然科学基金-AI与生物医药": "自然科学基金项目-AI与生物医药",
    "自然科学基金-AI与农业": "自然科学基金项目-AI与农业",
    "自然科学基金-AI与机器人自动化": "自然科学基金项目-AI与机器人自动化",
    "自然科学基金-AI与金融经济": "自然科学基金项目-AI与金融经济",
    "自然科学基金-AI与信息智能": "自然科学基金项目-AI与信息智能",
    "自然科学基金-AI与社会治理": "自然科学基金项目-AI与社会治理",
    "自然科学基金-AI与隐私保护": "自然科学基金项目-AI与隐私保护",
    "自然科学基金-AI与材料": "自然科学基金项目-AI与材料",
    "自然科学基金-AI与大数据": "自然科学基金项目-AI与大数据",
}


def md_ratify(path: Path) -> str:
    return path.stem.split("_")[2]


def is_category_pi(stem: str) -> bool:
    parts = stem.split("_")
    return len(parts) >= 4 and parts[3].startswith(CATEGORY_PI_MARKERS)


def dedupe_pdfs(pdfs: list[Path]) -> tuple[list[Path], list[Path]]:
    """Drop category-as-PI duplicates that share a ratifyNo with a real-PI file."""
    by_ratify: dict[str, list[Path]] = {}
    for pdf in pdfs:
        by_ratify.setdefault(md_ratify(pdf), []).append(pdf)
    kept: list[Path] = []
    dropped: list[Path] = []
    for group in by_ratify.values():
        real = [pdf for pdf in group if not is_category_pi(pdf.stem)]
        if real:
            kept.extend(sorted(real))
            dropped.extend(sorted(pdf for pdf in group if is_category_pi(pdf.stem)))
        else:
            kept.extend(sorted(group))
    return sorted(kept), sorted(dropped)


def parsed_index() -> dict[str, Path]:
    """doc folder name (= pdf filename) -> old parsed directory."""
    index: dict[str, Path] = {}
    for topic in sorted((OLD / "parsed").iterdir()):
        if not topic.is_dir() or topic.name.startswith("_"):
            continue
        for doc in sorted(topic.iterdir()):
            if doc.is_dir():
                index[doc.name] = doc
    return index


def build_plan() -> dict[str, dict]:
    plan: dict[str, dict] = {target: {"pdfs": [], "parsed": [], "mds": []} for target in TARGETS}
    parse_index = parsed_index()

    dropped: list[Path] = []
    for target, topics in PDF_TOPICS.items():
        group = [pdf for topic in topics for pdf in sorted((OLD / "source" / topic).glob("*.pdf"))]
        group, removed = dedupe_pdfs(group)
        dropped.extend(removed)
        for pdf in group:
            # ``None`` means no cached MinerU output: import_defaults will parse this one.
            plan[target]["pdfs"].append(pdf)
            plan[target]["parsed"].append(parse_index.get(pdf.name))
    if dropped:
        plan.setdefault("_dropped", {"pdfs": dropped, "parsed": [], "mds": []})

    for md in sorted(MDS.glob("*.md")):
        target = next((t for t, nos in MD_RATIFY.items() if md_ratify(md) in nos), None)
        if target is None:
            raise SystemExit(f"未分类的 Markdown：{md.name}")
        plan[target]["mds"].append(md)

    # Fail loudly on duplicate / missing classification before touching the filesystem.
    classified = [md for target in plan.values() for md in target["mds"]]
    if len(classified) != len(set(classified)):
        raise SystemExit("有 Markdown 被重复分类")
    if len(classified) != len(list(MDS.glob("*.md"))):
        raise SystemExit("有 Markdown 未被分类")
    return plan


def describe(plan: dict[str, dict]) -> None:
    total_pdf = total_md = 0
    for target, items in plan.items():
        if target.startswith("_"):
            continue
        total_pdf += len(items["pdfs"])
        total_md += len(items["mds"])
        cached = sum(1 for parsed in items["parsed"] if parsed is not None)
        print(f"{target}: PDF={len(items['pdfs'])} parsed={cached} md={len(items['mds'])}")
    uncached = sum(1 for items in plan.values() for parsed in items["parsed"] if parsed is None)
    dropped = len(plan.get("_dropped", {}).get("pdfs", []))
    print(f"合计 PDF={total_pdf} 有缓存={total_pdf - uncached} 待MinerU={uncached} md={total_md} 去重丢弃={dropped}")


def copy_sources(plan: dict[str, dict]) -> None:
    for target, items in plan.items():
        if target.startswith("_"):
            continue
        corpus = KB / target
        if corpus.exists():
            shutil.rmtree(corpus)
        (corpus / "source").mkdir(parents=True)
        (corpus / "parsed").mkdir(parents=True)
        (corpus / "pending").mkdir(parents=True)
        for pdf, parsed in zip(items["pdfs"], items["parsed"]):
            if parsed is None:
                # No cached MinerU output and MinerU is too slow here; keep the file out of
                # ``source/`` so imports do not retry a ~1h timeout per file. Move it into
                # ``source/`` once parsed.
                shutil.copy2(pdf, corpus / "pending" / pdf.name)
            else:
                shutil.copy2(pdf, corpus / "source" / pdf.name)
                shutil.copytree(parsed, corpus / "parsed" / parsed.name)
        for md in items["mds"]:
            shutil.copy2(md, corpus / "source" / md.name)


def rebuild(plan: dict[str, dict], *, do_import: bool = True, do_dense: bool = True) -> None:
    from src.agent.config import get_settings
    from src.knowledge import Knowledge
    from src.parsers import import_defaults

    settings = get_settings()
    for target in TARGETS:
        if not (KB / target / "source").is_dir():
            continue
        corpus = KB / target
        knowledge = Knowledge(corpus / "datadb" / "knowledge.sqlite3", settings=settings,
                              vectordb_dir=corpus / "vectordb")
        if do_import:
            report = import_defaults(knowledge, settings, root=corpus / "source",
                                     parsed_root=corpus / "parsed")
            extra = f"added={report['added']} updated={report['updated']} errors={len(report['errors'])}"
        else:
            extra = "import=skipped"
        rows = knowledge.chunk_rows()
        print(f"{target}: docs={knowledge.count()} {extra} chunks={len(rows)}", flush=True)
        if do_dense and knowledge.dense is not None and rows:
            knowledge.dense.search("人工智能", [row["text"] for row in rows], rows, 6)
            print(f"{target}: dense done", flush=True)


def cleanup(keep_old: bool) -> None:
    if not keep_old:
        shutil.rmtree(OLD)
    for name in PLACEHOLDERS:
        path = KB / name
        if path.exists():
            shutil.rmtree(path)


def write_registry(keep_old: bool) -> None:
    from src.agent.corpora import corpus_id_for, save_corpus_overrides
    from src.agent.config import get_settings

    settings = get_settings()
    registry = {}
    for target in TARGETS:
        corpus_id = corpus_id_for(target)
        registry[corpus_id] = {"id": corpus_id, "rel": target, "alias": ALIAS[target], "created": True}
    if keep_old:
        legacy_id = corpus_id_for("自然科学基金")
        registry[legacy_id] = {"id": legacy_id, "rel": "自然科学基金", "alias": "", "created": False}
    save_corpus_overrides(settings, registry)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="execute; default is a dry run")
    parser.add_argument("--keep-sources", action="store_true",
                        help="skip source/parsed redistribution (rebuild indexes from the current layout)")
    parser.add_argument("--keep-old", action="store_true",
                        help="do not delete the old 自然科学基金 library (downloader still active)")
    parser.add_argument("--skip-dense", action="store_true", help="build datadb only (no embedding)")
    parser.add_argument("--dense-only", action="store_true", help="build vectordb from existing datadb")
    args = parser.parse_args()

    if not OLD.is_dir():
        raise SystemExit(f"旧库不存在：{OLD}")
    plan = build_plan()
    describe(plan)
    if not args.apply:
        print("dry run only; pass --apply to execute")
        return

    from src.agent.config import get_settings

    registry_path = get_settings().state_dir / "corpora.json"
    if registry_path.is_file():
        shutil.copy2(registry_path, registry_path.with_suffix(".json.pre-split.bak"))

    if not args.keep_sources and not args.dense_only:
        copy_sources(plan)
    rebuild(plan, do_import=not args.dense_only, do_dense=not args.skip_dense)
    if not args.dense_only:
        cleanup(args.keep_old)
        write_registry(args.keep_old)
    print("done")


if __name__ == "__main__":
    main()
