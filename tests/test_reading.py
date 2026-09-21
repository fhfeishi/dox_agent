from src.reading import section_window


def test_oversized_prose_makes_progress_without_fabricating_content():
    result = section_window("x" * 17000 + "\nnext paragraph", 1)
    assert result["text"] and "未展示" in result["text"]
    assert result["truncated"]
    assert result["next_start_line"] == 58
    next_result = section_window("x" * 17000 + "\nnext paragraph", result["next_start_line"])
    assert next_result["text"] == "next paragraph"


def test_code_block_is_complete_and_following_section_is_separate():
    text = "# First\n```python\n" + "print(1)\n" * 80 + "```\n# Second\nother"
    result = section_window(text, 40)
    assert result["text"].count("```") == 2
    assert "# Second" not in result["text"]
    assert not result["truncated"]
