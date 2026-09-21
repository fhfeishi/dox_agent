"""Prepare the public documentation before serving browser conversations."""

import asyncio
import json
from datetime import UTC, datetime

from .agent.config import get_settings
from .knowledge import Knowledge
from .official_docs import SECTIONS, import_official


async def main():
    settings = get_settings()
    store = Knowledge(settings.data_dir / "knowledge.sqlite3", settings=settings)
    report = settings.data_dir / "official-preparation.json"
    if report.exists():
        previous = json.loads(report.read_text(encoding="utf-8"))
        current = {doc["doc_id"]: doc["version"] for doc in store.all()}
        if previous.get("status") in {"done", "partial"} and previous.get("documents") and all(current.get(doc_id) == version for doc_id, version in previous["documents"].items()):
            print("官方文档已在本地，跳过下载。", flush=True)
            if previous.get("errors"):
                print("部分链接上次未成功，可从前端更新重试；现有文档可正常问答。", flush=True)
            if store.dense:
                await asyncio.to_thread(store.search, "LangChain")
            return
    progress = {"total": 0, "completed": 0, "imported": 0, "changed": 0, "errors": []}
    print("正在提前下载官方文档并落盘，请稍候。", flush=True)
    await import_official(store, list(SECTIONS), progress)
    progress["status"] = "partial" if progress["errors"] else "done"
    progress["prepared_at"] = datetime.now(UTC).isoformat()
    progress["documents"] = {doc["doc_id"]: doc["version"] for doc in store.all() if doc["kind"] == "official"}
    report.write_text(json.dumps(progress, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"官方文档：成功 {progress['imported']}/{progress['total']}，失败 {len(progress['errors'])}。", flush=True)
    if store.dense:
        print("正在提前同步本地向量索引。", flush=True)
        await asyncio.to_thread(store.search, "LangChain")
    if not progress["documents"]:
        raise RuntimeError("没有可用官方文档，请检查网络后重试。")
    if progress["errors"]:
        print("部分链接未成功，详情见 data/official-preparation.json；可在前端更新重试。", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
