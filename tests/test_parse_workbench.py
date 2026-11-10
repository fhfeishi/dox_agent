"""Parse workbench assets (2026-1109 1113): image names and figure captions."""

from src.api.ingest_workbench import IMAGE_NAME, _attach_captions


def test_mineru_image_names_are_servable():
    for name in ("page_0_image_2.jpg", "page_5_table_2.jpg", "page_11_chart_3.png",
                 "page_4_equation_1.jpg", "page_27_table_image_6_1.webp"):
        assert IMAGE_NAME.match(name), name
    for name in ("../page_1_image_1.jpg", "page_1_image_1.svg", "notes.txt", "page_x_image_1.jpg"):
        assert not IMAGE_NAME.match(name), name


def test_caption_is_attached_to_the_nearest_figure():
    blocks = [
        {"id": "p0-b0", "type": "text", "bbox": [0.1, 0.05, 0.9, 0.1], "text": "正文"},
        {"id": "p0-b1", "type": "image", "bbox": [0.1, 0.15, 0.9, 0.4], "text": ""},
        {"id": "p0-b2", "type": "text", "bbox": [0.1, 0.41, 0.9, 0.45], "text": "图 1 系统架构"},
        {"id": "p0-b3", "type": "image", "bbox": [0.1, 0.55, 0.9, 0.7], "text": ""},
        {"id": "p0-b4", "type": "text", "bbox": [0.1, 0.72, 0.9, 0.78], "text": "正文第二段"},
    ]
    _attach_captions(blocks)
    assert blocks[1]["caption"] == "图 1 系统架构"
    assert blocks[2]["attached_to"] == "p0-b1"
    assert "caption" not in blocks[3]
    assert blocks[4].get("attached_to") is None
