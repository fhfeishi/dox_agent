"""Startup checks and dependency installation, using only the standard library."""

import hashlib
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path


def code_version(root: Path) -> str:
    """Hash of the backend sources; a running service reports the one it started with."""
    digest = hashlib.sha256()
    for path in sorted((root / "src").rglob("*.py")):
        digest.update(path.relative_to(root).as_posix().encode() + b"\0" + path.read_bytes())
    return digest.hexdigest()[:12]


def service_url(host: str, port: int) -> str:
    return f"http://{'127.0.0.1' if host in ('0.0.0.0', '') else host}:{port}/"


def _listening(host: str, port: int) -> bool:
    """Whether something accepts connections on the port (a bind can fail on leftovers alone)."""
    try:
        with socket.create_connection(("127.0.0.1" if host in ("0.0.0.0", "") else host, port), timeout=1):
            return True
    except OSError:
        return False


def check_port(host: str, port: int) -> int:
    try:
        with socket.socket() as listener:
            # After Ctrl+C the stopped service's connections linger in TIME_WAIT for about a minute;
            # uvicorn binds with SO_REUSEADDR, so the check does too (query 2026-1014 1703). On Windows
            # the flag would allow taking a port that is really in use, and TIME_WAIT does not block.
            if os.name != "nt":
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind((host, port))
        return 0
    except OSError:
        if not _listening(host, port):
            return 0  # nothing answers: only connections of a stopped service are left
        url = f"http://{'127.0.0.1' if host == '0.0.0.0' else host}:{port}"
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(url + "/api/auth/session", timeout=2) as response:
                health = json.load(response)
            if health.get("app_id") == "dox-agent":
                print(f"服务已经运行，无需重复启动：{url}")
                # A service started before the latest code still runs the old backend (the frontend is
                # read from frontend/dist on each request, so a rebuild reaches it without a restart).
                if health.get("code_version") != code_version(Path(__file__).resolve().parents[1]):
                    print("注意：正在运行的服务是旧版本的后端代码。请关闭原服务窗口（或结束其进程）后重新运行启动脚本。")
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


def model_check() -> int:
    """One real request to the configured model, always direct (never the system proxy)."""
    sys.path.insert(0, str(Path.cwd()))
    import ipaddress
    import socket
    from urllib.parse import urlparse

    from src.agent.config import get_settings
    from src.agent.models import check_model

    settings = get_settings()
    print(f"模型：{settings.model_name} @ {settings.model_base_url}（直连，不使用系统代理）")
    result = check_model(settings, source="launcher")
    if result.get("ok"):
        print(f"模型连接正常（{result.get('latency_ms')} ms）")
        return 0
    # Everything on stdout, so the lines stay in order in the terminal.
    print(f"模型连接失败：{result.get('error')}")
    host = urlparse(settings.model_base_url).hostname or ""
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)}
    except OSError:
        addresses = set()
    # 198.18.0.0/15 is what Clash/mihomo-style proxy tools hand out as fake-ip DNS answers: a direct
    # connection to it cannot leave the machine, so the fix is in that tool, not in this program.
    fake = sorted(a for a in addresses if ipaddress.ip_address(a) in ipaddress.ip_network("198.18.0.0/15"))
    if fake:
        print(f"{host} 被解析到 {fake[0]}：这是代理软件的 fake-ip 地址，直连无法到达。"
              f"请在代理软件中把 {host} 设为 DIRECT 并加入 fake-ip-filter（或关闭其 DNS 接管）后重启。")
    else:
        print("请检查本机网络、防火墙与 MODEL_BASE_URL。")
    return 1


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


def open_when_ready(url: str, timeout: float = 180) -> bool:
    """Wait until the service answers, then open the page in the default browser.

    Under WSL the Windows browser is opened through cmd.exe; elsewhere Python's webbrowser picks the
    platform's default (os.startfile on Windows, xdg-open or open on Linux and macOS).
    """
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with opener.open(url + "api/auth/session", timeout=2):
                break
        except urllib.error.HTTPError:
            break  # it answered: the service is up
        except OSError:
            time.sleep(1)
    else:
        print(f"服务在 {int(timeout)} 秒内未就绪，请稍后手动打开 {url}", file=sys.stderr)
        return False
    try:
        wsl = "microsoft" in Path("/proc/version").read_text().lower()
    except OSError:
        wsl = False
    if wsl:
        for command in (["wslview", url], ["cmd.exe", "/c", "start", "", url], ["explorer.exe", url]):
            try:
                # cmd.exe warns about a Linux working directory; run it from the Windows drive.
                subprocess.run(command, cwd="/mnt/c" if Path("/mnt/c").is_dir() else None,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
                return True
            except (OSError, subprocess.SubprocessError):
                continue
    if webbrowser.open(url):
        return True
    print(f"未能自动打开浏览器，请手动访问 {url}", file=sys.stderr)
    return False


def serve(host: str, port: int, app: str = "src.main:app") -> int:
    """Run the service until Ctrl+C, then leave at once.

    Reviews, metadata extraction and reports run in worker threads. Python's exit waits for every
    running one, so after Ctrl+C the console stayed blocked for minutes (query: Windows launch.cmd
    could not be stopped). Requests still open get at most 5 s; unfinished background jobs are
    marked interrupted when the service next starts.
    """
    import logging

    import uvicorn

    sys.path.insert(0, str(Path.cwd()))  # src.main is imported from the project root
    server = uvicorn.Server(uvicorn.Config(app, host=host, port=port, loop="asyncio", timeout_graceful_shutdown=5))
    try:
        server.run()
    except KeyboardInterrupt:
        pass  # uvicorn re-raises the Ctrl+C it handled
    logging.shutdown()
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0 if server.started else 1)


if __name__ == "__main__":
    if sys.argv[1] == "serve":
        serve(os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", "8000")))
    if sys.argv[1] == "open":
        url = service_url(os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", "8000")))
        raise SystemExit(0 if os.environ.get("OPEN_BROWSER") == "0" or open_when_ready(url) else 1)
    if sys.argv[1] == "frontend":
        raise SystemExit(frontend(Path.cwd() / "frontend", sys.argv[2]))
    if sys.argv[1] == "model":
        raise SystemExit(model_check())
    if sys.argv[1] == "check":
        raise SystemExit(check_port(os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", "8000"))))
    install(Path.cwd(), sys.argv[1])
