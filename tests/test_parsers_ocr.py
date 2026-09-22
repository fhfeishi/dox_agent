"""K2/K3: OCR tiers (off/force/auto) and liteparse worker count."""

from pathlib import Path
from types import SimpleNamespace

import liteparse

from src.agent.config import Settings
from src.parsers import parse_pdf_pages


def patch_parser(monkeypatch, text_pages):
    calls: list[dict] = []

    class Parser:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def parse(self, path):
            calls.append(dict(self.kwargs))
            if self.kwargs.get("ocr_enabled"):
                targets = self.kwargs.get("target_pages")
                numbers = [int(item) for item in targets.split(",")] if targets else [number for number, _ in text_pages]
                return SimpleNamespace(pages=[SimpleNamespace(page_num=n, text=f"OCR{n}") for n in numbers])
            return SimpleNamespace(pages=[SimpleNamespace(page_num=n, text=t) for n, t in text_pages])

    monkeypatch.setattr(liteparse, "LiteParse", Parser)
    return calls


def test_auto_does_not_ocr_when_text_layer_is_present(monkeypatch):
    calls = patch_parser(monkeypatch, [(1, "正文1"), (2, "正文2")])
    pages = parse_pdf_pages(Path("x.pdf"), Settings(_env_file=None, pdf_ocr_mode="auto"))
    assert [call["ocr_enabled"] for call in calls] == [False]
    assert [page.text for page in pages] == ["正文1", "正文2"]


def test_auto_ocrs_only_text_less_pages(monkeypatch):
    calls = patch_parser(monkeypatch, [(1, "正文1"), (2, "   ")])
    pages = parse_pdf_pages(Path("x.pdf"), Settings(_env_file=None, pdf_ocr_mode="auto"))
    assert [call["ocr_enabled"] for call in calls] == [False, True]
    assert calls[1]["target_pages"] == "2"
    assert [page.text for page in pages] == ["正文1", "OCR2"]


def test_force_always_ocrs_and_off_never_does(monkeypatch):
    calls = patch_parser(monkeypatch, [(1, "正文1")])
    parse_pdf_pages(Path("x.pdf"), Settings(_env_file=None, pdf_ocr_mode="force"))
    assert [call["ocr_enabled"] for call in calls] == [True]

    calls = patch_parser(monkeypatch, [(1, "正文1"), (2, "  ")])
    pages = parse_pdf_pages(Path("x.pdf"), Settings(_env_file=None, pdf_ocr_mode="off"))
    assert [call["ocr_enabled"] for call in calls] == [False]
    assert pages[1].text == "  "


def test_worker_count_is_forwarded(monkeypatch):
    calls = patch_parser(monkeypatch, [(1, "正文1")])
    parse_pdf_pages(Path("x.pdf"), Settings(_env_file=None, pdf_ocr_mode="off", pdf_num_workers=4))
    assert calls[0]["num_workers"] == 4
