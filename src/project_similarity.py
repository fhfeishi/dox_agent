"""Graded project relations by semantic similarity of four-dimension descriptions.

Extracted topic names are nearly unique per project, so shared labels relate almost no one and
category membership relates everyone in a category equally. Comparing what each project says
about its 场景 / 问题 / 技术 gives a graded relation: a link means the descriptions are close,
never inheritance, duplication or ranking. 成果 is not a relation basis (outcome types such as
"prototype" or "papers" do not relate projects).
"""

from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path
from threading import Lock

import numpy as np

from .dense import local_model_path

DIMENSIONS = ("场景", "问题", "技术")
TOP = 12           # links kept per project for drawing and listing
FLOOR = 0.55       # a pair below this cosine is never called related
QUANTILE = 0.985   # only the closest ~1.5% of pairs in a library count as related
_model = None
_model_lock = Lock()


def _embedder(path: str, device: str):
    global _model
    with _model_lock:
        if _model is None:
            from langchain_huggingface import HuggingFaceEmbeddings
            _model = HuggingFaceEmbeddings(
                model_name=str(local_model_path(path)),
                model_kwargs={"device": device, "local_files_only": True},
                encode_kwargs={"normalize_embeddings": True, "batch_size": 16},
            )
        return _model


def project_texts(library: dict, dimension: str) -> dict[str, str]:
    """One description per identified project: its items' names and descriptions, file order."""
    out = {}
    for project in library["projects"]:
        if project["identity_status"] != "identified":
            continue
        items = project["facets"][dimension]["items"]
        text = "；".join(dict.fromkeys(f"{i['name']}：{i.get('desc', '')}".strip("：") for i in items))
        if text:
            out[project["project_id"]] = text[:800]
    return out


class ProjectSimilarity:
    def __init__(self, path: Path, settings):
        self.path = Path(path)
        self.settings = settings
        with sqlite3.connect(self.path) as db:
            db.execute("CREATE TABLE IF NOT EXISTS project_vectors (corpus TEXT, dim TEXT, project TEXT, digest TEXT,"
                       " vector BLOB, PRIMARY KEY(corpus, dim, project))")

    def _vectors(self, corpus: str, dimension: str, texts: dict[str, str]) -> np.ndarray:
        digests = {pid: hashlib.sha256(text.encode()).hexdigest() for pid, text in texts.items()}
        with sqlite3.connect(self.path) as db:
            cached = {row[0]: (row[1], row[2]) for row in db.execute(
                "SELECT project, digest, vector FROM project_vectors WHERE corpus=? AND dim=?", (corpus, dimension))}
        missing = [pid for pid in texts if cached.get(pid, (None,))[0] != digests[pid]]
        if missing:
            model = _embedder(self.settings.embedding_path, self.settings.embedding_device)
            fresh = model.embed_documents([texts[pid] for pid in missing])
            with sqlite3.connect(self.path) as db:
                db.executemany("INSERT OR REPLACE INTO project_vectors VALUES (?,?,?,?,?)", [
                    (corpus, dimension, pid, digests[pid], np.asarray(vec, dtype=np.float32).tobytes())
                    for pid, vec in zip(missing, fresh)])
                db.execute(f"DELETE FROM project_vectors WHERE corpus=? AND dim=? AND project NOT IN ({','.join('?' * len(texts))})",
                           (corpus, dimension, *texts))
            for pid, vec in zip(missing, fresh):
                cached[pid] = (digests[pid], np.asarray(vec, dtype=np.float32).tobytes())
        return np.vstack([np.frombuffer(cached[pid][1], dtype=np.float32) for pid in texts])

    def relations(self, corpus: str, library: dict, dimension: str) -> dict:
        texts = project_texts(library, dimension)
        ids = list(texts)
        if len(ids) < 2:
            return {"dimension": dimension, "projects": len(ids), "threshold": None, "degree": {}, "edges": {}}
        matrix = self._vectors(corpus, dimension, texts)
        sims = matrix @ matrix.T
        np.fill_diagonal(sims, -1.0)
        upper = sims[np.triu_indices(len(ids), k=1)]
        threshold = float(max(FLOOR, np.quantile(upper, QUANTILE)))
        degree, edges = {}, {}
        for i, pid in enumerate(ids):
            order = np.argsort(-sims[i])
            close = [j for j in order if sims[i, j] >= threshold]
            degree[pid] = len(close)
            edges[pid] = [[ids[j], round(float(sims[i, j]), 3)] for j in close[:TOP]]
        return {"dimension": dimension, "projects": len(ids), "threshold": round(threshold, 3),
                "degree": degree, "edges": edges}
