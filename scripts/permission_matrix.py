"""Who may call each write endpoint, measured rather than read off the rules (upgrade plan, card D-doc).

Lists every non-GET operation from the app's OpenAPI, calls it once as each role (admin, owner the
leader, user) on a throw-away state directory, and records whether authorization let it through:
401/403 from the middleware is a refusal, anything else (404, 422, 200 …) means the request got past
the permission check. A check made inside a handler after body validation cannot be reached with an
empty body, so handlers are also read for an explicit check (``admin(request)`` or a 403).

Each endpoint is matched to one capability of the permission matrix in .logsdev/design/系统.md §5;
the run fails when an endpoint matches no capability or the measured roles differ from the matrix.

    .venv/bin/python scripts/permission_matrix.py            # table on stdout, exit 1 on a difference
    .venv/bin/python scripts/permission_matrix.py --markdown # the table for the design document
    .venv/bin/python scripts/permission_matrix.py --quiet    # only the differences (check.sh)
"""
import inspect
import ipaddress
import os
import re
import socket
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

# Probing posts to every write endpoint, so nothing may reach a model or the internet: some modules
# read the project .env themselves (review), so the model settings are overridden here, and any
# connection that is not to this machine is refused outright.
for name in ("MODEL_API_KEY", "DEEPSEEK_API_KEY", "REVIEW_MODEL_API_KEY", "FIRECRAWL_API_KEY"):
    os.environ[name] = "placeholder"
for name in ("MODEL_BASE_URL", "DEEPSEEK_BASE_URL", "REVIEW_MODEL_BASE_URL"):
    os.environ[name] = "http://127.0.0.1:9"
_connect = socket.socket.connect


def _local_only(sock, address):
    host = address[0] if isinstance(address, tuple) else ""
    if host and not ipaddress.ip_address(socket.gethostbyname(host)).is_loopback:
        raise ConnectionRefusedError(f"permission probe: no network ({host})")
    return _connect(sock, address)


socket.socket.connect = _local_only

from fastapi.routing import APIRoute  # noqa: E402  (after the network guard)
from fastapi.testclient import TestClient  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.agent.config import Settings  # noqa: E402
from src.main import create_app  # noqa: E402
from src.review import storage as review_storage  # noqa: E402

ROLES = (("user", "普通用户"), ("owner", "领导"), ("admin", "管理员"))
ALL, ADMIN = {"user", "owner", "admin"}, {"admin"}
# (capability, who may, path pattern); the first match wins. Mirrors design/系统.md §5.
CAPABILITIES = [
    ("账户管理", ADMIN, r"^/api/auth/accounts"),
    ("本人登录、口令与指南", ALL, r"^/api/auth/"),
    ("资料库结构重新生成与目录重新关联", ADMIN, r"^/api/corpora/[^/]+/(reassociate|target|topics|lineage|hierarchy)"),
    ("共享分析任务与 Prompt/Skill", ADMIN, r"^/api/(tasks/custom|prompt-skills)"),
    ("审查模版与指南（含应用）", ADMIN, r"^/api/review/(rules|guidelines|applied)"),
    # Topic summaries are analysis anyone may run; everything else that changes a system library is the
    # administrator's (D-20261027-1). Personal libraries are each account's own.
    ("主题综合（分析）", ALL, r"^/api/corpora/[^/]+/topic-summary"),
    ("系统资料库与资料维护", ADMIN, r"^/api/(corpora|corpus-groups|groups)"),
    ("个人资料库（本人）", ALL, r"^/api/personal-libraries"),
    # Every role may call these; the record decides (author or administrator, design/系统.md §5).
    ("删除报告（作者或管理员，按记录判断）", ALL, r"^/api/artifacts/\{artifact_id\}(/purge)?$"),
    ("对话、会话与工作区", ALL, r"^/api/(chat|workspace|sessions|compose|answers)"),
    ("报告、成果与导出", ALL, r"^/api/(reports|artifacts|exports?|summaries|results)"),
    ("报告模板", ALL, r"^/api/templates"),
    ("资料审查执行与材料", ALL, r"^/api/review/"),
    ("情报分析与网页资料", ALL, r"^/api/(intelligence|web|snapshots)"),
    ("其他工作操作", ALL, r"^/api/"),
]


def capability(path: str):
    return next((name, who) for name, who, pattern in CAPABILITIES if re.search(pattern, path))


def endpoints(routes, prefix=""):
    """(method, path) → handler, through routers added with include_router."""
    found = {}
    for route in routes:
        if isinstance(route, APIRoute):
            for method in route.methods:
                found[(method, route.path if route.path.startswith(prefix) else prefix + route.path)] = route.endpoint
        elif hasattr(route, "original_router"):
            found.update(endpoints(route.original_router.routes, getattr(route.original_router, "prefix", "")))
    return found


def handler_check(endpoint) -> str:
    source = inspect.getsource(endpoint)
    if "admin(request)" in source:
        return "admin"
    return "其他 403" if "403" in source else ""


def measure():
    with TemporaryDirectory(prefix="dox-permissions-") as directory:
        root = Path(directory)
        # Review storage fixes its folder from the project settings at import (系统.md §6, finding 2).
        review_storage.DATA = root / "review"
        app = create_app(Settings(_env_file=None, state_dir=root / "state", corpora_root=root / "corpora",
                                  user_dir=root / "usr", embedding_path=""))
        with TestClient(app, base_url="http://testserver", raise_server_exceptions=False) as client:
            return probe(app, client)


def probe(app, client):
    cookies = {}
    for username, _ in ROLES:
        response = client.post("/api/auth/login", json={"username": username, "password": "123456"})
        assert response.status_code == 200, response.text
        cookies[username] = dict(client.cookies)
        client.cookies.clear()
    handlers = endpoints(app.routes)
    rows = []
    for template, operations in app.openapi()["paths"].items():
        for method in sorted(m.upper() for m in operations if m not in ("get", "head", "options")):
            if template in ("/api/auth/logout", "/api/auth/login"):
                allowed = set(ALL)  # calling them would end or replace the probing session
            else:
                path = re.sub(r"\{[^}]+\}", "probe", template)
                allowed = set()
                for username, jar in cookies.items():
                    client.cookies.clear()
                    client.cookies.update(jar)
                    if client.request(method, path, json={}).status_code not in (401, 403):
                        allowed.add(username)
            check = handler_check(handlers[(method, template)])
            if check == "admin":
                allowed &= ADMIN
            name, expected = capability(template)
            rows.append({"method": method, "path": template, "capability": name, "expected": expected,
                         "allowed": allowed, "handler": check})
    return rows


def mark(roles):
    return " ".join("✓" if u in roles else "—" for u, _ in ROLES)


def main():
    rows = sorted(measure(), key=lambda r: (r["capability"], r["path"], r["method"]))
    differ = [r for r in rows if r["allowed"] != r["expected"]]
    if "--markdown" in sys.argv:
        print("| 能力 | 方法 | 路径 | 实测 用户 领导 管理员 | 一致 |")
        print("|---|---|---|---|---|")
        for r in rows:
            print(f"| {r['capability']} | {r['method']} | `{r['path']}` | {mark(r['allowed'])} | "
                  f"{'是' if r['allowed'] == r['expected'] else '否：矩阵为 ' + mark(r['expected'])} |")
    elif "--quiet" in sys.argv:
        for r in differ:
            print(f"{r['method']} {r['path']}: 实测 {mark(r['allowed'])}，矩阵 {mark(r['expected'])}")
    else:
        for r in rows:
            print(f"{r['method']:6} {r['path']:58} {mark(r['allowed'])}  {r['capability']}"
                  + ("" if r["allowed"] == r["expected"] else f"   ≠ 矩阵 {mark(r['expected'])}"))
    print(f"\n{len(rows)} 个写接口；与矩阵不一致 {len(differ)} 个。", file=sys.stderr)
    return 1 if differ else 0


if __name__ == "__main__":
    sys.exit(main())
