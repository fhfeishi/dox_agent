import pytest

from src.prompts import UnknownTaskError, list_tasks, task_prompt


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
