"""Archive records (2026-11-09): envelope, legacy fallback, lifecycle and one-time migration."""

import json
from pathlib import Path
from types import SimpleNamespace

from src import records
from src.record_migration import migrate


def doc(version="v1", sha="abc"):
    return {"doc_id": "d1", "version": version, "title": "报告", "kind": "markdown",
            "origin": "a.md", "source_sha256": sha, "page_count": 1}


class Knowledge:
    def files(self):
        return {"a.md": {"rel_path": "a.md", "doc_id": "d1", "sha256": "abc"}}

    def read_markdown(self, doc_id, version):
        return "原文有一段\n\n第二段"

    def source_sha256(self, doc_id):
        return "abc"


def info(root: Path):
    return SimpleNamespace(root=root, id="c", name="测试库", dir_name="测试库")


def test_legacy_target_reads_as_the_archive_envelope_and_lifecycle_is_explicit(tmp_path):
    info_ = info(tmp_path)
    (tmp_path / "target").mkdir()
    legacy = {"doc_id": "d1", "version": "v1", "source_hash": "abc", "schema_version": 2,
              "prompt_version": 2, "process": {"status": "已完成", "coverage": {"processed": 1, "total": 1}},
              "facets": [{"key": "场景", "state": "has", "items": []}], "relations": []}
    (tmp_path / "target" / "d1.json").write_text(json.dumps(legacy), encoding="utf-8")
    loaded, error = records.load(info_, "d1")
    assert error == "" and loaded["doc_version"] == "v1"
    assert records.extraction_of(loaded)["facets"][0]["key"] == "场景"
    assert records.lifecycle(loaded, doc())["state"] == "已入库"

    broken = records.normalize({**legacy, "extraction": {"process": {"status": "未完成"}, "error": "坏了"}})
    assert records.lifecycle(broken, doc())["state"] == "失败"
    partial = records.normalize({"doc_id": "d1", "doc_version": "v1", "source_hash": "abc",
                                 "metadata": {"status": "partial", "missing": ["project_no"]},
                                 "extraction": {"process": {"status": "已完成"}, "facets": []}})
    assert records.lifecycle(partial, doc())["state"] == "待核对"
    assert "project_no" in "；".join(records.lifecycle(partial, doc())["reasons"])


def test_save_writes_the_archive_and_migration_moves_legacy_files(tmp_path):
    info_ = info(tmp_path)
    record = records.normalize({"doc_id": "d1", "version": "v1", "extraction": {"facets": [], "process": {}}})
    records.save(info_, record)
    assert (tmp_path / "archive" / "d1.json").is_file()
    assert records.mtime(info_, "d1")

    root = tmp_path / "corpora"
    corpus = root / "c1"
    (corpus / "target").mkdir(parents=True)
    (corpus / "target" / "x.json").write_text("{}", encoding="utf-8")
    rows = migrate(root)
    assert rows[0]["moved"] == 1
    assert (corpus / "archive" / "x.json").is_file()
    assert not (corpus / "target").exists()
    # Idempotent: the second run moves nothing.
    assert migrate(root)[0]["moved"] == 0


def test_corrected_text_applies_page_and_block_corrections(tmp_path):
    info_ = info(tmp_path)
    (tmp_path / "parsed" / "a.md").mkdir(parents=True)
    (tmp_path / "parsed" / "a.md" / "corrections.json").write_text(json.dumps({
        "source_sha256": "abc",
        "pages": {"0": {"before": "原文有一段", "after": "人工改过的正文"},
                  "1": {"blocks": {"b1": {"before": "第二段", "after": "第二段（改）"}}}},
    }, ensure_ascii=False), encoding="utf-8")
    text, text_sha, corrections_sha, invalidated = records.corrected_text(info_, Knowledge(), doc())
    assert text == "人工改过的正文\n\n第二段（改）"
    assert text_sha and corrections_sha and not invalidated


def test_write_metadata_and_extraction_share_one_envelope(tmp_path):
    info_ = info(tmp_path)
    settings = SimpleNamespace(model_name="test", parse_quality_grades={})
    knowledge = Knowledge()
    d = doc()
    metadata = {"status": "completed", "schema_version": 1, "dictionary_version": 1, "prompt_version": 1,
                "project": {"identity": "NSFC:1"}, "funding": [], "missing": [], "rejected": [],
                "process": {"error": ""}}
    extraction = {"schema_version": 2, "prompt_version": 2, "template_version": 1,
                  "process": {"status": "已完成", "coverage": {"processed": 1, "total": 1}},
                  "facets": [{"key": "场景", "state": "has", "items": []}], "relations": []}
    records.write_metadata(info_, knowledge, d, metadata, settings)
    records.write_extraction(info_, knowledge, d, extraction, settings)
    loaded, error = records.load(info_, "d1")
    assert error == ""
    assert records.metadata_of(loaded)["project"]["identity"] == "NSFC:1"
    assert records.extraction_of(loaded)["facets"][0]["key"] == "场景"
    assert loaded["source"]["title"] == "报告" and loaded["parse"]["text_sha256"]
    assert loaded["versions"]["metadata_dictionary"] == 1
    assert loaded["versions"]["extraction_template"] == 1


def test_project_index_prefers_archive_project_facts(tmp_path):
    from src.project_index import ProjectIndex
    info_ = info(tmp_path)
    settings = SimpleNamespace(model_name="test", parse_quality_grades={})
    metadata = {"status": "completed", "schema_version": 1, "dictionary_version": 1, "prompt_version": 1,
                "project": {
                    "project_name": {"value": "横向合同项目", "source": "content"},
                    "project_no": {"value": "HT-2024-001", "source": "content"},
                    "project_scheme": {"value": "HORIZONTAL", "source": "content"},
                    "lead_unit": {"value": "示例公司", "source": "content"},
                    "principal_investigator": {"value": "李四", "source": "content"},
                    "start_date": {"value": "2024-03", "precision": "month", "source": "content"},
                    "end_date": {"value": "2025-12", "precision": "month", "source": "content"},
                },
                "funding": [
                    {"term": "total", "amount": "120", "unit": "万元", "currency": "CNY",
                     "evidence": [{"quote": "项目总经费：120 万元"}]},
                    {"term": "awarded", "amount": "100", "unit": "万元", "currency": "CNY",
                     "evidence": [{"quote": "批准资助：100 万元"}]},
                ], "missing": [], "rejected": []}
    records.write_metadata(info_, Knowledge(), doc(), metadata, settings)
    index = ProjectIndex(tmp_path / "index.sqlite3")
    row = index.document(info_, doc(), "# 任意正文\n\n项目总经费：120 万元")
    assert row["family"] == "HORIZONTAL"
    assert row["number"] == "HT-2024-001"
    assert row["title"] == "横向合同项目"
    assert row["start_year"] == 2024 and row["end_year"] == 2025
    assert row["admin"] == "李四" and row["unit"] == "示例公司"
    total = next(item for item in row["funding"] if item["scope"] == "total")
    assert total["amount_yuan"] == "1200000"
    assert total["source"] == "metadata"


def test_project_facts_reader_and_retrieval_prefer_archive(tmp_path):
    from src.retrieval import report_header

    info_ = info(tmp_path)
    settings = SimpleNamespace(model_name="test", parse_quality_grades={})
    metadata = {"status": "completed", "schema_version": 1, "dictionary_version": 1, "prompt_version": 1,
                "project": {
                    "project_name": {"value": "档案项目名", "source": "content"},
                    "project_no": {"value": "HT-9", "source": "content"},
                    "project_scheme": {"value": "HORIZONTAL", "source": "content"},
                    "principal_investigator": {"value": "王五", "source": "content"},
                    "start_date": {"value": "2023-05", "precision": "month", "source": "content"},
                    "end_date": {"value": "2026-04", "precision": "month", "source": "content"},
                }, "funding": [], "missing": [], "rejected": []}
    records.write_metadata(info_, Knowledge(), doc(), metadata, settings)
    facts = records.project_facts(info_, "d1")
    assert facts["has_facts"] and facts["number"] == "HT-9" and facts["scheme"] == "HORIZONTAL"
    assert facts["start_year"] == 2023 and facts["end_year"] == 2026
    assert facts["pi"] == "王五"

    header = report_header(SimpleNamespace(title="报告", project_no="HT-9", pi="王五",
                                           year_from=2023, year_to=2026, fact_basis="archive"))
    assert "按项目记录" in header and "按文件名" not in header
    missing = records.project_facts(info_, "nope")
    assert missing == {}


def test_two_writers_do_not_lose_each_others_section(tmp_path):
    """Facts and extraction write the same file: each write keeps the other section intact."""
    import threading

    info_ = info(tmp_path)
    settings = SimpleNamespace(model_name="test", parse_quality_grades={})
    metadata = {"status": "completed", "schema_version": 1, "dictionary_version": 1, "prompt_version": 1,
                "project": {"project_no": {"value": "A-1", "source": "content"}},
                "funding": [], "missing": [], "rejected": []}
    extraction = {"schema_version": 2, "prompt_version": 2, "template_version": 1,
                  "process": {"status": "已完成", "coverage": {"processed": 1, "total": 1}},
                  "facets": [{"key": "场景", "state": "has", "items": []}], "relations": []}
    threads = [threading.Thread(target=records.write_metadata, args=(info_, Knowledge(), doc(), metadata, settings)),
               threading.Thread(target=records.write_extraction, args=(info_, Knowledge(), doc(), extraction, settings))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    loaded, error = records.load(info_, "d1")
    assert error == ""
    assert records.metadata_of(loaded)["project"]["project_no"]["value"] == "A-1"
    assert records.extraction_of(loaded)["facets"][0]["key"] == "场景"
