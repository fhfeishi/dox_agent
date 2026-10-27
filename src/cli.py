"""Local verification and ingestion without a running HTTP server."""

import argparse
import asyncio
import json

from .agent.config import get_settings
from .agent.corpora import default_corpus_info, default_db_path
from .knowledge import Knowledge
from .parsers import import_defaults, parse_web


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["ingest", "search", "preview", "ask"])
    parser.add_argument("query", nargs="?", default="")
    args = parser.parse_args()
    settings = get_settings()
    store = Knowledge(default_db_path(settings), settings=settings)
    if args.action == "ingest":
        info = default_corpus_info(settings)
        if info is None:
            result = {"error": "没有可导入的默认资料库"}
        else:
            result = import_defaults(store, settings, root=info.source_dir, parsed_root=info.root / "parsed")
    elif args.action == "search":
        result = store.search(args.query)
    elif args.action == "preview":
        result = asyncio.run(parse_web(args.query, settings)).model_dump()
    else:
        result = asyncio.run(ask(store, settings, args.query))
    print(json.dumps(result, ensure_ascii=False, indent=2))


async def ask(store: Knowledge, settings, question: str) -> dict:
    """Answer one question with the current graph, as the web chat does, without a server.

    Fixed in F4/Q3 (2026-10-19): this used to pass the removed ``rounds``/``evidence`` state and
    read ``result["evidence"]``, which the graph no longer returns. Sources now come from the
    graph's ``sources`` event. Old version: git show 4ce4616:src/cli.py
    """
    from .agent.graph import build_graph
    from .agent.models import tracing

    sources: list[dict] = []
    final: dict = {}
    async with asyncio.timeout(settings.run_timeout):
        with tracing(settings):
            graph = build_graph(store, settings)
            async for mode, chunk in graph.astream({"messages": [{"role": "user", "content": question}]},
                                                   stream_mode=["custom", "values"]):
                if mode == "custom" and chunk.get("event") == "sources":
                    sources = chunk["data"]
                elif mode == "values":
                    final = chunk
    return {"answer": final.get("answer", ""),
            "sources": [{"citation": s.get("citation"), "title": s.get("title"), "page": s.get("page")}
                        for s in sources]}


if __name__ == "__main__":
    main()
