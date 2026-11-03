"""Run the read-only preparation command in an isolated project and home, without models or network."""
import os
import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.mark.skipif(os.name == "nt" or shutil.which("bash") is None,
                    reason="models_prepare.sh requires a POSIX Bash environment")
@pytest.mark.parametrize("fault", [
    None, "models", "config", "base_dir",
    pytest.param("shadow_home", marks=pytest.mark.xfail(strict=False, raises=AssertionError, reason=(
        "An explicit project MINERU_HOME must not be rejected because unused ~/.mineru exists"))),
    *[pytest.param(fault, marks=pytest.mark.xfail(strict=False, raises=AssertionError, reason=(
        "--check must reject an unset, empty, missing or external effective MINERU_HOME")))
      for fault in ("unset_home", "empty_home", "missing_home", "external_home")],
    *[pytest.param(fault, marks=pytest.mark.xfail(strict=False, raises=AssertionError, reason=(
        "--check must validate effective model.base_dir, including YAML nesting and environment overrides")))
      for fault in ("top_level", "external_base_dir", "missing_config_override", "model_override")],
])
def test_models_prepare_check_reports_disk_faults_without_writing(tmp_path, fault):
    root = tmp_path / "project with spaces"
    script = root / "scripts" / "models_prepare.sh"
    script.parent.mkdir(parents=True)
    shutil.copyfile(Path(__file__).resolve().parents[1] / "scripts" / script.name, script)
    models = root / ".models" / "mineru"
    models.mkdir(parents=True)
    external = tmp_path / "external models"
    external.mkdir()
    if fault != "models":
        (models / "fixture.bin").write_bytes(b"fixture")
    mineru_home = root / ".models" / "mineru-home"
    mineru_home.mkdir()
    if fault != "config":
        base_dir = tmp_path / "absent" if fault == "base_dir" else models
        if fault == "external_base_dir":
            base_dir = external
        config = f"base_dir: {base_dir}\n" if fault == "top_level" else f"model:\n  base_dir: {base_dir}\n"
        (mineru_home / "config.yaml").write_text(config, encoding="utf-8")
    home = tmp_path / "home"
    home.mkdir()
    if fault == "shadow_home":
        (home / ".mineru").mkdir()
    env = {key: value for key, value in os.environ.items() if not key.startswith("MINERU_")}
    env.update(HOME=str(home), MINERU_HOME=str(mineru_home))
    if fault == "unset_home":
        env.pop("MINERU_HOME")
    elif fault in ("empty_home", "missing_home", "external_home"):
        env["MINERU_HOME"] = {"empty_home": "", "missing_home": str(tmp_path / "absent home"),
                              "external_home": str(external)}[fault]
    elif fault == "missing_config_override":
        env["MINERU_CONFIG"] = str(tmp_path / "absent.yaml")
    elif fault == "model_override":
        env["MINERU_MODEL_BASE_DIR"] = str(external)
    before = {path.relative_to(tmp_path): (path.read_bytes(), path.stat().st_mtime_ns)
              for path in tmp_path.rglob("*") if path.is_file()}
    result = subprocess.run(["bash", str(script), "--check"], cwd=tmp_path,
                            env=env,
                            capture_output=True, text=True, timeout=15)
    assert before == {path.relative_to(tmp_path): (path.read_bytes(), path.stat().st_mtime_ns)
                      for path in tmp_path.rglob("*") if path.is_file()}
    assert "结论：" in result.stdout
    assert result.returncode == (0 if fault in (None, "shadow_home") else 1), result.stdout + result.stderr
