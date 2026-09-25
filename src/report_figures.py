"""Verified PDF figures for optional illustrated reports."""

import hashlib
import io
import json
import re
from pathlib import Path

import pypdfium2
from PIL import Image, ImageChops, ImageOps, ImageStat

from .parsers import _block_text, sha256_file


def _image_paths(node: object) -> list[str]:
    if isinstance(node, list):
        return [path for item in node for path in _image_paths(item)]
    if isinstance(node, dict):
        return ([node["image_path"]] if isinstance(node.get("image_path"), str) else []) + _image_paths(node.get("content"))
    return []


def _caption(block: dict) -> str:
    return " ".join(_block_text(item) for item in block.get("content", [])
                    if isinstance(item, dict) and "caption" in str(item.get("type", ""))).strip()


def _same_row(a: list, b: list) -> bool:
    return (max(a[1], b[1]) < min(a[3], b[3]) and
            abs((a[1] + a[3]) / 2 - (b[1] + b[3]) / 2) < .08 and
            min(abs(a[2] - b[0]), abs(b[2] - a[0])) < .06)


def _verified_image(pdf_path: Path, page_idx: int, bbox: list, image_path: Path) -> bytes | None:
    """Old MinerU caches have no PDF digest, so compare each image with today's PDF page."""
    try:
        data = image_path.read_bytes()
        with Image.open(io.BytesIO(data)) as original:
            if original.width < 320 or original.height < 200 or len(data) > 8_000_000:
                return None
            image = ImageOps.grayscale(ImageOps.fit(original, (128, 128)))
        pdf = pypdfium2.PdfDocument(pdf_path)
        if page_idx >= len(pdf):
            return None
        rendered = pdf[page_idx].render(scale=2).to_pil().convert("RGB")
        crop = rendered.crop((round(bbox[0] * rendered.width), round(bbox[1] * rendered.height),
                              round(bbox[2] * rendered.width), round(bbox[3] * rendered.height)))
        reference = ImageOps.grayscale(ImageOps.fit(crop, (128, 128)))
        difference = ImageStat.Stat(ImageChops.difference(image, reference)).mean[0]
        return data if difference < 15 else None
    except (OSError, ValueError, RuntimeError, IndexError):
        return None


def select_figures(knowledge, corpus, visible_docs: list[dict], markdown: str, limit: int = 4,
                   require_relevance: bool = True) -> list[dict]:
    """Select captioned, PDF-matched single figures only from model-input documents."""
    manifest = {entry["doc_id"]: entry for entry in knowledge.files().values()
                if entry["status"] == "indexed" and entry["doc_id"]}
    versions = {doc["doc_id"]: doc["version"] for doc in knowledge.all()}
    ranked = []
    body = markdown.split("## 来源附录（系统记录）", 1)[0]
    for source in visible_docs:
        entry = manifest.get(source["doc_id"])
        if not entry or source["version"] != versions.get(source["doc_id"]):
            continue
        pdf_path = (corpus.source_dir / entry["rel_path"]).resolve()
        parsed_dir = (corpus.root / "parsed" / entry["rel_path"]).resolve()
        if (pdf_path.suffix.lower() != ".pdf" or not pdf_path.is_relative_to(corpus.source_dir.resolve())
                or not parsed_dir.is_relative_to((corpus.root / "parsed").resolve())
                or not pdf_path.is_file() or sha256_file(pdf_path) != entry["sha256"]):
            continue
        middle = parsed_dir / "middle_json.json"
        if not middle.is_file():
            continue
        try:
            pages = json.loads(middle.read_text(encoding="utf-8"))["pages"]
        except (OSError, ValueError, KeyError, TypeError):
            continue
        for page in pages:
            if not isinstance(page, dict):
                continue
            page_idx = page.get("page_idx")
            if not isinstance(page_idx, int) or page_idx < 1:
                continue  # Cover logos and signatures are unsafe automatic report figures.
            blocks = page.get("blocks", [])
            if not isinstance(blocks, list):
                continue
            for block_index_in_page, block in enumerate(blocks):
                if not isinstance(block, dict):
                    continue
                if block.get("type") not in {"chart", "image"}:
                    continue
                bbox, caption = block.get("bbox"), _caption(block)
                if (not isinstance(bbox, list) or len(bbox) != 4 or
                        not all(isinstance(v, (int, float)) and 0 <= v <= 1 for v in bbox) or
                        not bbox[0] < bbox[2] or not bbox[1] < bbox[3] or
                        not re.match(r"^图\s*\d", caption) or len(caption) > 280 or
                        any(word in caption.lower() for word in ("表格", "表单", "申请表", "签名", "签章", "印章", "徽标", "logo"))):
                    continue
                # Shared captions on adjacent panels cannot safely label one cached image.
                if any(isinstance(other, dict) and other is not block and other.get("type") in {"chart", "image"} and
                       isinstance(other.get("bbox"), list) and _same_row(bbox, other["bbox"])
                       for other in blocks):
                    continue
                paths = _image_paths(block)
                if len(paths) != 1:
                    continue
                image_path = (parsed_dir / paths[0]).resolve()
                if not image_path.is_relative_to(parsed_dir) or image_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                    continue
                terms = set(re.findall(r"[\u4e00-\u9fff]{2}|[a-zA-Z]{3,}", caption.lower()))
                terms -= {"基于", "方法", "模型", "研究", "功能", "系统", "技术", "流程", "结果"}
                relevance = sum(body.lower().count(term) for term in terms)
                if (require_relevance and relevance <= 0) or f"[{source['citation']}]" not in body:
                    continue
                score = relevance
                near_text = " ".join(_block_text(other) for other in blocks[max(0, block_index_in_page - 2):block_index_in_page]
                                     if isinstance(other, dict) and other.get("type") in {"text", "title"})[:300]
                ranked.append((score, source, page_idx, bbox, caption, image_path,
                               entry["sha256"], block.get("index"), near_text))
    selected = []
    for _, source, page_idx, bbox, caption, image_path, pdf_sha, block_index, near_text in sorted(ranked, key=lambda row: -row[0]):
        if len(selected) >= limit:
            break
        data = _verified_image(corpus.source_dir / manifest[source["doc_id"]]["rel_path"],
                               page_idx, bbox, image_path)
        if data is None:
            continue
        digest = hashlib.sha256(data).hexdigest()
        if any(item["figure_id"] == digest[:20] for item in selected):
            continue
        with Image.open(io.BytesIO(data)) as saved_image:
            dimensions = [saved_image.width, saved_image.height]
        selected.append({"figure_id": digest[:20], "sha256": digest, "bytes": data,
                         "media_type": "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg",
                         "caption": caption, "page": page_idx + 1, "bbox": bbox,
                         "corpus_id": corpus.id, "doc_id": source["doc_id"],
                         "doc_version": source["version"], "pdf_sha256": pdf_sha,
                         "citation": source["citation"], "block_index": block_index,
                         "near_text": near_text, "dimensions": dimensions, "verification": "pdf_pixel_match"})
    return selected


def insert_figures(markdown: str, figures: list[dict]) -> str:
    """Place a figure after a cited claim from its own source document."""
    lines = markdown.splitlines()
    end = next((i for i, line in enumerate(lines) if line.startswith("## 来源附录（系统记录）")), len(lines))
    insertions: dict[int, list[str]] = {}
    kept = []
    for figure in figures:
        caption = figure["caption"]
        terms = set(re.findall(r"[\u4e00-\u9fff]{2}|[a-zA-Z]{3,}", caption.lower()))
        terms -= {"基于", "方法", "模型", "研究", "功能", "系统", "技术", "流程", "结果"}
        matches = [(sum(line.lower().count(term) for term in terms), index)
                   for index, line in enumerate(lines[:end])
                   if f"[{figure['citation']}]" in line and not line.startswith("#")]
        matches = [match for match in matches if match[0] > 0]
        if not matches:
            continue
        _, index = max(matches)
        insertions.setdefault(index, []).extend(["", *figure_markdown(figure).splitlines(), ""])
        kept.append(figure)
    output = []
    for index, line in enumerate(lines):
        output.append(line)
        output.extend(insertions.get(index, []))
    return "\n".join(output).rstrip() + "\n" if kept else markdown


def figure_markdown(figure: dict) -> str:
    extension = "png" if figure["media_type"] == "image/png" else "jpg"
    alt = figure["caption"].replace("\\", "\\\\").replace("]", "\\]")
    return (f"![{alt}](figures/{figure['figure_id']}.{extension})\n\n"
            f"{figure['caption']}（原 PDF 第 {figure['page']} 页，来源 [{figure['citation']}]）")


def change_figure(markdown: str, old: dict, replacement: dict | None = None) -> str:
    old_block = figure_markdown(old)
    if markdown.count(old_block) != 1:
        raise ValueError("当前成果图片位置已改变，请在正文编辑器中调整")
    return markdown.replace(old_block, figure_markdown(replacement) if replacement else "", 1)
