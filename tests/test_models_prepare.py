"""Run the read-only preparation command in an isolated project and home, without models or network."""
import os
import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.mark.skipif(os.name == "nt" or shutil.which("bash") is None,
                    reason="models_prepare.sh requires a POSIX Bash environment")
@pytest.mark.parametrize("fault", [None, "models", "config", "base_dir", "shadow_home"])
def test_models_prepare_check_reports_disk_faults_without_writing(tmp_path, fault):
    root = tmp_path / "project with spaces"
    script = root / "scripts" / "models_prepare.sh"
    script.parent.mkdir(parents=True)
    shutil.copyfile(Path(__file__).resolve().parents[1] / "scripts" / script.name, script)
    models = root / ".models" / "mineru"
    models.mkdir(parents=True)
    if fault != "models":
        (models / "fixture.bin").write_bytes(b"fixture")
    mineru_home = root / ".models" / "mineru-home"
    mineru_home.mkdir()
    if fault != "config":
        base_dir = tmp_path / "absent" if fault == "base_dir" else models
        (mineru_home / "config.yaml").write_text(f"base_dir: {base_dir}\n", encoding="utf-8")
    home = tmp_path / "home"
    home.mkdir()
    if fault == "shadow_home":
        (home / ".mineru").mkdir()
    before = {path.relative_to(tmp_path): (path.read_bytes(), path.stat().st_mtime_ns)
              for path in tmp_path.rglob("*") if path.is_file()}
    result = subprocess.run(["bash", str(script), "--check"], cwd=tmp_path,
                            env={**os.environ, "HOME": str(home), "MINERU_HOME": str(mineru_home)},
                            capture_output=True, text=True, timeout=15)
    assert result.returncode == (0 if fault is None else 1), result.stdout + result.stderr
    assert "结论：" in result.stdout
    assert before == {path.relative_to(tmp_path): (path.read_bytes(), path.stat().st_mtime_ns)
                      for path in tmp_path.rglob("*") if path.is_file()}
