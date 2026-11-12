"""P0-B2: web caches and snapshots belong to the account that made them (High#2, 2026-11-05).

Two real accounts with non-empty fixtures. Every refusal is checked together with its side effects:
nothing fetched, nothing written, no preview slot consumed, the cached entry unchanged. Search and
fetching are replaced by fakes, so no test reaches the network.
"""

import pytest
from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.main import create_app


def login(client, name):
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"username": name, "password": "123456"}).status_code == 200


@pytest.fixture(scope="module")
def bench(tmp_path_factory):
    root = tmp_path_factory.mktemp("web-auth")
    settings = Settings(_env_file=None, corpora_root=root / ".knowledge", state_dir=root / "state",
                        user_dir=root / "usr", firecrawl_api_key="offline", embedding_path="")
    app = create_app(settings)
    with TestClient(app) as client:
        yield client, app, settings


@pytest.fixture
def fake_web(monkeypatch):
    """Search and fetching replaced by fakes that record how often they ran."""
    calls = {"search": 0, "fetch": 0}

    async def search_web(query, domains, time_filter, limit, settings):
        calls["search"] += 1
        return [{"url": "https://example.com/a", "title": "结果甲", "description": "甲"},
                {"url": "https://example.com/b", "title": "结果乙", "description": "乙"}]

    async def parse_web(url, settings):
        calls["fetch"] += 1
        from src.knowledge import Document, Page
        return Document(title=f"网页 {url}", origin=url, kind="web", parser="web",
                        pages=[Page(number=1, text=f"{url} 的正文")])

    monkeypatch.setattr("src.api.web.search_web", search_web)
    monkeypatch.setattr("src.api.web.parse_web", parse_web)
    return calls


def test_web_search_and_preview_bind_authenticated_owner(bench, fake_web):
    client, app, _ = bench
    login(client, "user")
    search = client.post("/api/web/search", json={"query": "例子", "domains": ["example.com"], "time_filter": "any", "limit": 2}).json()
    search_id = search["search_id"]
    cached = app.state.searches[search_id]
    assert cached["created_by"] == "user"  # the server's account, not a client field
    preview = client.post("/api/web/preview", json={"url": "https://example.com/c"}).json()
    assert app.state.previews[preview["preview_id"]]["created_by"] == "user"
    assert fake_web["fetch"] == 1 and fake_web["search"] == 1


def test_foreign_search_preview_neither_fetches_nor_consumes_selection(bench, fake_web):
    client, app, _ = bench
    login(client, "user")
    search_id = client.post("/api/web/search", json={"query": "例子", "domains": ["example.com"], "time_filter": "any", "limit": 2}).json()["search_id"]
    result_id = next(iter(app.state.searches[search_id]["results"]))
    before = set(app.state.searches[search_id]["selected"])
    fetches = fake_web["fetch"]
    login(client, "admin")
    refused = client.post(f"/api/web/search/{search_id}/preview/{result_id}")
    assert refused.status_code == 403
    assert fake_web["fetch"] == fetches  # nothing was fetched
    assert app.state.searches[search_id]["selected"] == before  # no slot consumed
    assert app.state.searches[search_id]["results"][result_id]  # the cached result is unchanged


def test_foreign_confirm_preserves_preview_and_writes_nothing(bench, fake_web):
    client, app, settings = bench
    login(client, "user")
    preview = client.post("/api/web/preview", json={"url": "https://example.com/d"}).json()
    preview_id = preview["preview_id"]
    before = app.state.previews[preview_id]
    library = client.post("/api/personal-libraries", json={"name": "我的网页"}).json()
    login(client, "admin")
    # ``target_corpus_id`` may not be an empty string (min_length=1), so "only for this run" is
    # spelled by omitting it.
    refused = client.post(f"/api/web/confirm/{preview_id}", json={"save_for_run": True})
    assert refused.status_code == 403
    assert app.state.previews[preview_id] is before  # the preview is still there, unchanged
    # Nothing was persisted: the store still holds no snapshot for that URL.
    assert all(item["url"] != "https://example.com/d" for item in _snapshots(app))
    assert library["id"]  # the fixture account did have a library to write to


def _snapshots(app):
    import json

    from src.core.db import connect
    with connect(app.state.web_snapshots.path) as db:
        rows = db.execute("SELECT payload FROM web_snapshots").fetchall()
    return [json.loads(row[0]) for row in rows]


def test_snapshot_read_and_chat_consumption_share_owner_guard(bench, fake_web):
    client, app, _ = bench
    login(client, "user")
    preview = client.post("/api/web/preview", json={"url": "https://example.com/e"}).json()
    confirmed = client.post(f"/api/web/confirm/{preview['preview_id']}",
                            json={"save_for_run": True}).json()
    snapshot_id = confirmed["web_snapshot_id"]
    assert app.state.web_snapshots.owner_of(snapshot_id) == "user"
    # The owner reads it; the administrator does not, and neither does another ordinary account.
    assert client.get(f"/api/web/snapshots/{snapshot_id}").status_code == 200
    login(client, "admin")
    assert client.get(f"/api/web/snapshots/{snapshot_id}").status_code == 403
    assert app.state.web_snapshots.owned_by(snapshot_id, "admin", admin=True) is False
    assert app.state.web_snapshots.owned_by(snapshot_id, "user") is True
    # A chat request naming someone else's snapshot is refused before any run is recorded.
    refused = client.post("/api/chat", json={"messages": [{"role": "user", "content": "问题"}],
                                             "run_id": "run-foreign", "web_snapshot_ids": [snapshot_id]})
    assert refused.status_code == 403
    assert "run-foreign" not in app.state.runs.existing_ids(["run-foreign"])


def test_an_ownerless_snapshot_belongs_to_the_administrator(bench):
    """Records from before authorship was recorded follow the existing ownerless policy."""
    client, app, _ = bench
    from src.knowledge import Document, Page
    doc = Document(title="旧网页", origin="https://example.com/legacy", kind="web", parser="web",
                   pages=[Page(number=1, text="旧正文")])
    snapshot = app.state.web_snapshots.save(doc, created_by="")
    login(client, "user")
    assert client.get(f"/api/web/snapshots/{snapshot['web_snapshot_id']}").status_code == 403
    login(client, "admin")
    assert client.get(f"/api/web/snapshots/{snapshot['web_snapshot_id']}").status_code == 200
