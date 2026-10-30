"""F1: uploaded PDF names must never run as shell commands when mineru is invoked."""

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.agent.config import Settings
from src.knowledge import Knowledge
from src.main import create_app
from src.parsers import mineru_args, parse_file

HOSTILE = [
    "a$(touch pwned).pdf",
    'a";touch pwned;".pdf',
    "a & touch pwned.pdf",
    "a`touch pwned`.pdf",
    "a;touch pwned.pdf",
    "a | touch pwned.pdf",
    "a\ntouch pwned.pdf",
]
NORMAL = ["报告.pdf", "2024 年度 报告（终稿）.pdf", "R&D；说明 v1.2.pdf"]


def recording_mineru(tmp_path: Path) -> str:
    """A fake mineru that records the exact argv it received; quoted like the default template."""
    script = tmp_path / "record_mineru.py"
    script.write_text(
        "import json, pathlib, sys\n"
        "out = pathlib.Path(sys.argv[3]); out.mkdir(parents=True, exist_ok=True)\n"
        "(out / 'argv.json').write_text(json.dumps(sys.argv[1:], ensure_ascii=False), encoding='utf-8')\n"
        "(out / 'full.md').write_text('# md', encoding='utf-8')\n"
        "(out / 'x_content_list.json').write_text(json.dumps([{'type': 'text', 'text': 'ok', 'page_idx': 0}]))\n",
        encoding="utf-8",
    )
    return f'"{sys.executable}" "{script}" "{{pdf}}" -o "{{out}}"'


@pytest.mark.parametrize("name", HOSTILE + NORMAL)
def test_pdf_name_is_one_literal_argument_without_side_effects(tmp_path, monkeypatch, name):
    monkeypatch.chdir(tmp_path)
    source = tmp_path / "source"
    source.mkdir()
    pdf = source / name
    if sys.platform == "win32" and any(c in name for c in '"|\n'):
        import subprocess
        parsed = tmp_path / "parsed"
        subprocess.run(mineru_args(recording_mineru(tmp_path), pdf, parsed), check=True)
        assert json.loads((parsed / "argv.json").read_text(encoding="utf-8")) == [str(pdf), "-o", str(parsed)]
        assert not list(tmp_path.rglob("pwned"))
        return
    pdf.write_bytes(b"%PDF-1.4 stub")
    parsed = tmp_path / "parsed"
    doc = parse_file(pdf, Settings(_env_file=None, mineru_cmd=recording_mineru(tmp_path)), parsed_dir=parsed)
    assert doc.parser == "mineru" and doc.pages[0].text == "ok"
    assert json.loads((parsed / "argv.json").read_text(encoding="utf-8")) == [str(pdf), "-o", str(parsed)]
    assert not list(tmp_path.rglob("pwned"))


def test_default_template_keeps_quoted_paths_whole():
    args = mineru_args(
        Settings(_env_file=None).mineru_cmd, Path("/d/a b$(x).pdf"), Path("/o/a b"), search_path=""
    )
    assert args == [
        "mineru-kit",
        "parse",
        str(Path("/d/a b$(x).pdf")),
        "-o",
        str(Path("/o/a b")) + "/result.zip",
        "--tier",
        "basic",
        "--ocr-mode",
        "auto",
        "--format",
        "zip",
    ]


def test_windows_template_keeps_backslashes_and_strips_quotes():
    template = r'C:\tools\mineru-kit.exe parse "{pdf}" -o "{out}\result.zip"'
    args = mineru_args(template, Path(r"D:\库\a b.pdf"), Path(r"D:\out"), search_path="", windows=True)
    assert args == [r"C:\tools\mineru-kit.exe", "parse", r"D:\库\a b.pdf", "-o", r"D:\out\result.zip"]


def test_windows_batch_wrapper_refuses_cmd_metacharacters():
    with pytest.raises(ValueError, match="cmd"):
        mineru_args(
            r"C:\tools\mineru.cmd {pdf} {out}",
            Path(r"D:\R&D.pdf"),
            Path(r"D:\out"),
            search_path="",
            windows=True,
        )
    assert (
        mineru_args(
            r"C:\tools\mineru.cmd {pdf} {out}",
            Path(r"D:\报告.pdf"),
            Path(r"D:\out"),
            search_path="",
            windows=True,
        )[1]
        == r"D:\报告.pdf"
    )


@pytest.mark.parametrize("operator", [";", "&&", "|", ">"])
def test_shell_operators_in_template_are_refused_not_run(tmp_path, monkeypatch, operator):
    monkeypatch.chdir(tmp_path)
    pdf = tmp_path / "x.pdf"
    pdf.write_bytes(b"%PDF-1.4")
    settings = Settings(_env_file=None, mineru_cmd=f"{recording_mineru(tmp_path)} {operator} touch pwned")
    with pytest.raises(ValueError, match="shell"):
        parse_file(pdf, settings, parsed_dir=tmp_path / "parsed")
    assert not list(tmp_path.rglob("pwned"))


def upload_client(tmp_path):
    settings = Settings(_env_file=None, corpora_root=tmp_path / "knowledge", state_dir=tmp_path / "state")
    (tmp_path / "knowledge" / "demo" / "datadb").mkdir(parents=True)
    return TestClient(
        create_app(settings, Knowledge(tmp_path / "knowledge" / "demo" / "datadb" / "knowledge.sqlite3"))
    )


def raw_upload(client, cid, name: str):
    """Send the file name as raw bytes; httpx and browsers would percent-encode ``"`` and controls."""
    body = (
        b'--B\r\nContent-Disposition: form-data; name="upload"; filename="'
        + name.encode()
        + b'"\r\nContent-Type: text/markdown\r\n\r\n# x\r\n--B--\r\n'
    )
    return client.post(
        f"/api/corpora/{cid}/files", content=body, headers={"Content-Type": "multipart/form-data; boundary=B"}
    )


UNSAFE = [
    "a$(touch pwned).pdf",
    "a`id`.md",
    "a\x07b.md",
    "a\tb.md",
    "a\x1bb.md",
    "a|b.md",
    "a:b.md",
    "a<b>.md",
]


@pytest.mark.parametrize("name", UNSAFE)
def test_upload_rejects_unsafe_names_and_stores_nothing(tmp_path, name):
    with upload_client(tmp_path) as client:
        cid = client.post("/api/corpora", json={"name": "文件库"}).json()["id"]
        assert raw_upload(client, cid, name).status_code == 422
        assert client.get(f"/api/corpora/{cid}/files").json()["files"] == []
        folder = client.post(
            f"/api/corpora/{cid}/files",
            params={"relative_path": "资料$(id)/ok.md"},
            files={"upload": ("ok.md", b"# x", "text/markdown")},
        )
        assert folder.status_code == 422
    assert not list(tmp_path.rglob("pwned"))


@pytest.mark.parametrize("name", UNSAFE + ['a"b.md', 'a";touch pwned;".md'])
def test_rename_rejects_unsafe_names(tmp_path, name):
    with upload_client(tmp_path) as client:
        cid = client.post("/api/corpora", json={"name": "文件库"}).json()["id"]
        assert raw_upload(client, cid, "报告.md").status_code == 201
        assert (
            client.patch(
                f"/api/corpora/{cid}/files", json={"rel_path": "报告.md", "new_name": name}
            ).status_code
            == 422
        )
        assert [item["rel_path"] for item in client.get(f"/api/corpora/{cid}/files").json()["files"]] == [
            "报告.md"
        ]
    assert not list(tmp_path.rglob("pwned"))


@pytest.mark.parametrize("name", ["报告 2024（终稿）.md", "R&D；说明 v1.2.md", "a;b & c.md", "O'Brien.md"])
def test_upload_still_accepts_normal_names(tmp_path, name):
    with upload_client(tmp_path) as client:
        cid = client.post("/api/corpora", json={"name": "文件库"}).json()["id"]
        response = client.post(
            f"/api/corpora/{cid}/files",
            params={"relative_path": f"项目 A/{name}"},
            files={"upload": (name, "# 正文".encode(), "text/markdown")},
        )
        assert response.status_code == 201 and response.json()["added"] == 1
        assert [item["rel_path"] for item in client.get(f"/api/corpora/{cid}/files").json()["files"]] == [
            f"项目 A/{name}"
        ]
