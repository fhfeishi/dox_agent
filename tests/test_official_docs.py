import asyncio

import httpx

from src.knowledge import Knowledge
from src.official_docs import discover, import_official


def test_discovery_stays_in_section():
    text = "[Guide](https://docs.langchain.com/oss/python/langchain/guide.md)\n[Other](https://evil.test/guide.md)\n[Graph](https://docs.langchain.com/oss/python/langgraph/guide.md)"
    assert discover(text, "langchain") == [("https://docs.langchain.com/oss/python/langchain/guide.md", "Guide")]


def test_import_preserves_existing_when_page_fails(tmp_path):
    store = Knowledge(tmp_path / "db")
    failed = False

    def handler(request):
        if request.url.path.endswith("llms.txt"):
            return httpx.Response(200, text="[Guide](https://docs.langchain.com/oss/python/langchain/guide.md)")
        return httpx.Response(503 if failed else 200, text="# Guide\nUse tools.")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            progress = {"total": 0, "completed": 0, "imported": 0, "changed": 0, "errors": []}
            await import_official(store, ["langchain"], progress, client)
            return progress

    assert asyncio.run(run())["imported"] == 1
    version = store.all()[0]["version"]
    failed = True
    assert asyncio.run(run())["errors"]
    assert store.all()[0]["version"] == version
