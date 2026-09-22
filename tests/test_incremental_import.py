"""K1: incremental local import backed by the `files` manifest."""

from src.agent.config import Settings
from src.knowledge import Knowledge
from src.parsers import import_defaults


def store_for(tmp_path):
    return Knowledge(tmp_path / "datadb" / "knowledge.sqlite3")


def test_second_import_skips_unchanged_files(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "a.md").write_text("# A\n正文", encoding="utf-8")
    store = store_for(tmp_path)
    settings = Settings(_env_file=None)

    first = import_defaults(store, settings, root=source)
    assert (first["added"], len(first["imported"]), first["skipped"]) == (1, 1, 0)
    second = import_defaults(store, settings, root=source)
    assert (second["added"], len(second["imported"]), second["skipped"]) == (0, 0, 1)


def test_changed_file_is_reparsed(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    target = source / "a.md"
    target.write_text("# A\n正文", encoding="utf-8")
    store = store_for(tmp_path)
    settings = Settings(_env_file=None)
    import_defaults(store, settings, root=source)

    target.write_text("# A\n正文已更新更长", encoding="utf-8")
    report = import_defaults(store, settings, root=source)
    assert (report["updated"], len(report["imported"]), report["skipped"]) == (1, 1, 0)


def test_deleted_source_leaves_manifest_and_index(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "a.md").write_text("# A\n甲", encoding="utf-8")
    keep = source / "b.md"
    keep.write_text("# B\n乙", encoding="utf-8")
    store = store_for(tmp_path)
    settings = Settings(_env_file=None)
    import_defaults(store, settings, root=source)
    assert {doc["title"] for doc in store.all()} == {"a", "b"}

    keep.unlink()
    report = import_defaults(store, settings, root=source)
    assert report["deleted"] == 1
    assert {doc["title"] for doc in store.all()} == {"a"}
    assert "b.md" not in store.files()
    assert store.search("乙") == []


def test_failed_reparse_keeps_previous_version_and_marks_error(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    target = source / "a.txt"
    target.write_text("测试正文", encoding="utf-8")
    store = store_for(tmp_path)
    settings = Settings(_env_file=None)
    import_defaults(store, settings, root=source)

    target.write_bytes(b"\xff\xfe\x00broken")
    report = import_defaults(store, settings, root=source)
    assert len(report["errors"]) == 1
    assert store.files()["a.txt"]["status"] == "error"
    assert store.all()[0]["pages"][0]["text"] == "测试正文"
