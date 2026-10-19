"""cli.py ``ask`` runs the current graph end to end with a fake model (no API key needed)."""

import asyncio
import json
import sys
from types import SimpleNamespace

from src import cli
from src.agent import graph
from src.agent.config import Settings
from src.knowledge import Document, Knowledge, Page


class FakeModel:
    async def astream(self, messages):
        yield SimpleNamespace(content="南溪施工于2025年10月22日完成 [1]")


def seeded_store(tmp_path):
    store = Knowledge(tmp_path / "db")
    store.put(
        Document(
            title="南溪",
            origin="test",
            parser="text",
            kind="text",
            pages=[Page(number=1, text="南溪施工完成日期2025年10月22日" * 50)],
        )
    )
    return store


def use_fake_model(monkeypatch):
    real = graph.build_graph
    monkeypatch.setattr(graph, "build_graph", lambda store, settings: real(store, settings, FakeModel()))


def test_ask_returns_answer_and_sources_from_current_graph(tmp_path, monkeypatch):
    use_fake_model(monkeypatch)
    result = asyncio.run(cli.ask(seeded_store(tmp_path), Settings(_env_file=None), "南溪施工"))
    assert result["answer"] == "南溪施工于2025年10月22日完成 [1]"
    assert result["sources"] == [{"citation": 1, "title": "南溪", "page": 1}]


def test_ask_on_empty_corpus_returns_notice_without_sources(tmp_path, monkeypatch):
    use_fake_model(monkeypatch)
    result = asyncio.run(cli.ask(Knowledge(tmp_path / "db"), Settings(_env_file=None), "南溪"))
    assert "没有匹配的报告" in result["answer"] and result["sources"] == []


def test_cli_main_ask_prints_json(tmp_path, monkeypatch, capsys):
    use_fake_model(monkeypatch)
    store = seeded_store(tmp_path)
    monkeypatch.setattr(cli, "get_settings", lambda: Settings(_env_file=None))
    monkeypatch.setattr(cli, "Knowledge", lambda *args, **kwargs: store)
    monkeypatch.setattr(sys, "argv", ["cli", "ask", "南溪施工"])
    cli.main()
    printed = json.loads(capsys.readouterr().out)
    assert printed["answer"].endswith("[1]") and printed["sources"][0]["title"] == "南溪"
