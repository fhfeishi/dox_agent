"""Local accounts with three roles; salted credentials and revocable server-side sessions.

An internal system: the store starts with ``admin`` (administrator), ``owner`` (leader) and ``user``
(user), all ``123456``, and every password needs only
four characters; new accounts default to ``123456``. Roles (query 2026-1013 1133) choose the interface: ``leader`` gets the lean leader view, ``admin``
the full system plus account management, ``user`` the full workbench. Leaders also use the workbench
(query 1842). Enforced on the API: library maintenance (libraries, files, imports, generated
structure, groups), shared analysis tasks and review templates, and account management are the
administrator's. Stores record who created a report, review or session (``CURRENT_USER``), and
lists show each account its own (``visible_owners``, query 2026-1023 1044). Each account also
remembers which first-visit guides it has dismissed.
"""
import hashlib
import hmac
import re
import secrets
import sqlite3
import time
from contextvars import ContextVar
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .core.db import connect, migrate
from .launcher import code_version

COOKIE = "dox_session"
LIFETIME = 30 * 24 * 3600
SESSION_LIFETIME = 7 * 24 * 3600
Role = Literal["admin", "leader", "user"]
USERNAME = re.compile(r"^[^\s/\\]{1,40}$")
GUIDE = re.compile(r"^[a-z][a-z-]{0,30}$")
SAFE = ("GET", "HEAD", "OPTIONS")
# The signed-in account for this request, so stores can record who created a report or review
# (节点审查 Q2); lists filter on it through visible_owners.
CURRENT_USER: ContextVar[str] = ContextVar("current_user", default="")
# The backend sources this process started with; the launcher compares it to find a stale service.
CODE_VERSION = code_version(Path(__file__).resolve().parents[1])
DEFAULT_PASSWORD = "123456"
# query 2026-1013 1459: the three identity groups each start with one account.
DEFAULT_ACCOUNTS = (("admin", "admin"), ("owner", "leader"), ("user", "user"))


class Credentials(BaseModel):
    username: str = Field(default="admin", max_length=80)
    password: str = Field(min_length=1, max_length=256)
    remember: bool = True


class NewAccount(BaseModel):
    username: str = Field(max_length=40)
    password: str = Field(default=DEFAULT_PASSWORD, max_length=256)
    role: Role


class AccountChange(BaseModel):
    password: str | None = Field(default=None, max_length=256)
    role: Role | None = None


class PasswordChange(BaseModel):
    old: str = Field(max_length=256)
    new: str = Field(max_length=256)


class Guide(BaseModel):
    key: str = Field(max_length=32)


def _check_password(password: str):
    if len(password) < 4:
        raise HTTPException(422, "密码至少需要 4 个字符")


def _schema_v1(db):
    """Accounts as they stood when migrations were introduced (B3), with the one-time move from the
    single-administrator layout; idempotent, so an existing file adopts it unchanged."""
    db.execute("CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, role TEXT NOT NULL, salt TEXT, digest TEXT, created REAL)")
    db.execute("CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY CHECK(id=1), failures INTEGER, until REAL)")
    db.execute("CREATE TABLE IF NOT EXISTS guides (username TEXT, key TEXT, PRIMARY KEY (username, key))")
    # The single-administrator layout's sessions carried no user and are dropped.
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='administrator'").fetchone():
        row = db.execute("SELECT salt,digest FROM administrator WHERE id=1").fetchone()
        if row:
            db.execute("INSERT OR IGNORE INTO accounts VALUES ('admin','admin',?,?,?)", (row[0], row[1], time.time()))
        db.execute("DROP TABLE administrator")
        db.execute("DROP TABLE IF EXISTS sessions")
    db.execute("CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, username TEXT, expires REAL)")


# Schema steps for accounts.sqlite3, append-only (src/core/db.py).
SCHEMA = [_schema_v1]


class Accounts:
    def __init__(self, directory: Path):
        self.path = directory / "accounts.sqlite3"
        self._ready = False

    def connect(self):
        if not self._ready:
            self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            migrate(self.path, SCHEMA)
            with connect(self.path) as db:
                if not db.execute("SELECT 1 FROM accounts").fetchone():
                    for order, (username, role) in enumerate(DEFAULT_ACCOUNTS):
                        salt, digest = self._credentials(DEFAULT_PASSWORD)
                        db.execute("INSERT INTO accounts VALUES (?,?,?,?,?)", (username, role, salt, digest, time.time() + order * 1e-3))
            self.path.chmod(0o600)
            self._ready = True
        return connect(self.path, timeout=15)

    @staticmethod
    def password_digest(password, salt):
        return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600_000).hex()

    def _credentials(self, password):
        salt = secrets.token_hex(16)
        return salt, self.password_digest(password, salt)

    def user(self, token):
        """(username, role) for a live session, else None."""
        if not token:
            return None
        with self.connect() as db:
            return db.execute("SELECT a.username, a.role FROM sessions s JOIN accounts a ON a.username = s.username "
                              "WHERE s.digest=? AND s.expires>?", (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()

    def login(self, username, password):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            attempt = db.execute("SELECT failures,until FROM attempts WHERE id=1").fetchone()
            if attempt and attempt[0] >= 10 and attempt[1] > time.time():
                raise HTTPException(429, "尝试次数较多，请一分钟后再试")
            account = db.execute("SELECT salt,digest FROM accounts WHERE username=?", (username,)).fetchone()
            valid = account and hmac.compare_digest(account[1], self.password_digest(password, account[0]))
            if not valid:
                failures = attempt[0] + 1 if attempt and attempt[1] > time.time() else 1
                db.execute("INSERT OR REPLACE INTO attempts VALUES (1,?,?)", (failures, time.time() + 60))
            else:
                db.execute("DELETE FROM attempts")
        if not valid:
            raise HTTPException(401, "账户或密码不正确")

    def session(self, username, lifetime=LIFETIME):
        token = secrets.token_urlsafe(32)
        with self.connect() as db:
            db.execute("DELETE FROM sessions WHERE expires<=?", (time.time(),))
            db.execute("INSERT INTO sessions VALUES (?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), username, time.time() + lifetime))
        return token

    def logout(self, token):
        with self.connect() as db:
            db.execute("DELETE FROM sessions WHERE digest=?", (hashlib.sha256(token.encode()).hexdigest(),))

    def list(self):
        with self.connect() as db:
            return [{"username": u, "role": r, "created": c} for u, r, c in
                    db.execute("SELECT username, role, created FROM accounts ORDER BY created")]

    def create(self, username, password, role):
        if not USERNAME.match(username):
            raise HTTPException(422, "账户名为 1–40 个字符，不含空格和斜杠")
        _check_password(password)
        salt, digest = self._credentials(password)
        with self.connect() as db:
            try:
                db.execute("INSERT INTO accounts VALUES (?,?,?,?,?)", (username, role, salt, digest, time.time()))
            except sqlite3.IntegrityError:
                raise HTTPException(409, "账户名已存在") from None

    def _admins_left(self, db, username):
        return db.execute("SELECT COUNT(*) FROM accounts WHERE role='admin' AND username<>?", (username,)).fetchone()[0]

    def change(self, username, password, role):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            current = db.execute("SELECT role FROM accounts WHERE username=?", (username,)).fetchone()
            if not current:
                raise HTTPException(404, "账户不存在")
            if role and role != "admin" and current[0] == "admin" and not self._admins_left(db, username):
                raise HTTPException(409, "至少保留一个管理员账户")
            if password is not None:
                _check_password(password)
                salt, digest = self._credentials(password)
                db.execute("UPDATE accounts SET salt=?, digest=? WHERE username=?", (salt, digest, username))
                db.execute("DELETE FROM sessions WHERE username=?", (username,))
            if role:
                db.execute("UPDATE accounts SET role=? WHERE username=?", (role, username))

    def change_own(self, username, token, old, new):
        """The signed-in user's own password; other sessions of that account end, this one stays."""
        _check_password(new)
        with self.connect() as db:
            account = db.execute("SELECT salt,digest FROM accounts WHERE username=?", (username,)).fetchone()
            if not hmac.compare_digest(account[1], self.password_digest(old, account[0])):
                raise HTTPException(401, "原密码不正确")
            salt, digest = self._credentials(new)
            db.execute("UPDATE accounts SET salt=?, digest=? WHERE username=?", (salt, digest, username))
            db.execute("DELETE FROM sessions WHERE username=? AND digest<>?", (username, hashlib.sha256(token.encode()).hexdigest()))

    def delete(self, username):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            current = db.execute("SELECT role FROM accounts WHERE username=?", (username,)).fetchone()
            if not current:
                raise HTTPException(404, "账户不存在")
            if current[0] == "admin" and not self._admins_left(db, username):
                raise HTTPException(409, "至少保留一个管理员账户")
            for table in ("accounts", "sessions", "guides"):
                db.execute(f"DELETE FROM {table} WHERE username=?", (username,))

    def guides(self, username):
        with self.connect() as db:
            return [k for (k,) in db.execute("SELECT key FROM guides WHERE username=?", (username,))]

    def see_guide(self, username, key):
        if not GUIDE.match(key):
            raise HTTPException(422, "引导标识不正确")
        with self.connect() as db:
            db.execute("INSERT OR IGNORE INTO guides VALUES (?,?)", (username, key))


def require_admin(request: Request):
    """Libraries are everyone's to keep (query 2026-1016 0919): any account may create, rename, describe,
    group and delete libraries and add, rename, delete and re-import their files. What stays with the
    administrator is the model-heavy regeneration of a library's structure (four-facet extraction, topic
    merges, lineage, hierarchy) and re-linking its folder on disk; shared analysis tasks, their prompt
    assets and review templates are maintained by administrators too (节点审查 D2). Report templates stay
    open: 情报分析 lets anyone save their own. Each such endpoint declares ``ADMIN_ONLY`` (card B2), and
    scripts/permission_matrix.py measures the result against design/系统.md §5."""
    if request.state.user[1] != "admin":
        raise HTTPException(403, "资料库结构重新生成与共享模版维护需要管理员账户")


ADMIN_ONLY = [Depends(require_admin)]


def visible_owners(request: Request, scope: str = "mine") -> list[str] | None:
    """Whose reports, reviews and conversations a list shows (query 2026-1023 1044): the signed-in
    account's own. Records from before authorship was recorded have no author and are the
    administrator's, as for deleting them; ``scope="all"`` lets the administrator see every account's.
    ``None`` means no filter. A record opened by its id is not filtered here."""
    username, role = request.state.user[:2]
    if scope not in ("mine", "all"):
        raise HTTPException(422, "未知的查看范围")
    if role == "admin":
        return None if scope == "all" else [username, ""]
    if scope == "all":
        raise HTTPException(403, "只有管理员可以查看全部账户的记录")
    return [username]


def install_auth(app, directory):
    accounts = Accounts(directory)
    app.state.accounts = accounts
    def cookie_name(request):
        # Browsers isolate cookie hosts but not ports. Local test services must not replace the
        # normal entry's login; replicas behind the same public entry still share one cookie name.
        port = request.url.port or (443 if request.url.scheme == "https" else 80)
        return f"{COOKIE}_{port}"

    def session_token(request):
        token = request.cookies.get(cookie_name(request))
        if token:
            return token
        # Adopt a still-valid seven-day cookie from before scoping without asking for a password.
        legacy = request.cookies.get(COOKIE)
        return legacy if accounts.user(legacy) else ""

    def set_cookie(result, request, token, max_age):
        result.set_cookie(cookie_name(request), token, max_age=max_age, httponly=True,
                          samesite="strict", secure=request.url.scheme == "https")

    def clear_legacy(result, request):
        if accounts.user(request.cookies.get(COOKIE)):
            result.delete_cookie(COOKIE)

    @app.middleware("http")
    async def authenticate(request: Request, call_next):
        path = request.url.path
        if path.startswith("/api/") or path in ("/docs", "/redoc", "/openapi.json"):
            if request.method not in ("GET", "HEAD", "OPTIONS"):
                origin = request.headers.get("origin")
                if origin and urlsplit(origin).netloc != request.headers.get("host"):
                    return JSONResponse({"detail": "请求来源不匹配"}, status_code=403)
            if path not in ("/api/auth/session", "/api/auth/login"):
                token = session_token(request)
                user = accounts.user(token)
                if not user:
                    return JSONResponse({"detail": "请先登录"}, status_code=401)
                request.state.user = user
                request.state.session_token = token
                CURRENT_USER.set(user[0])
        return await call_next(request)

    def admin(request: Request):
        if request.state.user[1] != "admin":
            raise HTTPException(403, "只有管理员可以管理账户")

    def response(request, username, remember):
        role = next(a["role"] for a in accounts.list() if a["username"] == username)
        result = JSONResponse({"authenticated": True, "username": username, "role": role}, headers={"Cache-Control": "no-store"})
        set_cookie(result, request, accounts.session(username, LIFETIME if remember else SESSION_LIFETIME),
                   LIFETIME if remember else None)
        clear_legacy(result, request)
        return result

    @app.get("/api/auth/session")
    def session(request: Request):
        token = session_token(request)
        user = accounts.user(token)
        # app_id and code_version let the launcher recognise a running copy (and an outdated one)
        # without signing in; /api/health needs a session since accounts were added.
        result = JSONResponse({"authenticated": bool(user), "app_id": "dox-agent", "code_version": CODE_VERSION,
                             "username": user[0] if user else "", "role": user[1] if user else "",
                             "guides_seen": accounts.guides(user[0]) if user else []},
                            headers={"Cache-Control": "no-store"})
        if user and cookie_name(request) not in request.cookies:
            set_cookie(result, request, token, SESSION_LIFETIME)
            clear_legacy(result, request)
        return result

    @app.post("/api/auth/login")
    def login(body: Credentials, request: Request):
        accounts.login(body.username, body.password)
        return response(request, body.username, body.remember)

    @app.post("/api/auth/logout")
    def logout(request: Request):
        clear_old = bool(accounts.user(request.cookies.get(COOKIE)))
        accounts.logout(request.state.session_token)
        result = JSONResponse({"authenticated": False})
        result.delete_cookie(cookie_name(request))
        if clear_old:
            result.delete_cookie(COOKIE)
        return result

    @app.post("/api/auth/password")
    def change_password(body: PasswordChange, request: Request):
        accounts.change_own(request.state.user[0], request.state.session_token, body.old, body.new)
        return {"changed": True}

    @app.post("/api/auth/guides")
    def see_guide(body: Guide, request: Request):
        accounts.see_guide(request.state.user[0], body.key)
        return {"guides_seen": accounts.guides(request.state.user[0])}

    @app.get("/api/auth/accounts")
    def list_accounts(request: Request):
        admin(request)
        return accounts.list()

    @app.post("/api/auth/accounts")
    def create_account(body: NewAccount, request: Request):
        admin(request)
        accounts.create(body.username, body.password, body.role)
        return accounts.list()

    @app.patch("/api/auth/accounts/{username}")
    def change_account(username: str, body: AccountChange, request: Request):
        admin(request)
        accounts.change(username, body.password, body.role)
        return accounts.list()

    @app.delete("/api/auth/accounts/{username}")
    def delete_account(username: str, request: Request):
        admin(request)
        if username == request.state.user[0]:
            raise HTTPException(409, "不能删除当前登录的账户")
        accounts.delete(username)
        return accounts.list()
