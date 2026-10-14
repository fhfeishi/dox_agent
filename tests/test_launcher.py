import socket

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
