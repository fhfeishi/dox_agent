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
