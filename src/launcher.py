"""Startup checks and dependency installation, using only the standard library."""

import hashlib
import json
import os
import socket
import subprocess
import sys
import urllib.request
from pathlib import Path


def check_port(host: str, port: int) -> int:
    try:
        with socket.socket() as listener:
            listener.bind((host, port))
        return 0
    except OSError:
        url = f"http://{'127.0.0.1' if host == '0.0.0.0' else host}:{port}"
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(url + "/api/health", timeout=2) as response:
                health = json.load(response)
            if health.get("app_id") == "dox-agent":
                print(f"服务已经运行，无需重复启动：{url}（{health.get('preparation', 'unknown')}）")
                return 10
        except (OSError, ValueError):
            pass
        print(f"端口 {port} 已被占用，未启动新服务。请停止原服务或用 PORT=其他端口 bash launch.sh。", file=sys.stderr)
        return 1


def install(root: Path, extras: str):
    signature = hashlib.sha256(root.joinpath("pyproject.toml").read_bytes() + str(root).encode() + sys.version.encode() + extras.encode()).hexdigest()
    stamp = Path(sys.prefix) / (".dox-agent-deps-" + extras)
    if os.environ.get("UPDATE_DEPS") != "1" and stamp.exists() and stamp.read_text() == signature:
        print(f"依赖未变化，跳过安装（{extras}）。")
        return
    subprocess.run(["uv", "pip", "install", "--python", sys.executable, "-e", f".[{extras}]"], cwd=root, check=True)
    stamp.write_text(signature)


# Everything the frontend build reads; dist/ is rebuilt only when these change (or REBUILD_FRONTEND=1).
FRONTEND_INPUTS = ("index.html", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json")
FRONTEND_STAMP = "dist/.dox-build"


def frontend_signature(frontend: Path) -> str:
    files = [frontend / name for name in FRONTEND_INPUTS if (frontend / name).is_file()]
    files += sorted(path for path in (frontend / "src").rglob("*") if path.is_file())
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.relative_to(frontend).as_posix().encode() + b"\0" + path.read_bytes() + b"\0")
    return digest.hexdigest()


def frontend(frontend: Path, action: str) -> int:
    """``check``: 0 when dist/ was built from the current sources, 1 when a build is needed. ``stamp``: record a finished build."""
    stamp = frontend / FRONTEND_STAMP
    if action == "stamp":
        stamp.write_text(frontend_signature(frontend))
        return 0
    if os.environ.get("REBUILD_FRONTEND") != "1" and (frontend / "dist/index.html").is_file() \
            and stamp.is_file() and stamp.read_text() == frontend_signature(frontend):
        print("前端源码未变化，跳过构建。")
        return 0
    return 1


if __name__ == "__main__":
    if sys.argv[1] == "frontend":
        raise SystemExit(frontend(Path.cwd() / "frontend", sys.argv[2]))
    if sys.argv[1] == "check":
        raise SystemExit(check_port(os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", "8000"))))
    install(Path.cwd(), sys.argv[1])
