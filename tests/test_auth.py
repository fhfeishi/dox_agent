"""Real HTTP/cookie/SQLite authentication lifecycle, no substitute authentication."""
from fastapi.testclient import TestClient
from src.agent.config import Settings
from src.main import create_app


def test_admin_setup_login_logout_and_private_api(tmp_path):
    app = create_app(Settings(_env_file=None, state_dir=tmp_path/"state", corpora_root=tmp_path/"corpora",
                              user_dir=tmp_path/"usr"))
    # No lifespan is needed for authentication: public setup must work before any material exists.
    with TestClient(app) as client:
        client.cookies.clear()
        assert client.get("/api/documents").status_code == 401
        setup = client.post("/api/auth/setup", json={"password": "test-password-123"})
        assert setup.status_code == 200
        assert "httponly" in setup.headers["set-cookie"].lower()
        assert client.get("/api/auth/session").json()["authenticated"]
        assert client.post("/api/auth/setup", json={"password": "replacement-password"}).status_code == 409
        assert client.post("/api/auth/logout").status_code == 200
        assert client.get("/api/auth/session").json()["authenticated"] is False
        assert client.post("/api/auth/login", json={"username": "admin", "password": "wrong-password"}).status_code == 401
        assert client.post("/api/auth/login", json={"username": "admin", "password": "test-password-123"}).status_code == 200
        assert client.get("/api/corpora").status_code == 200
        assert client.post("/api/auth/logout", headers={"origin": "https://evil.example"}).status_code == 403
    assert b"test-password-123" not in (tmp_path/"usr"/"accounts.sqlite3").read_bytes()


def test_three_roles_account_management_and_guides(tmp_path):
    """query 2026-1013 1133: leader/admin/user accounts; only an administrator manages accounts."""
    app = create_app(Settings(_env_file=None, state_dir=tmp_path/"state", corpora_root=tmp_path/"corpora",
                              user_dir=tmp_path/"usr"))
    with TestClient(app) as client:
        client.cookies.clear()
        assert client.post("/api/auth/setup", json={"password": "admin-password-1"}).status_code == 200
        assert client.get("/api/auth/session").json()["role"] == "admin"
        for name, role in (("boss", "leader"), ("staff", "user")):
            assert client.post("/api/auth/accounts", json={"username": name, "password": name + "-password", "role": role}).status_code == 200
        assert client.post("/api/auth/accounts", json={"username": "boss", "password": "another-password", "role": "user"}).status_code == 409
        assert client.post("/api/auth/accounts", json={"username": "x y", "password": "another-password", "role": "user"}).status_code == 422
        assert client.post("/api/auth/accounts", json={"username": "short", "password": "short", "role": "user"}).status_code == 422
        assert [(a["username"], a["role"]) for a in client.get("/api/auth/accounts").json()] == [("admin", "admin"), ("boss", "leader"), ("staff", "user")]
        # The last administrator can neither be demoted nor deleted; the current account cannot delete itself.
        assert client.patch("/api/auth/accounts/admin", json={"role": "user"}).status_code == 409
        assert client.delete("/api/auth/accounts/admin").status_code == 409

        client.post("/api/auth/logout")
        assert client.post("/api/auth/login", json={"username": "boss", "password": "boss-password"}).status_code == 200
        session = client.get("/api/auth/session").json()
        assert (session["username"], session["role"], session["guides_seen"]) == ("boss", "leader", [])
        assert client.get("/api/auth/accounts").status_code == 403
        assert client.post("/api/auth/accounts", json={"username": "x", "password": "x-password-123", "role": "admin"}).status_code == 403
        assert client.post("/api/auth/guides", json={"key": "leader"}).json()["guides_seen"] == ["leader"]
        assert client.post("/api/auth/guides", json={"key": "Bad Key"}).status_code == 422

        # A password reset by the administrator ends that account's sessions.
        boss = dict(client.cookies)
        client.post("/api/auth/logout")
        client.cookies.clear()
        assert client.post("/api/auth/login", json={"username": "admin", "password": "admin-password-1"}).status_code == 200
        assert client.patch("/api/auth/accounts/boss", json={"password": "boss-new-password"}).status_code == 200
        assert client.delete("/api/auth/accounts/staff").status_code == 200
        assert [a["username"] for a in client.get("/api/auth/accounts").json()] == ["admin", "boss"]
        client.cookies.clear()
        client.cookies.update(boss)
        assert client.get("/api/auth/session").json()["authenticated"] is False
        assert client.post("/api/auth/login", json={"username": "staff", "password": "staff-password"}).status_code == 401


def test_single_administrator_store_moves_into_accounts(tmp_path):
    """An existing single-administrator store keeps its password after the upgrade."""
    import sqlite3
    from src.auth import Accounts
    store = Accounts(tmp_path)
    salt = "00" * 16
    tmp_path.mkdir(exist_ok=True)
    with sqlite3.connect(tmp_path / "accounts.sqlite3") as db:
        db.execute("CREATE TABLE administrator (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT, digest TEXT)")
        db.execute("CREATE TABLE sessions (digest TEXT PRIMARY KEY, expires REAL)")
        db.execute("INSERT INTO administrator VALUES (1,?,?)", (salt, Accounts.password_digest("old-password-1", salt)))
    assert store.configured()
    store.login("admin", "old-password-1")
    assert [(a["username"], a["role"]) for a in store.list()] == [("admin", "admin")]
