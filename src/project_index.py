"""Project identity precedes aggregation; derived rows never overwrite source evidence."""

import hashlib
import json
import re
import sqlite3
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from .retrieval import metadata_from_filename
from .targets import DIMENSIONS, PROMPT_VERSION, _load, _record_state

INDEX_VERSION = 3
SCOPES = {"批准资助金额": "awarded", "资助金额": "awarded", "直接费用": "direct", "总经费": "total"}
MONEY = re.compile(
    r"(?m)^\s*(?:[|#>* ]*)(" + "|".join(SCOPES) + r")\s*[:：|]\s*([0-9]+(?:\.[0-9]+)?)\s*[（(]?\s*(万元|元)"
)
FIELD = re.compile(r"(?m)^(ratifyNo|projectName|projectAdmin|dependUnit|supportNum|code):\s*(.*?)\s*$")


def norm(value):
    return re.sub(r"\s+", " ", value or "").strip()


class ProjectIndex:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS project_documents (corpus TEXT, doc TEXT, signature TEXT, payload TEXT, PRIMARY KEY(corpus,doc))"
            )
            # Manual topic grouping is a log over extracted names, never an edit of the evidence.
            db.execute(
                "CREATE TABLE IF NOT EXISTS topic_merges (id TEXT PRIMARY KEY, corpus TEXT, dimension TEXT, name TEXT,"
                " members TEXT, replaces TEXT, created TEXT, undone TEXT)"
            )

    def merges(self, corpus):
        with self.connect() as db:
            rows = db.execute(
                "SELECT id,dimension,name,members,replaces,created,undone FROM topic_merges WHERE corpus=? ORDER BY created",
                (corpus,),
            ).fetchall()
        merges = [
            {"id": r[0], "dimension": r[1], "name": r[2], "members": json.loads(r[3]), "replaces": json.loads(r[4]),
             "created": r[5], "undone": r[6]}
            for r in rows
        ]
        live = [m for m in merges if not m["undone"]]
        replaced = {ident for m in live for ident in m["replaces"]}
        for m in merges:
            m["active"] = not m["undone"] and m["id"] not in replaced
        return merges

    def topic_map(self, corpus):
        mapping = defaultdict(dict)
        for m in self.merges(corpus):
            if m["active"]:
                for member in m["members"]:
                    mapping[m["dimension"]][member] = m["name"]
        return mapping

    def merge(self, corpus, dimension, names, name, originals):
        """Group current topics under one name; a merged topic expands to its own members."""
        name = norm(name)
        if dimension not in DIMENSIONS or not names or not name or len(name) > 60:
            raise ValueError("请选择条目并填写不超过 60 字的名称")
        active = {m["name"]: m for m in self.merges(corpus) if m["active"] and m["dimension"] == dimension}
        grouped = {member for m in active.values() for member in m["members"]}
        members, replaces = [], []
        for topic in dict.fromkeys(norm(n) for n in names):
            if topic in active:
                members += active[topic]["members"]
                replaces.append(active[topic]["id"])
            elif topic in originals and topic not in grouped:
                members.append(topic)
            else:
                raise ValueError(f"条目“{topic}”已不在当前归纳中，请刷新后重试")
        shown = {active.get(o, {}).get("name", o) for o in originals} | set(active)
        taken = {n for n in shown if n not in {norm(x) for x in names}}
        if name in taken:
            raise ValueError("该名称已被其他条目使用，如需合并请一并选择")
        if len(members) == 1 and members[0] == name and not replaces:
            raise ValueError("名称没有变化")
        record = (uuid.uuid4().hex, corpus, dimension, name, json.dumps(sorted(set(members)), ensure_ascii=False),
                  json.dumps(replaces), datetime.now(UTC).isoformat(), None)
        with self.connect() as db:
            db.execute("INSERT INTO topic_merges VALUES (?,?,?,?,?,?,?,?)", record)
        return record[0]

    def undo(self, corpus, merge_id):
        current = next((m for m in self.merges(corpus) if m["id"] == merge_id), None)
        if not current:
            raise KeyError(merge_id)
        if not current["active"]:
            raise ValueError("该整理已撤销或已被后续合并包含，请先撤销后续合并")
        with self.connect() as db:
            db.execute("UPDATE topic_merges SET undone=? WHERE id=?", (datetime.now(UTC).isoformat(), merge_id))

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def library(self, info, knowledge):
        eligible = {doc["doc_id"]: doc for doc in knowledge.current()}
        current = knowledge.all()
        with self.connect() as db:
            cached = {
                row[0]: (row[1], json.loads(row[2]))
                for row in db.execute(
                    "SELECT doc,signature,payload FROM project_documents WHERE corpus=?", (info.id,)
                )
            }
        rows = []
        for doc in current:
            target_path = info.root / "target" / (doc["doc_id"] + ".json")
            stamp = (
                (target_path.stat().st_mtime_ns, target_path.stat().st_size) if target_path.exists() else None
            )
            signature = hashlib.sha256(
                json.dumps(
                    [
                        INDEX_VERSION,
                        doc["doc_id"] in eligible,
                        doc["version"],
                        doc["title"],
                        doc["origin"],
                        stamp,
                        PROMPT_VERSION,
                    ],
                    ensure_ascii=False,
                ).encode()
            ).hexdigest()
            old = cached.get(doc["doc_id"])
            if old and old[0] == signature:
                row = old[1]
            else:
                text = knowledge.read_markdown(doc["doc_id"], doc["version"])
                row = self.document(info, eligible.get(doc["doc_id"], doc), text)
                if doc["doc_id"] not in eligible:
                    row.update(
                        state="unavailable",
                        notice="原文件变化或不可用，请刷新资料后重新整理",
                        completed=False,
                        funding=[],
                    )
                    for facet in row["facets"].values():
                        facet.update(items=[], completed=False, state="unavailable")
                with self.connect() as db:
                    db.execute(
                        "INSERT OR REPLACE INTO project_documents VALUES (?,?,?,?)",
                        (info.id, doc["doc_id"], signature, json.dumps(row, ensure_ascii=False)),
                    )
            rows.append(row)
        # Only current source rows contribute; cached stale rows are removed independently.
        with self.connect() as db:
            keep = {doc["doc_id"] for doc in current}
            for doc_id in cached.keys() - keep:
                db.execute("DELETE FROM project_documents WHERE corpus=? AND doc=?", (info.id, doc_id))
        return self.aggregate(info.id, rows)

    def document(self, info, doc, text):
        header = text[:12000]
        fields = dict(FIELD.findall(header.split("---", 2)[1])) if text.startswith("---") else {}
        meta = metadata_from_filename(doc["origin"])
        header_number = re.search(r"(?:项目批准号|批准号)\s*[:：|]?\s*([A-Za-z0-9]+)", header[:2048])
        if not fields.get("ratifyNo") and header_number:
            fields["ratifyNo"] = header_number[1]
        number = str(fields.get("ratifyNo") or meta.get("project_no") or "").strip()
        identity_conflict = bool(
            fields.get("ratifyNo")
            and meta.get("project_no")
            and str(fields["ratifyNo"]) != str(meta["project_no"])
        )
        if identity_conflict:
            number = ""
        family = (
            "NSFC" if "国家自然科学基金" in header or "自然科学基金" in (info.dir_name or info.name) else ""
        )
        if not family:
            number = ""  # A filename pattern alone does not identify a funding system.
        record, error = _load(info, doc["doc_id"])
        state, notice = _record_state(record, error, doc)
        coverage = (record or {}).get("process", {}).get("coverage", {})
        completed = state == "current" and (record or {}).get("process", {}).get("status") == "已完成"
        facets = {}
        for key in DIMENSIONS:
            source = next((f for f in (record or {}).get("facets", []) if f["key"] == key), {})
            # An incomplete file may contain partial evidence. Keep it explicitly partial;
            # only current-version quotes are eligible, never substitute an old file's result.
            items = []
            if state == "current":
                for item in source.get("items", []):
                    evidence = [e for e in item.get("evidence", []) if e.get("version") == doc["version"]]
                    if evidence:
                        items.append(
                            {
                                **{key: item[key] for key in ("id", "name", "desc", "status") if key in item},
                                "name": norm(item["name"]),
                                "doc_id": doc["doc_id"],
                                "version": doc["version"],
                            }
                        )
            facets[key] = {
                "items": items,
                "state": source.get("state") if state == "current" else state,
                "completed": completed and source.get("state") in ("has", "未提及"),
            }
        money = []
        for match in MONEY.finditer(header):
            try:
                amount = Decimal(match[2]) * (10000 if match[3] == "万元" else 1)
            except InvalidOperation:
                continue
            money.append(
                {
                    "scope": SCOPES[match[1]],
                    "amount_yuan": str(amount),
                    "currency": "CNY",
                    "quote": match[0].strip(),
                    "doc_id": doc["doc_id"],
                    "version": doc["version"],
                }
            )
        # supportNum in the imported archive has no explicit currency/unit contract.
        # Preserve it as an unverified candidate instead of assuming "万元".
        if fields.get("supportNum") and not any(m["scope"] == "awarded" for m in money):
            money.append(
                {
                    "scope": "awarded",
                    "amount_yuan": None,
                    "currency": None,
                    "quote": "supportNum: " + fields["supportNum"],
                    "doc_id": doc["doc_id"],
                    "version": doc["version"],
                }
            )
        public_doc = {k: v for k, v in doc.items() if k not in ("pages", "markdown")}
        public_doc["pages"] = doc.get("page_count", 0)
        labelled_title = re.search(r"(?m)^\s*项目名称\s*[:：]\s*(.+)$", header)
        title = fields.get("projectName") or (labelled_title[1].strip() if labelled_title else doc["title"])
        if title == doc["title"] and meta.get("project_no") and len(title.split("_", 4)) == 5:
            title = title.split("_", 4)[4]
        return {
            "number": number,
            "family": family,
            "identity_conflict": identity_conflict,
            "title": title,
            "start_year": meta.get("year_from"),
            "end_year": meta.get("year_to"),
            # Archive header fields as written; empty when the file does not state them.
            "code": str(fields.get("code") or "").strip(),
            "admin": str(fields.get("projectAdmin") or "").strip(),
            "unit": str(fields.get("dependUnit") or "").strip(),
            "file": public_doc,
            "facets": facets,
            "funding": money,
            "state": state,
            "notice": notice,
            "completed": completed,
            "coverage": coverage,
        }

    def aggregate(self, corpus, rows):
        topics = self.topic_map(corpus)
        for row in rows:
            for key, facet in row["facets"].items():
                for item in facet["items"]:
                    item["original_name"] = item.get("original_name", item["name"])
                    item["name"] = topics.get(key, {}).get(item["original_name"], item["original_name"])
        groups = defaultdict(list)
        for row in rows:
            identity = (
                row["family"] + ":" + row["number"] if row["number"] else "pending:" + row["file"]["doc_id"]
            )
            groups[identity].append(row)
        projects = []
        for identity, sources in groups.items():
            starts = {s["start_year"] for s in sources if s["start_year"] is not None}
            ends = {s["end_year"] for s in sources if s["end_year"] is not None}
            funding = [m for s in sources for m in s["funding"]]
            conflicts = [
                scope
                for scope in {m["scope"] for m in funding}
                if len(
                    {
                        m["amount_yuan"]
                        for m in funding
                        if m["scope"] == scope and m["amount_yuan"] is not None
                    }
                )
                > 1
            ]
            facets = {
                key: {
                    "items": [item for s in sources for item in s["facets"][key]["items"]],
                    "covered_files": sum(s["facets"][key]["completed"] for s in sources),
                    "evidence_files": sum(bool(s["facets"][key]["items"]) for s in sources),
                }
                for key in DIMENSIONS
            }
            projects.append(
                {
                    "project_id": identity,
                    "number": sources[0]["number"],
                    "title": sources[0]["title"],
                    "identity_status": "identified" if sources[0]["number"] else "pending",
                    "identity_conflict": any(s["identity_conflict"] for s in sources),
                    "start_year": next(iter(starts)) if len(starts) == 1 else None,
                    "end_year": next(iter(ends)) if len(ends) == 1 else None,
                    "year_conflict": len(starts) > 1 or len(ends) > 1,
                    **{key: next((s[key] for s in sources if s.get(key)), "") for key in ("code", "admin", "unit")},
                    "files": [
                        {
                            "document": s["file"],
                            "state": s["state"],
                            "notice": s["notice"],
                            "completed": s["completed"],
                        }
                        for s in sources
                    ],
                    "facets": facets,
                    "funding": funding,
                    "funding_conflicts": sorted(conflicts),
                }
            )
        identified = [p for p in projects if p["identity_status"] == "identified"]
        dimensions = {}
        for key in DIMENSIONS:
            valid = [p for p in identified if p["facets"][key]["items"]]
            tags = defaultdict(dict)  # Ordered per-project set: one project counts once per topic.
            tag_items = defaultdict(set)
            members = defaultdict(set)
            for project in valid:
                for item in project["facets"][key]["items"]:
                    tags[item["name"]][project["project_id"]] = None
                    tag_items[item["name"]].add(item["id"])
                    members[item["name"]].add(item["original_name"])
            dimensions[key] = {
                "evidence_projects": len(valid),
                "fully_processed_projects": sum(
                    p["facets"][key]["covered_files"] == len(p["files"]) for p in identified
                ),
                "items": [
                    # item_ids let a library-level synthesis cite evidence instead of re-describing it.
                    {"name": name, "project_ids": list(ids), "count": len(ids), "item_ids": sorted(tag_items[name]),
                     "members": sorted(members[name])}
                    for name, ids in sorted(tags.items(), key=lambda pair: (-len(pair[1]), pair[0]))
                ],
            }
        funds = {}
        for scope in ("awarded", "direct", "total"):
            eligible = [
                p
                for p in identified
                if p["start_year"] is not None
                and scope not in p["funding_conflicts"]
                and any(m["scope"] == scope and m["amount_yuan"] is not None for m in p["funding"])
            ]
            total = sum(
                (
                    Decimal(
                        next(
                            m["amount_yuan"]
                            for m in p["funding"]
                            if m["scope"] == scope and m["amount_yuan"] is not None
                        )
                    )
                    for p in eligible
                ),
                Decimal(0),
            )
            funds[scope] = {
                "eligible_projects": len(eligible),
                "excluded_projects": len(identified) - len(eligible),
                "total_yuan": str(total),
            }
        return {
            "corpus_id": corpus,
            "projects": projects,
            "coverage": {
                "files": len(rows),
                "identified_projects": len(identified),
                "pending_identity_records": len(projects) - len(identified),
                "dimensions": dimensions,
                "funding": funds,
            },
        }
