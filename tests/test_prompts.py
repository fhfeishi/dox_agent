import pytest

from src.prompts import REPORT_TEMPLATES, UnknownTaskError, list_tasks, report_template, task_prompt


def test_list_tasks_exposes_output_hint_for_every_task():
    tasks = list_tasks()
    assert [task["id"] for task in tasks] == ["task1", "task2", "task3", "task4"]
    # The task card / composer rely on output_hint to describe the output contract.
    assert all(task["output_hint"] for task in tasks)


def test_task_prompt_includes_output_contract_and_known_ids():
    assert "精准问答" in task_prompt("task1")
    assert "对比维度表" in task_prompt("task2")
    assert "事实基础" in task_prompt("task3")
    assert "专项报告" in task_prompt("task4")


def test_unknown_task_prompt_raises():
    with pytest.raises(UnknownTaskError):
        task_prompt("task9")


def test_report_templates_are_loaded_from_the_single_authority():
    # Given the registered report templates
    # When each template is loaded
    # Then it has section content, and unknown ids raise
    assert all(report_template(template_id) for template_id in REPORT_TEMPLATES)
    with pytest.raises(UnknownTaskError):
        report_template("nope")


def test_tasks_declare_artifacts_and_templates():
    tasks = {task["id"]: task for task in list_tasks()}
    assert tasks["task1"]["artifacts"] == {"default": "text", "allowed": ["text"]}
    assert tasks["task2"]["artifacts"]["allowed"] == ["text", "table"]
    assert tasks["task4"]["artifacts"]["default"] == "document"
    assert tasks["task4"]["templates"] == list(REPORT_TEMPLATES)
    assert tasks["task4"]["has_template"] is True
    assert tasks["task1"]["templates"] == [] and tasks["task1"]["has_template"] is False
