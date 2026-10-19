"""REVIEW_* settings work from the project .env as well as from exported variables (F6/Q4)."""

import pytest

from src.agent import config as config_module
from src.agent.config import Settings
from src.review import model_client

REVIEW_VARS = (
    "REVIEW_MODEL_API_KEY",
    "REVIEW_MODEL_BASE_URL",
    "REVIEW_MODEL_NAME",
    "REVIEW_MODEL_TIMEOUT",
    "REVIEW_RUN_TIMEOUT",
    "REVIEW_MAX_CALLS",
    "REVIEW_CHUNK_CHARS",
    "REVIEW_MAX_DOCUMENT_CHARS",
    "REVIEW_MAX_OUTPUT_TOKENS",
)


@pytest.fixture
def env_file(tmp_path, monkeypatch):
    """Point the review client at a throwaway .env; never touches the real one."""
    for name in REVIEW_VARS + ("MODEL_API_KEY", "MODEL_BASE_URL", "MODEL_NAME"):
        monkeypatch.delenv(name, raising=False)
    path = tmp_path / ".env"

    def use(text: str):
        path.write_text(text, encoding="utf-8")
        settings = Settings(_env_file=path)
        monkeypatch.setattr(model_client, "get_settings", lambda: settings)
        return settings

    return use


def test_env_file_only_review_values_are_read(env_file):
    settings = env_file(
        "MODEL_API_KEY=main-key\nREVIEW_MAX_CALLS=7\nREVIEW_RUN_TIMEOUT=600\nREVIEW_MODEL_NAME=review-model\n"
        "REVIEW_MODEL_BASE_URL=https://review.test/v1/\nREVIEW_MODEL_API_KEY=review-key\n"
    )
    c = model_client.config()
    assert c["max_calls"] == 7 and c["deadline"] == 600
    assert c["model"] == "review-model" and c["base"] == "https://review.test/v1" and c["key"] == "review-key"
    assert "review-key" not in repr(settings)  # stays a SecretStr


def test_exported_variable_overrides_env_file(env_file, monkeypatch):
    env_file("REVIEW_MAX_CALLS=7\nREVIEW_MODEL_NAME=from-file\n")
    monkeypatch.setenv("REVIEW_MAX_CALLS", "9")
    monkeypatch.setenv("REVIEW_MODEL_NAME", "from-shell")
    c = model_client.config()
    assert c["max_calls"] == 9 and c["model"] == "from-shell"


def test_invalid_or_out_of_range_values_still_fall_back_or_clamp(env_file):
    env_file("REVIEW_MAX_CALLS=lots\nREVIEW_RUN_TIMEOUT=99999\nREVIEW_CHUNK_CHARS=\n")
    c = model_client.config()
    assert c["max_calls"] == 32 and c["deadline"] == 1800 and c["chunk"] == 12000


def test_unset_review_values_reuse_main_model(env_file):
    env_file("MODEL_API_KEY=main-key\nMODEL_NAME=main-model\n")
    c = model_client.config()
    assert c["key"] == "main-key" and c["model"] == "main-model" and c["max_calls"] == 32


def test_model_info_reports_review_override_from_env_file(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from src.knowledge import Knowledge
    from src.main import create_app

    for name in REVIEW_VARS:
        monkeypatch.delenv(name, raising=False)
    (tmp_path / ".env").write_text("REVIEW_MODEL_NAME=review-model\n", encoding="utf-8")
    settings = Settings(
        _env_file=tmp_path / ".env", corpora_root=tmp_path / "knowledge", state_dir=tmp_path / "state"
    )
    (tmp_path / "knowledge").mkdir()
    with TestClient(create_app(settings, Knowledge(tmp_path / "db"))) as client:
        assert client.get("/api/model").json()["review_override"] == {"REVIEW_MODEL_NAME": "review-model"}


def test_parent_directory_env_file_is_opt_in(tmp_path, monkeypatch):
    monkeypatch.delenv("DOX_ENV_FILE", raising=False)
    assert config_module.env_files() == (config_module.DOX_AGENT_ROOT / ".env",)
    extra = tmp_path / "shared.env"
    monkeypatch.setenv("DOX_ENV_FILE", str(extra))
    assert config_module.env_files() == (extra, config_module.DOX_AGENT_ROOT / ".env")
