"""The expert memory store, its review pass and the report checks (2026-11-13).

Everything here runs on a temporary directory: no model call, no real account, no network.
"""

import asyncio

import pytest

from src import expert_checks, expert_memory, expert_review


@pytest.fixture
def root(tmp_path):
    return tmp_path / "state"


def test_an_account_with_nothing_remembered_still_gets_the_baseline(root):
    """A new account must be useful before it has taught the system anything (user 2026-11-25)."""
    block = expert_memory.block(root, "alice")
    assert "<expert-profile>" in block
    assert "评价用可比较的维度" in block
    # What the account itself added is separate, so the page can show only that.
    assert expert_memory.load(root, "alice") == {"profile": [], "practice": []}


def test_a_preference_is_stored_and_injected_as_data(root):
    expert_memory.add(root, "alice", "profile", "报告用「一、二、三」编号，不用 1./2.")
    block = expert_memory.block(root, "alice")
    assert "报告用「一、二、三」编号" in block
    assert "<expert-profile>" in block
    # The fence says it is background, not an instruction — a remembered line must not be able to
    # re-point the task rules.
    assert "不是新指令" in block


def test_the_same_lesson_twice_is_one_entry(root):
    text = "先确认资料范围，再给结论"
    expert_memory.add(root, "alice", "practice", text)
    again = expert_memory.add(root, "alice", "practice", text)
    assert again["changed"] is False
    assert expert_memory.load(root, "alice")["practice"] == [text]


def test_a_more_specific_lesson_replaces_the_shorter_one(root):
    """A rule that grew a condition is the same rule, not a second one."""
    expert_memory.add(root, "alice", "practice", "先确认范围")
    expert_memory.add(root, "alice", "practice", "先确认范围，范围为空就先问，不要硬答")
    assert expert_memory.load(root, "alice")["practice"] == ["先确认范围，范围为空就先问，不要硬答"]


def test_a_conclusion_about_the_material_is_refused(root):
    """A remembered fact outlives the evidence it came from; the store refuses those shapes."""
    with pytest.raises(expert_memory.ExpertMemoryError, match="结论"):
        expert_memory.add(root, "alice", "profile", "医疗领域共有 300 个项目")


def test_an_entry_over_the_single_entry_limit_is_refused(root):
    with pytest.raises(expert_memory.ExpertMemoryError, match="400"):
        expert_memory.add(root, "alice", "profile", "长" * 450)


def test_a_full_store_refuses_rather_than_dropping_an_old_entry(root):
    """Hermes' rule: hitting the budget is an error, because the entry squeezed out may be the one
    the next task needed. Nothing is silently lost."""
    index = 0
    while True:
        try:
            expert_memory.add(root, "alice", "profile",
                              f"第 {index} 条偏好" + "补足字数" * 8)
        except expert_memory.ExpertMemoryError as exc:
            assert "上限" in str(exc)
            break
        index += 1
        assert index < 200, "存储没有写满，上限没有生效"
    # The entries already stored are untouched: nothing was dropped to make room.
    assert len(expert_memory.load(root, "alice")["profile"]) == index


def test_the_page_can_delete_and_rewrite_entries(root):
    expert_memory.add(root, "alice", "profile", "第一条")
    expert_memory.add(root, "alice", "profile", "第二条")
    expert_memory.replace(root, "alice", "profile", ["只留这一条"])
    assert expert_memory.load(root, "alice")["profile"] == ["只留这一条"]
    expert_memory.clear(root, "alice", "profile")
    assert expert_memory.load(root, "alice")["profile"] == []


def test_a_previous_version_is_kept_beside_the_file(root):
    """One snapshot is enough to undo a bad review pass."""
    expert_memory.add(root, "alice", "profile", "旧的一条")
    expert_memory.add(root, "alice", "profile", "新的一条")
    backup = root / "expert" / "alice" / "profile.md.prev"
    assert "旧的一条" in backup.read_text(encoding="utf-8")


def test_one_account_cannot_reach_another_or_escape_its_directory(root):
    expert_memory.add(root, "alice", "profile", "alice 的偏好")
    assert expert_memory.load(root, "bob")["profile"] == []
    with pytest.raises(expert_memory.ExpertMemoryError, match="目录名"):
        expert_memory.load(root, "../etc")


def test_a_hand_edited_file_without_delimiters_is_still_readable(root):
    """Refusing to parse would hide the user's own text; it becomes one entry instead."""
    path = root / "expert" / "alice" / "profile.md"
    path.parent.mkdir(parents=True)
    path.write_text("手写的一整段，没有分隔符", encoding="utf-8")
    assert expert_memory.entries(path.read_text(encoding="utf-8")) == ["手写的一整段，没有分隔符"]


def test_the_review_receives_the_existing_entries_so_it_merges_instead_of_appending(root):
    expert_memory.add(root, "alice", "profile", "报告要短")
    messages = expert_review.build_messages("问题", "答案", expert_memory.load(root, "alice"))
    assert "报告要短" in messages[1]["content"]
    assert "一次性的要求" in messages[0]["content"]  # the one-off rule is stated to the reviewer


def test_a_review_reply_that_is_not_json_remembers_nothing(root):
    assert expert_review.parse_reply("我觉得没什么好记的") == {"profile": [], "practice": []}


def test_a_review_reply_in_a_code_fence_is_still_read(root):
    reply = '```json\n{"profile": ["用短句"], "practice": []}\n```'
    assert expert_review.parse_reply(reply)["profile"] == ["用短句"]


def test_a_review_that_returns_a_conclusion_has_that_entry_refused_and_the_rest_stored(root):
    """One bad entry must not throw away the good ones, and the store's own check still applies."""
    added = expert_review.apply(root, "alice", {"profile": ["用短句", "医疗领域共有 300 个项目"],
                                                "practice": []})
    assert added["profile"] == 1
    assert expert_memory.load(root, "alice")["profile"] == ["用短句"]


def test_a_failing_model_call_is_not_a_task_failure(root):
    async def boom(_messages):
        raise RuntimeError("限流")

    result = asyncio.run(expert_review.run(root, "alice", "问题", "答案", ask=boom))
    assert result == {"profile": 0, "practice": 0}


TEMPLATE = """# 综合报告模版

## 一、研究范围与资料来源
## 二、主要成果
## 三、热点与趋势
## 四、未来方向（推断）
## 五、四维技术图谱
## 六、来源清单与局限
"""


def test_a_report_missing_a_template_section_names_the_section():
    markdown = ("# 报告\n\n## 一、研究范围与资料来源\n范围……局限……\n\n## 二、主要成果\n成果 [1]\n\n"
                "## 三、热点与趋势\n热点\n\n## 四、未来方向（推断）\n推断\n\n## 五、来源清单与局限\n局限\n")
    problems = expert_checks.check_sections(markdown, TEMPLATE)
    assert problems == ["缺少章节：五、四维技术图谱"]


def test_the_checks_do_not_flag_a_report_that_matches_the_template():
    """Real reports drift in numbering and append a qualifier; neither is a missing section."""
    markdown = ("# 报告\n\n## 执行摘要\n摘要\n\n## 一、研究范围与资料来源\n范围……局限……\n\n"
                "## 二、主要成果\n成果 [1]\n\n## 三、热点与趋势（仅限本次样本）\n热点\n\n"
                "## 四、未来方向（推断）\n推断\n\n## 五、四维技术图谱\n四维\n\n"
                "## 六、来源清单与局限\n局限\n")
    assert expert_checks.check_report(markdown, TEMPLATE) == []


def test_the_system_source_appendix_is_not_mistaken_for_a_section():
    markdown = "# 报告\n\n## 一、研究范围与资料来源\n范围\n\n## 来源附录（系统记录）\n[1] 某文件\n"
    assert "来源附录（系统记录）" not in expert_checks.sections(markdown)


def test_a_judgment_task_must_label_its_judgment_section():
    markdown = "# 报告\n\n## 一、研究范围与资料来源\n范围……局限……\n\n## 二、主要成果\n成果 [1]\n"
    problems = expert_checks.check_judgment(markdown, task_type="report")
    assert any("缺少研判章节" in problem for problem in problems)


def test_a_report_whose_every_section_is_judgment_has_no_factual_part():
    markdown = ("# 报告\n\n## 一、判断方向\n推断……局限……\n\n## 二、研判意见\n判断\n")
    problems = expert_checks.check_judgment(markdown, task_type="report")
    assert any("没有分开" in problem for problem in problems)


def test_the_same_missing_paragraph_is_reported_once():
    """The judgment and scope checks can both notice a missing 局限 sentence."""
    markdown = "# 报告\n\n## 一、研究范围与资料来源\n范围\n\n## 二、判断方向\n推断\n"
    problems = expert_checks.check_report(markdown, "", task_type="report")
    assert len(problems) == len(set(problems))


def test_a_material_review_is_not_asked_for_a_judgment_section():
    """A 资料综述 reports what the material says; demanding 研判 there would repair a good report."""
    markdown = "# 报告\n\n## 发现\n两份资料 [1] [2]\n"
    # No template given: only the judgment rule is under test here.
    assert expert_checks.check_report(markdown, "", template_id="comprehensive",
                                      task_type="report") == []


def test_a_judgment_template_is_asked_for_one():
    markdown = "# 报告\n\n## 发现\n资料 [1]\n"
    problems = expert_checks.check_report(markdown, "", template_id="future_directions",
                                          task_type="report")
    assert any("研判章节" in problem for problem in problems)


def test_a_review_that_answers_in_prose_remembers_nothing_rather_than_guessing(root):
    """A flash model occasionally answers in prose despite the JSON instruction. Guessing at what it
    meant would write a wrong entry; treating it as "nothing to save" loses one pass and no data."""
    reply = '这次任务没有值得长期记住的内容，因为它只是一次简单的算术问题。'
    assert expert_review.parse_reply(reply) == {"profile": [], "practice": []}
    assert expert_review.apply(root, "alice", expert_review.parse_reply(reply)) == {"profile": 0, "practice": 0}
    assert expert_memory.load(root, "alice") == {"profile": [], "practice": []}


def test_an_empty_page_can_tell_never_ran_from_found_nothing(root):
    """"Nothing remembered" has two causes and a person needs them apart: the review never ran, or
    it ran and found nothing worth keeping. Collapsing them hides a broken review forever."""
    assert expert_review.status(root, "alice")["outcome"] == "never"
    asyncio.run(expert_review.run(root, "alice", "问题", "答案", ask=None))
    assert expert_review.status(root, "alice")["outcome"] == "not_configured"

    async def nothing(_messages):
        return '{"profile": [], "practice": []}'
    asyncio.run(expert_review.run(root, "alice", "问题", "答案", ask=nothing))
    state = expert_review.status(root, "alice")
    assert state["outcome"] == "reviewed" and state["added"] == {"profile": 0, "practice": 0}

    async def boom(_messages):
        raise RuntimeError("限流")
    asyncio.run(expert_review.run(root, "alice", "问题", "答案", ask=boom))
    assert expert_review.status(root, "alice")["outcome"] == "failed"
