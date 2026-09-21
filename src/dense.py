"""Optional local embeddings and persistent Chroma retrieval."""

import hashlib
import json
import os
import re
from pathlib import Path
from threading import RLock


def local_model_path(value: str) -> Path:
    value = value.strip()
    if os.name != "nt" and re.match(r"^[A-Za-z]:[\\/]", value):
        value = "/mnt/" + value[0].lower() + "/" + value[3:].replace("\\", "/")
    path = Path(value).expanduser().resolve()
    if not path.is_dir() or not (path / "config.json").is_file():
        raise ValueError("EMBEDDING_PATH 必须指向含 config.json 的具体本地模型目录")
    return path


class DenseIndex:
    def __init__(self, directory: Path, model_path: str, device: str, query_prompt: str):
        self.directory = directory
        self.model_path = local_model_path(model_path)
        self.device = device
        self.query_prompt = query_prompt
        self.store = None
        self.progress = {"stage": "waiting", "completed": 0, "total": 0}
        self.lock = RLock()

    def search(self, query: str, texts: list[str], candidates: list[dict], limit: int) -> list[int]:
        with self.lock:
            return self._search(query, texts, candidates, limit)

    def _search(self, query, texts, candidates, limit):
        if self.store is None:
            self.progress = {"stage": "loading_model", "completed": 0, "total": 0}
            from langchain_chroma import Chroma
            from langchain_huggingface import HuggingFaceEmbeddings

            embeddings = HuggingFaceEmbeddings(
                model_name=str(self.model_path),
                model_kwargs={"device": self.device, "local_files_only": True},
                encode_kwargs={"normalize_embeddings": True, "batch_size": 8},
                query_encode_kwargs={"normalize_embeddings": True, "prompt": self.query_prompt},
            )
            files = [(str(path.relative_to(self.model_path)), path.stat().st_size, path.stat().st_mtime_ns) for path in sorted(self.model_path.rglob("*")) if path.is_file()]
            signature = hashlib.sha256((str(self.model_path) + self.query_prompt + json.dumps(files)).encode()).hexdigest()[:24]
            self.store = Chroma(
                collection_name="dox-agent-" + signature,
                embedding_function=embeddings,
                persist_directory=str(self.directory),
            )
        ids = [hashlib.sha256((json.dumps(item, sort_keys=True) + text).encode()).hexdigest() for item, text in zip(candidates, texts)]
        existing = set(self.store.get(include=[])["ids"])
        positions = {key: position for position, key in enumerate(ids)}
        missing = [position for position, key in enumerate(ids) if key not in existing]
        self.progress = {"stage": "indexing", "completed": len(ids) - len(missing), "total": len(ids)}
        for start in range(0, len(missing), 32):
            batch = missing[start:start + 32]
            self.store.add_texts(
                texts=[texts[position] for position in batch],
                metadatas=[{"chunk_id": ids[position]} for position in batch],
                ids=[ids[position] for position in batch],
            )
            self.progress = {**self.progress, "completed": self.progress["completed"] + len(batch)}
        stale = list(existing - set(ids))
        if stale:
            self.store.delete(ids=stale)
        self.progress = {"stage": "ready", "completed": len(ids), "total": len(ids)}
        return [positions[item.metadata["chunk_id"]] for item in self.store.similarity_search(query, k=min(limit, len(ids))) if item.metadata["chunk_id"] in positions]


def fuse_rankings(sparse: list[int], dense: list[int], limit: int) -> list[int]:
    scores = {}
    for ranking in (sparse, dense):
        for rank, position in enumerate(ranking, 1):
            scores[position] = scores.get(position, 0) + 1 / (60 + rank)
    return sorted(scores, key=lambda position: (-scores[position], position))[:limit]
