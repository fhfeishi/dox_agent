import os
import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.mark.parametrize("mode", ["active", "parent", "new"])
def test_launch_selects_environment_with_uv(tmp_path, mode):
    project = tmp_path / "project"
    project.mkdir()
    shutil.copyfile(Path(__file__).parents[1] / "launch.sh", project / "launch.sh")
    (project / "frontend/dist").mkdir(parents=True)
    commands = tmp_path / "commands"
    commands.mkdir()
    log = tmp_path / "calls"
    fake_python = tmp_path / "fake-python"
    fake_python.write_text('#!/bin/bash\nif [[ "$*" == *embedding_path* ]]; then echo 0; fi\nif [[ "$*" == "src/launcher.py web" ]]; then uv pip install --python "$0" -e ".[web]"; fi\n')
    fake_python.chmod(0o755)
    uv = commands / "uv"
    uv.write_text('#!/bin/bash\nprintf "%s\\n" "$*" >> "$CALL_LOG"\nif [[ "$1" == venv ]]; then mkdir -p "${@: -1}/bin"; cp "$FAKE_PYTHON" "${@: -1}/bin/python"; fi\n')
    uv.chmod(0o755)
    env = {**os.environ, "PATH": str(commands) + ":" + os.environ["PATH"], "CALL_LOG": str(log), "FAKE_PYTHON": str(fake_python)}
    env.pop("VIRTUAL_ENV", None)
    env.pop("DOX_AGENT_VENV", None)
    env.pop("REBUILD_FRONTEND", None)
    selected = project / ".venv"
    if mode != "new":
        selected = tmp_path / ("active env" if mode == "active" else ".venv")
        (selected / "bin").mkdir(parents=True)
        shutil.copyfile(fake_python, selected / "bin/python")
        (selected / "bin/python").chmod(0o755)
        if mode == "active":
            env["VIRTUAL_ENV"] = str(selected)
    subprocess.run(["bash", str(project / "launch.sh")], env=env, check=True, capture_output=True)
    calls = log.read_text()
    assert f"pip install --python {selected}/bin/python" in calls
    assert ("venv --seed --python=3.12" in calls) == (mode == "new")
