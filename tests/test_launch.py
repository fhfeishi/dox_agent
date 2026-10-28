import os
import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.mark.parametrize("mode", ["active", "explicit", "new"])
def test_launch_selects_environment_with_uv(tmp_path, mode):
    bash = str(Path(shutil.which("git")).resolve().parents[1] / "bin/bash.exe") if os.name == "nt" else "bash"

    def shell_path(path):
        if os.name != "nt":
            return path.as_posix()
        return subprocess.run([bash, "-c", 'cygpath -u "$1"', "--", str(path)],
                              check=True, capture_output=True, text=True).stdout.strip()

    project = tmp_path / "project"
    project.mkdir()
    shutil.copyfile(Path(__file__).parents[1] / "launch.sh", project / "launch.sh")
    # The fake python answers every launcher.py call with exit 0, so `frontend check` reports an
    # up-to-date build and no npm command runs.
    commands = tmp_path / "commands"
    commands.mkdir()
    log = tmp_path / "calls"
    fake_python = tmp_path / "fake-python"
    fake_python.write_text('#!/bin/bash\nif [[ "$*" == *embedding_path* ]]; then echo 0; fi\nif [[ "$*" == "src/launcher.py web" ]]; then uv pip install --python "$0" -e ".[web]"; fi\n', newline='\n')
    fake_python.chmod(0o755)
    uv = commands / "uv"
    uv.write_text('#!/bin/bash\nprintf "%s\\n" "$*" >> "$CALL_LOG"\nif [[ "$1" == venv ]]; then mkdir -p "${@: -1}/bin"; cp "$FAKE_PYTHON" "${@: -1}/bin/python"; fi\n', newline='\n')
    uv.chmod(0o755)
    env = {**os.environ, "PATH": str(commands) + os.pathsep + os.environ["PATH"], "CALL_LOG": shell_path(log), "FAKE_PYTHON": shell_path(fake_python), "OPEN_BROWSER": "0"}
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
            env["VIRTUAL_ENV"] = shell_path(selected)
        else:
            env["DOX_AGENT_VENV"] = shell_path(selected)
    subprocess.run([bash, shell_path(project / "launch.sh")], env=env, check=True, capture_output=True)
    calls = log.read_text()
    assert f"pip install --python {shell_path(selected)}/bin/python" in calls
    assert ("venv --seed --python=3.12" in calls) == (mode == "new")
