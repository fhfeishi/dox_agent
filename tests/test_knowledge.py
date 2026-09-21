import pytest

from src.agent.config import Settings
from src.knowledge import Document, Knowledge, Page


def test_search_first_page_keeps_multiple_sources(tmp_path):
    store = Knowledge(tmp_path / "diverse.sqlite3")
    store.put(Document(title="dominant", origin="one", kind="text", parser="test",
                       pages=[Page(number=1, text=("shared retrieval term detail\n" * 100))]))
    second = store.put(Document(title="other", origin="two", kind="text", parser="test",
                                pages=[Page(number=1, text="shared retrieval term from another source")]))
    hits = store.search("shared retrieval term", limit=4)
    assert second["doc_id"] in {hit["doc_id"] for hit in hits[:3]}
from src.parsers import import_defaults, parse_file, session_for


def document(text="南溪地基基础施工于2025年10月22日完成"):
    return Document(
        title="南溪", origin="fixture.txt", kind="text", parser="test", pages=[Page(number=1, text=text)]
    )


def test_persistence_version_and_chinese_retrieval(tmp_path):
    store = Knowledge(tmp_path / "db")
    first = store.put(document())
    assert store.put(document())["changed"] is False
    restored = Knowledge(tmp_path / "db")
    hit = restored.search("南溪地基基础完成")[0]
    assert hit["doc_id"] == first["doc_id"]
    assert "2025年10月22日" in restored.read(hit["doc_id"])["text"]
    assert restored.search("unrelatedxyz") == []
    store.put(document("新版施工时间"))
    with pytest.raises(ValueError, match="更新"):
        store.read(first["doc_id"], version=first["version"])


def test_read_preserves_page_and_line(tmp_path):
    store = Knowledge(tmp_path / "db")
    key = store.put(document("甲\n乙\n丙"))["doc_id"]
    assert store.read(key, start_line=2, line_count=1)["text"] == "乙"
    with pytest.raises(ValueError):
        store.read(key, page=9)
    with pytest.raises(KeyError):
        store.read("missing")


def test_failed_import_keeps_good_document(tmp_path):
    text_root = tmp_path / "texts"
    text_root.mkdir()
    source = text_root / "a.txt"
    source.write_text("测试正文", encoding="utf-8")
    settings = Settings(_env_file=None, text_root=text_root, knowledge_root=tmp_path)
    store = Knowledge(tmp_path / "db")
    report = import_defaults(store, settings)
    assert len(report["imported"]) == 1
    source.write_bytes(b"\xff\xfe")
    assert len(import_defaults(store, settings)["errors"]) == 1
    assert store.all()[0]["pages"][0]["text"] == "测试正文"


def test_pdf_adapter_preserves_pages(tmp_path, monkeypatch):
    from types import SimpleNamespace

    import liteparse

    class Parser:
        def __init__(self, **kwargs):
            assert kwargs["output_format"] == "json"

        def parse(self, path):
            return SimpleNamespace(pages=[SimpleNamespace(page_num=2, text="PDF第二页")])

    monkeypatch.setattr(liteparse, "LiteParse", Parser)
    doc = parse_file(tmp_path / "test.pdf", Settings(_env_file=None))
    assert doc.pages[0].number == 2
    assert doc.parser.startswith("liteparse/")


def test_session_exact_host_only(tmp_path):
    path = tmp_path / "sessions.json"
    path.write_text('{"example.com": {"storage_state":"private.json"}}')
    settings = Settings(_env_file=None, web_sessions_file=path)
    assert session_for("https://example.com/a", settings)
    assert session_for("https://other.example.com/a", settings) == {}


def test_numeric_footer_does_not_outrank_body(tmp_path):
    store = Knowledge(tmp_path / "db")
    store.put(
        Document(
            title="runtime evals",
            origin="test.pdf",
            kind="pdf",
            parser="test",
            pages=[
                Page(number=1, text="runtime evals architecture is described here"),
                Page(number=2, text="\n9/9"),
            ],
        )
    )
    assert all(hit["page"] == 1 for hit in store.search("runtime evals"))


def test_long_single_line_can_be_searched_and_read(tmp_path):
    store = Knowledge(tmp_path / "db")
    store.put(document("filler " * 6000 + " uniquetarget tail"))
    hit = store.search("uniquetarget")[0]
    assert "uniquetarget" in store.read(hit["doc_id"], start_line=hit["start_line"])["text"]
