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
    assert store.read(store.all()[0]["doc_id"])["text"] == "测试正文"


def test_user_reads_markdown_and_pages_from_separate_storage(tmp_path):
    # Given a report parsed with both page text and a markdown body
    store = Knowledge(tmp_path / "db")
    first = store.put(Document(title="报告", origin="report.pdf", kind="pdf", parser="mineru",
                               pages=[Page(number=1, text="第一页正文"), Page(number=2, text="第二页正文")],
                               markdown="# 报告\n\n完整 markdown 正文"))
    # When listing documents
    listed = store.all()[0]
    # Then listing has metadata and page count, but not the full text
    assert listed["page_count"] == 2 and "pages" not in listed and "markdown" not in listed
    # And markdown/pages are readable on demand, with a version check
    assert store.read_markdown(first["doc_id"], first["version"]) == "# 报告\n\n完整 markdown 正文"
    assert store.read(first["doc_id"], page=2)["text"] == "第二页正文"
    with pytest.raises(ValueError, match="更新"):
        store.read_markdown(first["doc_id"], "stale-version")
    # And a markdown-only change produces a new version
    second = store.put(Document(title="报告", origin="report.pdf", kind="pdf", parser="mineru",
                                pages=[Page(number=1, text="第一页正文"), Page(number=2, text="第二页正文")],
                                markdown="# 报告\n\n修订后的 markdown"))
    assert second["changed"] and second["version"] != first["version"]


def test_user_retrieves_reports_from_persisted_chunks(tmp_path):
    from src.retrieval import RawBlock, chunk_blocks
    # Given two reports stored with their chunks
    store = Knowledge(tmp_path / "db")
    for title, text in (("癫痫网络报告", "癫痫致痫网络的特征识别方法"),
                        ("金融风险报告", "金融风险量化模型")):
        result = store.put(Document(title=title, origin=title + ".pdf", kind="pdf", parser="mineru",
                                    pages=[Page(number=1, text=text)]))
        store.put_chunks(result["doc_id"], result["version"],
                         chunk_blocks(result["doc_id"], result["version"], title, [RawBlock(1, text)]))
    # When retrieving for the epilepsy question
    outcome = store.retrieve("癫痫致痫网络")
    # Then the report-level index returns only the epilepsy report
    assert outcome.matched
    assert [report.doc.title for report in outcome.reports] == ["癫痫网络报告"]


def test_user_stops_seeing_chunks_after_source_removal(tmp_path):
    from src.retrieval import RawBlock, chunk_blocks
    # Given an indexed report
    store = Knowledge(tmp_path / "db")
    result = store.put(Document(title="报告", origin="report.pdf", kind="pdf", parser="mineru",
                                pages=[Page(number=1, text="癫痫致痫网络")]))
    store.put_chunks(result["doc_id"], result["version"],
                     chunk_blocks(result["doc_id"], result["version"], "报告",
                                  [RawBlock(1, "癫痫致痫网络")]))
    store.record_file("report.pdf", 1, 1, "sha", result["doc_id"], "indexed")
    # When the source file is removed
    store.drop_file("report.pdf")
    # Then its chunks are gone and it can no longer be retrieved
    assert store.chunk_rows() == []
    assert not store.retrieve("癫痫致痫网络").matched


def test_pdf_adapter_uses_mineru(tmp_path):
    import sys

    script = tmp_path / "fake_mineru.py"
    script.write_text(
        "import json, pathlib, sys\n"
        "out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)\n"
        "(out / 'full.md').write_text('# md', encoding='utf-8')\n"
        "(out / 'x_content_list.json').write_text(json.dumps([{'type': 'text', 'text': 'PDF第二页', 'page_idx': 1}]))\n",
        encoding="utf-8")
    pdf = tmp_path / "test.pdf"
    pdf.write_bytes(b"%PDF-1.4 stub")
    settings = Settings(_env_file=None, mineru_cmd=f"{sys.executable} {script} {{pdf}} {{out}}")
    doc = parse_file(pdf, settings, parsed_dir=tmp_path / "parsed")
    assert doc.pages[0].number == 2 and doc.pages[0].text == "PDF第二页"
    assert doc.parser == "mineru"


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
