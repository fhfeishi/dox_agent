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
            result = {"error": "没有可导入的默认知识库"}
        else:
            result = import_defaults(store, settings, root=info.source_dir, parsed_root=info.root / "parsed")
    elif args.action == "search":
        result = store.search(args.query)
    elif args.action == "preview":
        result = asyncio.run(parse_web(args.query, settings)).model_dump()
    else:
        from .agent.graph import build_graph
        from .agent.models import tracing

        async def ask():
            async with asyncio.timeout(settings.run_timeout):
                with tracing(settings):
                    result = await build_graph(store, settings).ainvoke(
                        {"messages": [{"role": "user", "content": args.query}], "rounds": 0, "evidence": []}
                    )
                return {
                    "answer": result["answer"],
                    "sources": [{"title": e["title"], "page": e["page"]} for e in result["evidence"]],
                }

        result = asyncio.run(ask())
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
