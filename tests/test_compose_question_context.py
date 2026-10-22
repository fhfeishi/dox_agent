"""生成问题要用上已有的信息（query 2026-1021 1619）。

输入框里已输入的文字是问题的核心；只点了很少的关键词、也没输入时，可以借用资料库自己的场景 /
未解决问题 / 技术体系名称补出一个专业角度；再次生成要换角度，所选关键词与时间仍须全部保留。
"""

import asyncio
import json
from types import SimpleNamespace

from src import compose_question as cq


def test_typed_text_leads_and_full_selection_adds_no_angle():
    # Given text in the input box and a full selection
    lines = cq.prompt_lines("精准问答", ["关键技术", "成果"], ["有哪些代表性项目"], ["AI与医疗"],
                            note="癫痫脑电自动识别")
    # Then the typed text is passed as the core, and the model is told not to add angles
    assert lines[2] == "使用者已输入：癫痫脑电自动识别"
    assert "选择情况：充分，不补充角度" in lines


def test_thin_selection_without_text_may_add_an_angle_from_the_library():
    vocabulary = {"场景": ["智能诊断", "影像分析"], "技术体系": ["深度学习"]}
    lines = cq.prompt_lines("精准问答", ["关键技术"], ["已经实现了哪些工作"], ["AI与医疗"], vocabulary=vocabulary)
    assert "选择情况：较少，可补充一个角度" in lines
    assert "资料库中的场景：智能诊断、影像分析" in lines
    # Typing anything makes the same picks enough: the user's words, not ours, set the direction
    assert cq.is_sparse(["关键技术"], ["已经实现了哪些工作"], "", "") is True
    assert cq.is_sparse(["关键技术"], ["已经实现了哪些工作"], "", "脑电") is False


def test_each_attempt_draws_other_library_names_reproducibly():
    vocabulary = {"场景": [f"场景{i}" for i in range(12)], "未解决问题": [], "技术体系": ["甲", "乙"]}
    first, second = cq.vocabulary_slice(vocabulary, 0), cq.vocabulary_slice(vocabulary, 1)
    assert first["场景"] == ["场景0", "场景1", "场景2", "场景3"]  # the largest scenes first
    assert second["场景"] != first["场景"]
    assert cq.vocabulary_slice(vocabulary, 1) == second  # same attempt, same draw
    assert "未解决问题" not in first  # nothing to offer, no empty line


def test_library_vocabulary_reads_stored_names_and_skips_solved_problems(tmp_path):
    (tmp_path / "hierarchy.json").write_text(json.dumps({"scenes": [
        {"name": "小场景", "project_ids": ["a"], "issues": [{"name": "已解", "state": "已解决"}]},
        {"name": "大场景", "project_ids": ["a", "b"], "issues": [{"name": "未解", "state": "部分解决"}]},
    ]}), encoding="utf-8")
    (tmp_path / "lineage.json").write_text(json.dumps({"categories": [
        {"name": "深度学习"}, {"name": "未归类", "unplaced": True}]}), encoding="utf-8")
    assert cq.library_vocabulary(tmp_path) == {"场景": ["大场景", "小场景"], "未解决问题": ["未解"], "技术体系": ["深度学习"]}
    # A library with no extraction yet just offers nothing
    assert cq.library_vocabulary(tmp_path / "none") == {"场景": [], "未解决问题": [], "技术体系": []}


def test_earlier_questions_are_listed_so_the_next_one_differs():
    lines = cq.prompt_lines("技术研判", ["技术谱系"], [], ["AI与医疗"], avoid=["问题一", "问题二"])
    assert lines[-2:] == ["已生成过1：问题一", "已生成过2：问题二"]


def test_a_rewritten_year_span_is_put_back():
    assert cq.keep_period("近五年有哪些关键技术？", "2021—2026") == "近五年有哪些关键技术（2021—2026）？"
    assert cq.keep_period("2021—2026 年有哪些关键技术？", "2021—2026") == "2021—2026 年有哪些关键技术？"
    assert cq.keep_period("有哪些关键技术", "2021—2026") == "有哪些关键技术（2021—2026）？"
    assert cq.keep_period("有哪些关键技术？", "") == "有哪些关键技术？"


def test_asking_again_uses_a_warmer_draw(monkeypatch):
    seen = {}

    class Model:
        def __init__(self, temperature=None):
            self.temperature = temperature

        def bind(self, **kwargs):
            return Model(kwargs.get("temperature"))

        async def ainvoke(self, messages):
            seen["temperature"], seen["input"] = self.temperature, messages[1].content
            return SimpleNamespace(content="“近五年有哪些关键技术？”")

    monkeypatch.setattr(cq, "model_for", lambda settings: Model())
    text = asyncio.run(cq.compose(None, "精准问答", ["关键技术"], [], ["AI与医疗"], period="2021—2026", avoid=["旧问题"]))
    assert text == "近五年有哪些关键技术（2021—2026）？"
    assert seen["temperature"] == 0.9 and "已生成过1：旧问题" in seen["input"]
    asyncio.run(cq.compose(None, "精准问答", ["关键技术"], [], ["AI与医疗"]))
    assert seen["temperature"] is None  # a first attempt keeps the model's usual setting
