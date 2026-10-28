import socket
from pathlib import Path

from src import launcher


def test_install_only_when_manifest_changes(tmp_path, monkeypatch):
    root = tmp_path / "app"
    root.mkdir()
    (root / "pyproject.toml").write_text("first")
    monkeypatch.setattr(launcher.sys, "prefix", str(tmp_path))
    monkeypatch.delenv("UPDATE_DEPS", raising=False)
    calls = []
    monkeypatch.setattr(launcher.subprocess, "run", lambda *args, **kwargs: calls.append(args))
    launcher.install(root, "web")
    launcher.install(root, "web")
    assert len(calls) == 1
    (root / "pyproject.toml").write_text("changed")
    launcher.install(root, "web")
    assert len(calls) == 2


def test_foreign_port_is_not_replaced():
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        server.listen()
        assert launcher.check_port("127.0.0.1", server.getsockname()[1]) == 1


def test_frontend_builds_only_when_sources_change(tmp_path, monkeypatch):
    web = tmp_path / "frontend"
    (web / "src").mkdir(parents=True)
    (web / "src/main.tsx").write_text("a")
    (web / "package.json").write_text("{}")
    monkeypatch.delenv("REBUILD_FRONTEND", raising=False)
    assert launcher.frontend(web, "check") == 1  # never built
    (web / "dist").mkdir()
    (web / "dist/index.html").write_text("")
    assert launcher.frontend(web, "check") == 1  # built, but not recorded
    launcher.frontend(web, "stamp")
    assert launcher.frontend(web, "check") == 0
    monkeypatch.setenv("REBUILD_FRONTEND", "1")
    assert launcher.frontend(web, "check") == 1
    monkeypatch.delenv("REBUILD_FRONTEND")
    (web / "src/main.tsx").write_text("b")
    assert launcher.frontend(web, "check") == 1
    launcher.frontend(web, "stamp")
    (web / "dist/index.html").unlink()
    assert launcher.frontend(web, "check") == 1


def test_open_waits_for_the_service_then_opens_the_page(monkeypatch):
    import http.server
    import threading

    server = http.server.HTTPServer(("127.0.0.1", 0), http.server.SimpleHTTPRequestHandler)
    server.RequestHandlerClass.log_message = lambda *args: None
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = launcher.service_url("0.0.0.0", server.server_address[1])
    assert url.startswith("http://127.0.0.1:")
    opened = []
    monkeypatch.setattr(launcher.webbrowser, "open", lambda target: opened.append(target) or True)
    monkeypatch.setattr(launcher.Path, "read_text", lambda self, *a, **k: "Linux version (not WSL)")
    try:
        assert launcher.open_when_ready(url, timeout=5)  # any HTTP answer means the service is up
    finally:
        server.shutdown()
    assert opened == [url]
    assert not launcher.open_when_ready("http://127.0.0.1:9/", timeout=1.5)  # nothing answers: not opened


def test_running_service_with_older_code_is_reported(monkeypatch, capsys):
    import io
    import json

    class Answer(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *args): return False

    class Opener:
        def open(self, url, timeout):
            return Answer(json.dumps({"app_id": "dox-agent", "preparation": "ready", "code_version": "old"}).encode())

    monkeypatch.setattr(launcher.urllib.request, "build_opener", lambda *a: Opener())
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        server.listen()
        assert launcher.check_port("127.0.0.1", server.getsockname()[1]) == 10
    assert "旧版本的后端代码" in capsys.readouterr().out


def test_port_left_by_a_stopped_service_is_free():
    """After Ctrl+C the port can still be bound by leftover connections (query 2026-1014 1703):
    nothing listens there, so the launcher starts instead of reporting the port as taken."""
    with socket.socket() as leftover:
        leftover.bind(("127.0.0.1", 0))  # bound, not listening, like a closed service's connections
        assert launcher.check_port("127.0.0.1", leftover.getsockname()[1]) == 0


def test_serve_stops_without_waiting_for_background_jobs(tmp_path):
    """Ctrl+C must not wait for a running review or report (Windows launch.cmd could not be stopped)."""
    import signal
    import subprocess
    import sys
    import time
    import urllib.request

    (tmp_path / "jobapp.py").write_text(
        "import time\nfrom concurrent.futures import ThreadPoolExecutor\nfrom fastapi import FastAPI\n"
        "executor = ThreadPoolExecutor(max_workers=1)\napp = FastAPI()\n"
        "@app.post('/job')\ndef job():\n    executor.submit(time.sleep, 30)\n    return {}\n")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    launcher_dir = Path(__file__).resolve().parents[1] / "src"
    code = f"import sys; sys.path.insert(0, {str(launcher_dir)!r}); import launcher; launcher.serve('127.0.0.1', {port}, 'jobapp:app')"
    process = subprocess.Popen([sys.executable, "-c", code], cwd=tmp_path, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        for _ in range(100):
            try:
                opener.open(urllib.request.Request(f"http://127.0.0.1:{port}/job", method="POST"), timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        else:
            raise AssertionError("service did not start")
        started = time.monotonic()
        process.send_signal(signal.CTRL_BREAK_EVENT if sys.platform == "win32" else signal.SIGINT)
        assert process.wait(timeout=10) == 0
        assert time.monotonic() - started < 5
    finally:
        if process.poll() is None:
            process.kill()


def test_the_served_app_exists():
    # launch.sh / launch.cmd serve "src.main:app" (launcher.serve). Every other test builds its own app
    # with create_app, so losing the module-level app went unnoticed (B2 split, 2026-10-20). Read, not
    # imported: importing would build the app from the real settings and touch the real account store.
    import ast
    import inspect

    module, _, name = inspect.signature(launcher.serve).parameters["app"].default.partition(":")
    tree = ast.parse((Path(__file__).resolve().parents[1] / (module.replace(".", "/") + ".py")).read_text(encoding="utf-8"))
    assert any(isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets) for node in tree.body)
