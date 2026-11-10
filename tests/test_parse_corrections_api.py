"""A2/A5-d / R10 / R11: the correction write endpoint. Decision A: only corrections.json changes.

One app and one lifespan are shared by the whole module: creating an app costs ~15 s here (the
lifespan warms every corpus' SQLite), and a fresh app per test made the file take minutes. Each
test builds its own corpus directory inside the shared root, so nothing leaks between tests while
the expensive startup happens once. No MinerU run, no model call, no touch of the real
``.knowledge``.
"""

import json

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from src.agent.config import Settings
from src.corrections import CORRECTIONS_FILE, read
from src.knowledge import Knowledge
from src.main import create_app
from src.parse_cache import parse_quality, write_cache
from src.parsers import sha256_file

BEFORE = "网络谣言精准治理"
AFTER = "网络谣言精确治理"


def login(client, name):
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"username": name, "password": "123456"}).status_code == 200


@pytest.fixture(scope="module")
def bench(tmp_path_factory):
    """One app for the module; its lifespan cost is paid once (~15 s on this filesystem)."""
    root = tmp_path_factory.mktemp("corrections")
    settings = Settings(_env_file=None, corpora_root=root / ".knowledge", state_dir=root / "state",
                        user_dir=root / "usr")
    app = create_app(settings)
    with TestClient(app) as client:
        # The shared client keeps its cookie jar across tests, and login() clears it. Sign in
        # once here so a test that lists corpora before its own login() is not order-dependent.
        login(client, "admin")
        yield client, settings, root


def write_pdf(path, pages=3):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=300)
    with path.open("wb") as handle:
        writer.write(handle)


def make_corpus(client, settings, root, name, *, texts=None, blocks=None, with_cache=True):
    """A corpus directory with a real source PDF and a real parsed directory.

    ``blocks`` gives page 0's middle-JSON blocks (a plain text list when omitted); ``texts`` is the
    per-page text used for the cache quality facts.
    """
    texts = texts if texts is not None else [f"封面 {BEFORE} 项目批准号 72174134", "正文 另一页", ""]
    rel = "2022_2025_72174134_报告.pdf"
    corpus_root = root / ".knowledge" / name
    (corpus_root / "source").mkdir(parents=True, exist_ok=True)
    (corpus_root / "datadb").mkdir(parents=True, exist_ok=True)
    source = corpus_root / "source" / rel
    write_pdf(source, pages=len(texts))
    parsed = corpus_root / "parsed" / rel
    parsed.mkdir(parents=True, exist_ok=True)
    pages = []
    for index, text in enumerate(texts):
        page_blocks = blocks if (blocks is not None and index == 0) else [
            {"type": "text", "content": [{"type": "text", "content": text}]}]
        pages.append({"page_idx": index, "blocks": page_blocks})
    (parsed / "middle_json.json").write_text(json.dumps({"pages": pages}), encoding="utf-8")
    (parsed / "markdown.md").write_text("# 报告", encoding="utf-8")
    if with_cache:
        # The marker names the source's real bytes: a correction is judged against the file (B1).
        write_cache(parsed, rel=rel, source_sha=sha256_file(source), version="v1", profile="mineru",
                    pages=len(texts), quality=parse_quality(texts, len(texts)))
    listing = client.get("/api/corpora").json()
    corpus_id = next(item["id"] for item in listing if item["name"] == name)
    return {"id": corpus_id, "name": name, "rel": rel, "parsed": parsed,
            "source": source, "texts": texts, "root": corpus_root}


def url(corpus, suffix=""):
    return f"/api/corpora/{corpus['id']}/parse{suffix}"


def test_an_administrator_saves_a_correction_that_the_reader_then_applies(bench):
    client, settings, root = bench
    corpus = make_corpus(client, settings, root, "page-level")
    login(client, "admin")
    saved = client.put(url(corpus, "/corrections"),
                       json={"rel": corpus["rel"], "page": 0, "before": BEFORE, "after": AFTER})
    assert saved.status_code == 200
    assert saved.json() == {"active": True, "invalidated": False, "pages": [0]}
    assert read(corpus["parsed"])["pages"]["0"]["by"] == "admin"
    page = client.get(url(corpus, "/page/0"), params={"rel": corpus["rel"]}).json()
    assert page["text"] == corpus["texts"][0]
    assert page["corrected_text"] == f"封面 {AFTER} 项目批准号 72174134"
    assert page["corrections"]["after"] == AFTER
    archive = client.get(url(corpus, "/archive"), params={"rel": corpus["rel"]}).json()
    assert archive["corrections"] == {"active": True, "invalidated": False, "pages": [0]}


def test_an_ordinary_user_may_not_write_a_system_library_correction(bench):
    client, settings, root = bench
    corpus = make_corpus(client, settings, root, "read-only-roles")
    for name in ("user", "owner"):
        login(client, name)
        refused = client.put(url(corpus, "/corrections"),
                             json={"rel": corpus["rel"], "page": 0, "before": BEFORE, "after": AFTER})
        assert refused.status_code == 403, (name, refused.text)
    assert not (corpus["parsed"] / CORRECTIONS_FILE).exists()


def test_a_personal_library_upload_is_corrected_by_its_owner_only(bench):
    """``mine-<id>`` is reachable for the owner; everyone else, the administrator included, gets 404."""
    client, settings, root = bench
    login(client, "user")
    library = client.post("/api/personal-libraries", json={"name": "我的笔记"}).json()
    mine = "mine-" + library["id"]
    upload = client.post(f"/api/personal-libraries/{library['id']}/files",
                         files={"upload": ("笔记.md", "# 笔记\n\n联邦学习。".encode(), "text/markdown")})
    assert upload.status_code == 202
    for _ in range(400):
        read_back = client.get(f"/api/personal-libraries/{library['id']}").json()
        if read_back["refs"]:
            break
    library_root = settings.user_dir / "user" / "workspace" / "libraries" / library["id"]
    parsed = library_root / "parsed" / "笔记.md"
    parsed.mkdir(parents=True, exist_ok=True)
    (parsed / "middle_json.json").write_text(json.dumps({"pages": [
        {"page_idx": 0, "blocks": [{"type": "text", "content": [{"type": "text", "content": "联邦学习。"}]}]}]}),
        encoding="utf-8")
    (parsed / "markdown.md").write_text("# 笔记", encoding="utf-8")
    source = library_root / "source" / "笔记.md"
    # No cache.json: the legacy case, where the source file itself gives the identity.
    body = {"rel": "笔记.md", "page": 0, "before": "联邦学习。", "after": "联邦学习（联合学习）。"}
    own = client.put(f"/api/corpora/{mine}/parse/corrections", json=body)
    assert own.status_code == 200, own.text
    assert own.json()["active"] is True
    assert read(parsed)["source_sha256"] == sha256_file(source)  # computed, never None
    page = client.get(f"/api/corpora/{mine}/parse/page/0", params={"rel": "笔记.md"}).json()
    assert page["corrected_text"] == "联邦学习（联合学习）。"
    for name in ("owner", "admin"):
        login(client, name)
        assert client.put(f"/api/corpora/{mine}/parse/corrections", json=body).status_code == 404
    login(client, "user")
    second = client.post("/api/personal-libraries", json={"name": "另一个"}).json()
    assert client.put(f"/api/corpora/mine-{second['id']}/parse/corrections", json=body).status_code == 404


def test_a_before_that_does_not_match_the_parse_is_refused(bench):
    client, settings, root = bench
    corpus = make_corpus(client, settings, root, "before-mismatch")
    login(client, "admin")
    refused = client.put(url(corpus, "/corrections"),
                         json={"rel": corpus["rel"], "page": 0, "before": "这句不在正文里", "after": "改后"})
    assert refused.status_code == 422
    assert not (corpus["parsed"] / CORRECTIONS_FILE).exists()
    assert client.put(url(corpus, "/corrections"),
                      json={"rel": corpus["rel"], "page": 3, "before": BEFORE,
                            "after": AFTER}).status_code == 422
    assert client.put(url(corpus, "/corrections"),
                      json={"rel": "../逃逸.pdf", "page": 0, "before": BEFORE,
                            "after": AFTER}).status_code == 422


def test_a_correction_changes_no_cache_and_no_published_version(bench):
    """Decision A: the write lands in corrections.json only; the parse and its version stay put."""
    client, settings, root = bench
    corpus = make_corpus(client, settings, root, "no-republish")
    login(client, "admin")
    before_cache = (corpus["parsed"] / "cache.json").read_text(encoding="utf-8")
    store = Knowledge(corpus["root"] / "datadb" / "knowledge.sqlite3", settings=settings,
                      source_root=corpus["root"] / "source")
    before_rows = store.all()
    assert client.put(url(corpus, "/corrections"),
                      json={"rel": corpus["rel"], "page": 0, "before": BEFORE, "after": AFTER}).status_code == 200
    assert (corpus["parsed"] / "cache.json").read_text(encoding="utf-8") == before_cache
    assert store.all() == before_rows  # no Knowledge.put, so no version and no chunk changes
    archive = client.get(url(corpus, "/archive"), params={"rel": corpus["rel"]}).json()
    assert archive["legacy"] is False
    assert archive["cache"]["source_sha256"] == sha256_file(corpus["source"])


def test_a_correction_written_against_a_replaced_source_is_void(bench):
    """B1: the marker may still name the old bytes; the file itself decides whether the overlay holds."""
    client, settings, root = bench
    corpus = make_corpus(client, settings, root, "replaced-source")
    login(client, "admin")
    assert client.put(url(corpus, "/corrections"),
                      json={"rel": corpus["rel"], "page": 0, "before": BEFORE, "after": AFTER}).status_code == 200
    page = client.get(url(corpus, "/page/0"), params={"rel": corpus["rel"]}).json()
    assert page["corrected_text"] == f"封面 {AFTER} 项目批准号 72174134"
    # The source file is replaced; cache.json still names the old sha, which must not win.
    write_pdf(corpus["source"], pages=1)
    archive = client.get(url(corpus, "/archive"), params={"rel": corpus["rel"]}).json()
    assert archive["corrections"] == {"active": False, "invalidated": True, "pages": []}
    page = client.get(url(corpus, "/page/0"), params={"rel": corpus["rel"]}).json()
    assert page["corrected_text"] == corpus["texts"][0] and page["corrections"] is None
    refused = client.put(url(corpus, "/corrections"),
                         json={"rel": corpus["rel"], "page": 0, "before": BEFORE, "after": AFTER})
    assert refused.status_code == 422 and "旧原件" in refused.json()["detail"]


def test_a_deleted_source_blocks_corrections_and_voids_the_overlay(bench):
    """B1: no source bytes, no identity — the write is refused and nothing is written with None."""
    client, settings, root = bench
    corpus = make_corpus(client, settings, root, "deleted-source")
    login(client, "admin")
    corpus["source"].unlink()
    refused = client.put(url(corpus, "/corrections"),
                         json={"rel": corpus["rel"], "page": 0, "before": BEFORE, "after": AFTER})
    assert refused.status_code == 422 and "原件不存在" in refused.json()["detail"]
    assert not (corpus["parsed"] / CORRECTIONS_FILE).exists()


def test_a_blank_parse_page_can_be_filled_in(bench):
    """M4: page 2 has no text, so ``before`` is empty and the whole page is supplied."""
    client, settings, root = bench
    corpus = make_corpus(client, settings, root, "blank-page")
    login(client, "admin")
    assert corpus["texts"][2] == ""
    saved = client.put(url(corpus, "/corrections"),
                       json={"rel": corpus["rel"], "page": 2, "before": "", "after": "人工补录：本页图表说明"})
    assert saved.status_code == 200 and saved.json()["pages"] == [2]
    page = client.get(url(corpus, "/page/2"), params={"rel": corpus["rel"]}).json()
    assert page["corrected_text"] == "人工补录：本页图表说明"
    for other in (0, 1):
        read_back = client.get(url(corpus, f"/page/{other}"), params={"rel": corpus["rel"]}).json()
        assert read_back["corrected_text"] == corpus["texts"][other] and read_back["corrections"] is None


def test_saving_another_page_keeps_the_first_pages_record(bench):
    """M1: saving page 1 must not rewrite who proofread page 0, nor when."""
    client, settings, root = bench
    corpus = make_corpus(client, settings, root, "two-pages")
    login(client, "admin")
    assert client.put(url(corpus, "/corrections"),
                      json={"rel": corpus["rel"], "page": 0, "before": BEFORE, "after": AFTER}).status_code == 200
    first = read(corpus["parsed"])["pages"]["0"]
    assert first["by"] == "admin"
    assert client.put(url(corpus, "/corrections"),
                      json={"rel": corpus["rel"], "page": 1, "before": "另一页",
                            "after": "另一页（校对）"}).status_code == 200
    stored = read(corpus["parsed"])
    assert (stored["pages"]["0"]["by"], stored["pages"]["0"]["at"]) == (first["by"], first["at"])
    assert stored["pages"]["1"]["by"] == "admin" and sorted(stored["pages"]) == ["0", "1"]


def test_a_legacy_parse_refuses_a_correction_after_the_source_changed(bench):
    """The same rule without a cache.json: the overlay's own recorded sha is the identity."""
    client, settings, root = bench
    corpus = make_corpus(client, settings, root, "legacy-stale", with_cache=False)
    login(client, "admin")
    assert client.put(url(corpus, "/corrections"),
                      json={"rel": corpus["rel"], "page": 0, "before": BEFORE, "after": AFTER}).status_code == 200
    write_pdf(corpus["source"], pages=1)
    refused = client.put(url(corpus, "/corrections"),
                         json={"rel": corpus["rel"], "page": 0, "before": BEFORE, "after": AFTER})
    assert refused.status_code == 422 and "旧原件" in refused.json()["detail"]


# ---------------------------------------------------------------- R10: blocks and the page image

BLOCKS = [
    {"type": "text", "index": 0, "bbox": [0.1, 0.1, 0.9, 0.2],
     "content": [{"type": "text", "content": f"第一块 {BEFORE}"}]},
    {"type": "image", "index": 1, "bbox": [0.1, 0.3, 0.5, 0.6],
     "content": [{"type": "image_body", "content": ""}]},
    {"type": "text", "index": 2, "bbox": [0.1, 0.7, 0.9, 0.8],
     "content": [{"type": "text", "content": "第三块 正文"}]},
]


def blocks_corpus(client, settings, root, name, blocks=None):
    return make_corpus(client, settings, root, name, with_cache=False, blocks=blocks or BLOCKS)


def test_blocks_are_returned_in_reading_order_with_bboxes(bench):
    """R10: blocks carry a stable id, a normalised bbox and ``no_text`` for an empty block."""
    client, settings, root = bench
    corpus = blocks_corpus(client, settings, root, "blocks-order")
    login(client, "admin")
    body = client.get(url(corpus, "/blocks"), params={"rel": corpus["rel"], "page": 0}).json()
    assert body["page"] == 0 and body["page_count"] == 3
    assert [item["id"] for item in body["blocks"]] == ["p0-b0", "p0-b1", "p0-b2"]  # already top-down
    assert all(isinstance(item["bbox"], list) and len(item["bbox"]) == 4 for item in body["blocks"])
    assert [item["no_text"] for item in body["blocks"]] == [False, True, False]
    assert body["blocks"][1]["text"] == "" and body["blocks"][0]["text"].startswith("第一块")
    assert client.get(url(corpus, "/blocks"), params={"rel": corpus["rel"], "page": 5}).status_code == 404
    assert client.get(url(corpus, "/blocks"), params={"rel": "nope.pdf", "page": 0}).status_code == 404


def test_the_page_image_is_rendered_from_the_source_pdf(bench):
    """R10: a real PNG of the original page, no MinerU run, no file written."""
    client, settings, root = bench
    corpus = blocks_corpus(client, settings, root, "page-image")
    login(client, "admin")
    image = client.get(url(corpus, "/page-image"), params={"rel": corpus["rel"], "page": 0})
    assert image.status_code == 200 and image.headers["content-type"] == "image/png"
    assert image.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert client.get(url(corpus, "/page-image"), params={"rel": corpus["rel"], "page": 9}).status_code == 404
    assert client.get(url(corpus, "/page-image"),
                      params={"rel": "../逃逸.pdf", "page": 0}).status_code == 422
    assert client.get(url(corpus, "/page-image"),
                      params={"rel": "nope.pdf", "page": 0}).status_code == 404
    assert not list(corpus["parsed"].glob("*.png"))  # nothing was written next to the parse


def test_a_block_correction_edits_only_that_block(bench):
    """R11 #1/#10: a block save needs that block's exact text and touches no other block."""
    client, settings, root = bench
    corpus = blocks_corpus(client, settings, root, "block-only")
    login(client, "admin")
    blocks = client.get(url(corpus, "/blocks"), params={"rel": corpus["rel"], "page": 0}).json()["blocks"]
    first = blocks[0]
    saved = client.put(url(corpus, "/corrections"),
                       json={"rel": corpus["rel"], "page": 0, "block_id": first["id"],
                             "before": first["text"], "after": "第一块（校对）", "bbox": first["bbox"]})
    assert saved.status_code == 200 and saved.json()["pages"] == [0]
    stored = read(corpus["parsed"])["pages"]["0"]
    assert list(stored["blocks"]) == [first["id"]]
    assert stored["blocks"][first["id"]]["bbox"] == first["bbox"]
    assert stored["blocks"][first["id"]]["by"] == "admin"
    assert "before" not in stored  # a block save never writes page-level text
    # A second block keeps its own writer; the first block's record does not move (M1).
    second = blocks[2]
    before_first = dict(stored["blocks"][first["id"]])
    assert client.put(url(corpus, "/corrections"),
                      json={"rel": corpus["rel"], "page": 0, "block_id": second["id"],
                            "before": second["text"], "after": "第三块（校对）"}).status_code == 200
    stored = read(corpus["parsed"])["pages"]["0"]["blocks"]
    assert (stored[first["id"]]["by"], stored[first["id"]]["at"]) == (
        before_first["by"], before_first["at"])
    assert stored[second["id"]]["after"] == "第三块（校对）"
    assert client.put(url(corpus, "/corrections"),
                      json={"rel": corpus["rel"], "page": 0, "block_id": "p9-b9",
                            "before": "x", "after": "y"}).status_code == 422


def test_a_block_save_refuses_a_before_that_is_not_that_blocks_text(bench):
    """R11 #10: ``before`` must be the block's own current text, not a fragment of the page."""
    client, settings, root = bench
    corpus = blocks_corpus(client, settings, root, "block-before")
    login(client, "admin")
    blocks = client.get(url(corpus, "/blocks"), params={"rel": corpus["rel"], "page": 0}).json()["blocks"]
    refused = client.put(url(corpus, "/corrections"),
                         json={"rel": corpus["rel"], "page": 0, "block_id": blocks[0]["id"],
                               "before": "第一块", "after": "改后"})  # a fragment, not the whole block
    assert refused.status_code == 422
    assert not (corpus["parsed"] / CORRECTIONS_FILE).exists()


def test_two_blocks_with_the_same_text_are_not_confused(bench):
    """R11 #1: identical words in two blocks must stay separate — identity is the block id."""
    client, settings, root = bench
    same = "重复的同一句话"
    duplicated = [
        {"type": "text", "index": 0, "bbox": [0.1, 0.1, 0.9, 0.2],
         "content": [{"type": "text", "content": same}]},
        {"type": "text", "index": 1, "bbox": [0.1, 0.3, 0.9, 0.4],
         "content": [{"type": "text", "content": same}]},
    ]
    corpus = blocks_corpus(client, settings, root, "duplicate-blocks", blocks=duplicated)
    login(client, "admin")
    blocks = client.get(url(corpus, "/blocks"), params={"rel": corpus["rel"], "page": 0}).json()["blocks"]
    first, second = blocks[0], blocks[1]
    assert first["text"] == second["text"] == same
    assert client.put(url(corpus, "/corrections"),
                      json={"rel": corpus["rel"], "page": 0, "block_id": first["id"],
                            "before": same, "after": "第一块改了"}).status_code == 200
    after = client.get(url(corpus, "/blocks"), params={"rel": corpus["rel"], "page": 0}).json()["blocks"]
    assert [block["text"] for block in after] == ["第一块改了", same]
    assert after[0]["original_text"] == same and after[1]["text"] == same


def test_filling_a_blank_block_does_not_overwrite_the_page(bench):
    """R11 #1: an empty block's fill-in is scoped to that block, never the whole page."""
    client, settings, root = bench
    corpus = blocks_corpus(client, settings, root, "blank-block")
    login(client, "admin")
    blocks = client.get(url(corpus, "/blocks"), params={"rel": corpus["rel"], "page": 0}).json()["blocks"]
    blank = blocks[1]
    assert blank["no_text"] is True
    page_before = client.get(url(corpus, "/page/0"), params={"rel": corpus["rel"]}).json()
    saved = client.put(url(corpus, "/corrections"),
                       json={"rel": corpus["rel"], "page": 0, "block_id": blank["id"],
                             "before": "", "after": "补录：这一块是图，人工说明"})
    assert saved.status_code == 200
    after = client.get(url(corpus, "/blocks"), params={"rel": corpus["rel"], "page": 0}).json()["blocks"]
    assert after[1]["text"] == "补录：这一块是图，人工说明" and after[1]["no_text"] is False
    # The other blocks and the page-level entry are untouched: no whole-page replacement happened.
    assert after[0]["text"].startswith("第一块") and after[2]["text"] == "第三块 正文"
    assert "before" not in read(corpus["parsed"])["pages"]["0"]
    # The parse's own page text is unchanged: compare against what it read before the save
    # (this corpus has blocks, so its page text is derived from the blocks, not from ``texts``).
    page = client.get(url(corpus, "/page/0"), params={"rel": corpus["rel"]}).json()
    assert page["text"] == page_before["text"]


def test_consecutive_block_saves_accumulate_without_losing_earlier_blocks(bench):
    """R11 #1: three saves in a row keep every earlier block's record."""
    client, settings, root = bench
    corpus = blocks_corpus(client, settings, root, "consecutive")
    login(client, "admin")
    blocks = client.get(url(corpus, "/blocks"), params={"rel": corpus["rel"], "page": 0}).json()["blocks"]
    for block, after in ((blocks[0], "第一块（一）"), (blocks[2], "第三块（二）"), (blocks[1], "图（三）")):
        response = client.put(url(corpus, "/corrections"),
                              json={"rel": corpus["rel"], "page": 0, "block_id": block["id"],
                                    "before": block["text"], "after": after})
        assert response.status_code == 200, response.text
    stored = read(corpus["parsed"])["pages"]["0"]["blocks"]
    assert sorted(stored) == ["p0-b0", "p0-b1", "p0-b2"]
    assert [stored[key]["after"] for key in ("p0-b0", "p0-b1", "p0-b2")] == [
        "第一块（一）", "图（三）", "第三块（二）"]

    # Re-edit the text returned by GET, including a block that was originally blank.
    for index in (0, 1):
        current = client.get(url(corpus, "/blocks"),
                             params={"rel": corpus["rel"], "page": 0}).json()["blocks"]
        block = current[index]
        payload = {"rel": corpus["rel"], "page": 0, "block_id": block["id"],
                   "before": block["text"], "after": f"二次校对 {index}"}
        response = client.put(url(corpus, "/corrections"), json=payload)
        assert response.status_code == 200, response.text
        latest = client.get(url(corpus, "/blocks"),
                            params={"rel": corpus["rel"], "page": 0}).json()["blocks"]
        assert latest[index]["text"] == payload["after"]
        assert latest[index]["original_text"] == blocks[index]["text"]
        assert [b["text"] for i, b in enumerate(latest) if i != index] == [
            b["text"] for i, b in enumerate(current) if i != index]
        page = client.get(url(corpus, "/page/0"), params={"rel": corpus["rel"]}).json()
        assert page["corrected_text"] == "\n".join(b["text"] for b in latest if b["text"])
        stored_before = (corpus["parsed"] / CORRECTIONS_FILE).read_bytes()
        for stale in (payload["before"], blocks[index]["text"]):
            refused = client.put(url(corpus, "/corrections"),
                                 json={**payload, "before": stale, "after": "过期覆盖"})
            assert refused.status_code == 422
            assert (corpus["parsed"] / CORRECTIONS_FILE).read_bytes() == stored_before
