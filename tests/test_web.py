import asyncio

import httpx
import pytest

from src.agent.config import Settings
from src.parsers import parse_web


def test_firecrawl_contract_and_preview_has_no_credentials(monkeypatch):
    original = httpx.AsyncClient

    def handler(request):
        assert request.url.path == "/v2/scrape"
        assert request.headers["authorization"] == "Bearer test-key"
        return httpx.Response(
            200, json={"success": True, "data": {"markdown": "# Page\nbody", "metadata": {"title": "Page"}}}
        )

    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs)
    )
    settings = Settings(_env_file=None, web_provider="firecrawl", firecrawl_api_key="test-key")
    doc = asyncio.run(parse_web("https://example.com", settings))
    assert doc.pages[0].text == "# Page\nbody"
    assert "test-key" not in doc.model_dump_json()


def test_invalid_url_rejected_without_network():
    with pytest.raises(ValueError):
        asyncio.run(parse_web("file:///etc/passwd", Settings(_env_file=None)))


def test_firecrawl_error_not_ingested(monkeypatch):
    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original(
            transport=httpx.MockTransport(lambda request: httpx.Response(403)), **kwargs
        ),
    )
    settings = Settings(_env_file=None, web_provider="firecrawl", firecrawl_api_key="test-key")
    with pytest.raises(ValueError, match="403"):
        asyncio.run(parse_web("https://example.com", settings))
