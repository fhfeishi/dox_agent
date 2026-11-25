"""The model catalogue and each account's choice (2026-11-25).

No network: the catalogue is a static table and the choice is a file. What these tests protect is
that nothing outside the table can become a request — an account picks *which* model answers, never
where the request goes or with whose credential.
"""

import json

import pytest

from src import model_choice
from src.agent import providers


def test_the_catalogue_resolves_a_known_pair_and_refuses_an_unknown_one():
    assert providers.resolve("dashscope", "qwen3.8-27b")[1].name == "qwen3.8-27b"
    # A name that is not in the table resolves to None rather than quietly becoming a neighbour:
    # someone who picked a model that does not exist must not silently get a different one.
    # ``qwen3-27b`` is the near miss that actually failed against the provider (it serves
    # ``qwen3.8-27b``), so it is the case worth pinning.
    assert providers.resolve("dashscope", "qwen3-27b") is None
    assert providers.resolve("nowhere", "qwen3.8-27b") is None


def test_an_unset_model_means_the_providers_first_entry():
    assert providers.resolve("dashscope", None)[1].name == providers.provider("dashscope").models[0].name
    assert providers.resolve(None, None)[0].id == providers.DEFAULT_PROVIDER


def test_every_catalogue_model_reports_a_verified_window():
    """The ring's denominator must be a real number or absent — never guessed. Every entry here was
    checked against the provider's release notes; a model added without one keeps ``None``."""
    for provider in providers.PROVIDERS:
        for model in provider.models:
            assert model.context is None or model.context > 0


def test_the_catalogue_carries_no_credential_and_no_per_request_endpoint():
    """The whole allow-list is code: no field may be settable from a request."""
    for provider in providers.PROVIDERS:
        assert provider.key_env.endswith("_API_KEY")
        assert provider.base_url.startswith("https://")
        assert "@" not in provider.base_url  # no user:pass in the URL


def test_a_choice_round_trips_and_isolated_per_account(tmp_path):
    assert model_choice.current(tmp_path, "alice") == ("deepseek", "deepseek-v4-flash")
    assert model_choice.write(tmp_path, "alice", "dashscope", "qwen3.8-27b") == ("dashscope", "qwen3.8-27b")
    assert model_choice.current(tmp_path, "alice") == ("dashscope", "qwen3.8-27b")
    assert model_choice.current(tmp_path, "bob") == ("deepseek", "deepseek-v4-flash")


@pytest.mark.parametrize("provider,model", [
    ("dashscope", "qwen3-27b"),   # the hosted names carry a minor version: qwen3.8-27b
    ("deepseek", "gpt-4"),
    ("nope", "x"),
])
def test_a_choice_outside_the_catalogue_is_refused(tmp_path, provider, model):
    with pytest.raises(ValueError, match="目录里没有这个模型"):
        model_choice.write(tmp_path, "alice", provider, model)
    # Nothing was written: the account keeps its previous choice.
    assert model_choice.current(tmp_path, "alice") == ("deepseek", "deepseek-v4-flash")


def test_a_choice_whose_catalogue_entry_was_removed_falls_back_instead_of_failing(tmp_path):
    """A stored pair can outlive a catalogue edit. The account then gets the default — an error on
    every request would be worse than a fallback nobody asked for."""
    path = tmp_path / "model_choice" / "alice.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"provider": "retired", "model": "old"}), encoding="utf-8")
    assert model_choice.read(tmp_path, "alice") is None
    assert model_choice.current(tmp_path, "alice") == ("deepseek", "deepseek-v4-flash")


def test_one_account_cannot_reach_another_or_escape_its_directory(tmp_path):
    with pytest.raises(ValueError, match="目录名"):
        model_choice.read(tmp_path, "../etc")
