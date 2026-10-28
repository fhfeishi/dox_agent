"""Pick the library a question is about (query 2026-1013 1520).

Non-technical users should not have to know which library to ask. Each library is profiled by
its own words — name, alias and description, its report titles, the scene hierarchy (scenes,
core problems, routes) and the technology lineage (systems, directions, themes) — and a question is matched against
those terms. A term found in many libraries says little, so matches are weighted by how rare
the term is across libraries, and terms of the library's own name count three times. Nothing is
generated and no model is called; callers treat a low score as "no clear match".
"""
import json
import math
import sqlite3
from pathlib import Path

from .core.db import connect
from .retrieval import _query_terms

_profiles: dict[str, tuple[tuple, set[str], set[str]]] = {}
NAME_WEIGHT = 3
# Bigrams across a function character ("理中", "的人") say nothing about the topic.
FUNCTION_CHARS = set("的中与和及在是有了等对为其之或并把被从向于以这那哪些什么如何怎样吗呢吧")


def _terms(text: str) -> list[str]:
    return [t for t in _query_terms(text) if t.lower() != "ai" and not FUNCTION_CHARS & set(t)]
CLEAR_MATCH = 2.0


def _names(path: Path, pick) -> list[str]:
    try:
        return pick(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, UnicodeError, ValueError, KeyError, TypeError):
        return []


def _hierarchy(value) -> list[str]:
    out = []
    for scene in value.get("scenes") or []:
        out.append(scene.get("name", ""))
        for issue in scene.get("issues") or []:
            out.append(issue.get("name", ""))
            out.extend(route.get("title", "") for route in issue.get("routes") or [])
    return out


def _lineage(value) -> list[str]:
    out = []
    for system in value.get("categories") or []:
        if system.get("unplaced"):
            continue
        out.append(system.get("name", ""))
        for direction in system.get("children") or []:
            out.append(direction.get("name", ""))
            out.extend(theme.get("name", "") for theme in direction.get("themes") or [])
    return out


def _titles(db: Path | None) -> list[str]:
    if not db or not db.exists():
        return []
    try:
        with connect(f"file:{db}?mode=ro", uri=True, timeout=5) as con:
            return [row[0] or "" for row in con.execute("SELECT json_extract(payload, '$.title') FROM docs")]
    except sqlite3.Error:
        return []


def profile(info) -> tuple[set[str], set[str]]:
    """(all terms, name terms) of one library, rebuilt when its database, hierarchy or lineage changes."""
    files = [info.root / "hierarchy.json", info.root / "lineage.json"]
    stamps = [f.stat().st_mtime_ns if f.exists() else 0 for f in files + ([info.sqlite] if info.sqlite else [])]
    stamp = tuple(stamps) + (info.name, info.alias, info.description)
    cached = _profiles.get(info.id)
    if cached and cached[0] == stamp:
        return cached[1], cached[2]
    own = [info.name.replace("自然科学基金-", ""), info.alias.replace("自然科学基金项目-", "")]
    words = [*own, info.description,
             *_titles(info.sqlite), *_names(files[0], _hierarchy), *_names(files[1], _lineage)]
    terms = set(_terms(" ".join(w for w in words if w)))
    named = set(_terms(" ".join(w for w in own if w)))
    _profiles[info.id] = (stamp, terms, named)
    return terms, named


def rank(question: str, infos) -> list[dict]:
    """Libraries that share terms with the question, best first, with the matched terms."""
    usable = [info for info in infos if not info.missing and info.docs_count]
    profiles = {info.id: profile(info) for info in usable}
    asked = _terms(question)
    spread = {term: sum(term in terms for terms, _ in profiles.values()) for term in asked}
    ranked = []
    for info in usable:
        terms, named = profiles[info.id]
        matched = [term for term in asked if term in terms]
        if matched:
            score = sum(math.log(1 + len(usable) / spread[term]) * (NAME_WEIGHT if term in named else 1) for term in matched)
            ranked.append({"corpus_id": info.id, "name": info.name, "score": round(score, 3), "matched": matched,
                           "clear": score >= CLEAR_MATCH})
    return sorted(ranked, key=lambda row: (-row["score"], row["name"]))
