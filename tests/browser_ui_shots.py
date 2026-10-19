"""Screenshots for the 2026-1019 2021 navigation and spacing batch.

Runs the real app with the project's knowledge base (read-only) on a temporary state
directory, so the shots show the pages as they will be presented. Only the answer model is
not exercised: the pages here are navigation, 任务模版 and the two home pages.
"""
import asyncio
import shutil
import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.async_api import async_playwright, expect

from src.agent.config import Settings
from src.main import create_app
from tests.browser_artifacts_live import start_server

ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / ".logsdev/verification/query-20261019-2021"
# A writable copy of the knowledge metadata: the overview caches into the corpus database, so the
# real .knowledge must not be used directly. A few source files per library keep the counts and the
# library picker non-empty without copying several gigabytes of material.
SNAPSHOT = Path("/tmp/dox-shots-corpora")


def snapshot_corpora():
    if SNAPSHOT.exists():
        return
    for src in sorted((ROOT / ".knowledge").iterdir()):
        if not src.is_dir():
            continue
        dst = SNAPSHOT / src.name
        (dst / "source").mkdir(parents=True, exist_ok=True)
        for name in ("datadb", "target"):
            if (src / name).is_dir():
                shutil.copytree(src / name, dst / name, dirs_exist_ok=True)
        # VACUUM INTO writes a clean copy: a plain copy of a live WAL database fails with
        # "disk I/O error" once the snapshot is opened outside its original directory.
        for db in (dst / "datadb").glob("*.sqlite3"):
            clean = db.with_suffix(".clean")
            source = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            try:
                source.execute("VACUUM INTO ?", (str(clean),))
            finally:
                source.close()
            for suffix in ("-wal", "-shm"):
                leftover = db.with_name(db.name + suffix)
                if leftover.exists():
                    leftover.unlink()
            clean.replace(db)
        for name in ("hierarchy.json", "lineage.json", "lineage_frame.json", "lineage_blanks.json"):
            if (src / name).exists():
                shutil.copy2(src / name, dst / name)
        files = [f for f in sorted((src / "source").rglob("*")) if f.is_file() and f.stat().st_size < 400_000][:6]
        for f in files:
            shutil.copy2(f, dst / "source" / f.name)


async def shot(page, name):
    await page.wait_for_timeout(500)
    await page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)


async def dismiss(page):
    for _ in range(3):
        guide = page.get_by_role("button", name="知道了")
        if await guide.count():
            await guide.first.click()
        else:
            break


async def login(page, origin, username):
    await page.request.post(origin + "/api/auth/logout")
    response = await page.request.post(origin + "/api/auth/login", data={"username": username, "password": "123456"})
    assert response.status == 200, await response.text()
    for area in ("home", "overview", "chat", "library", "tasks", "review", "intelligence"):
        await page.request.post(origin + "/api/auth/guides", data={"key": area})
    # Warm the per-library index once: the first read also writes its cache, and a home page opened
    # during that write shows "正在读取资料库概况…" instead of the charts.
    await page.request.get(origin + "/api/overview/libraries", timeout=180000)


async def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    snapshot_corpora()
    with TemporaryDirectory(prefix="dox-ui-shots-") as directory:
        root = Path(directory)
        settings = Settings(_env_file=None, state_dir=root / "state", corpora_root=SNAPSHOT,
                            user_dir=root / "usr", embedding_path="")
        app = create_app(settings)
        origin, server, thread, listener = start_server(app)
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1440, "height": 900})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))

                # Administrator: the bar order, the two menus, 任务模版 and the deep link.
                await login(page, origin, "admin")
                await page.goto(origin + "/home")
                await dismiss(page)
                await expect(page.get_by_role("navigation", name="主导航")).to_be_visible()
                await shot(page, "admin-01-home")
                await page.get_by_role("button", name="存量分析 ▾", exact=True).click()
                await shot(page, "admin-02-menu-tasks")
                await page.keyboard.press("Escape")
                await page.get_by_role("button", name="资料审查 ▾", exact=True).click()
                await shot(page, "admin-03-menu-review")
                await page.keyboard.press("Escape")
                await page.goto(origin + "/tasks")
                await dismiss(page)
                await shot(page, "admin-04-task-templates")
                await page.goto(origin + "/tasks?task=task2")
                await dismiss(page)
                await expect(page.get_by_role("button", name="选择资料", exact=True).first).to_be_visible()
                await page.wait_for_timeout(600)
                await shot(page, "admin-05-task-deeplink")
                await page.goto(origin + "/library")
                await dismiss(page)
                await shot(page, "admin-06-library")
                await page.goto(origin + "/review/formal")
                await dismiss(page)
                await shot(page, "admin-07-review")
                await page.goto(origin + "/results")
                await dismiss(page)
                await expect(page.get_by_role("heading", name="报告中心", exact=True)).to_be_visible()
                await shot(page, "admin-08-results")
                corpora = await (await page.request.get(origin + "/api/corpora")).json()
                await page.goto(origin + "/library/" + corpora[0]["id"] + "/documents")
                await dismiss(page)
                await shot(page, "admin-09-library-files")
                await page.goto(origin + "/chat")
                await dismiss(page)
                await shot(page, "admin-10-chat")
                await page.goto(origin + "/intelligence")
                await dismiss(page)
                await shot(page, "admin-11-intelligence")
                await page.goto(origin + "/overview/build")
                await dismiss(page)
                await shot(page, "admin-12-overview")

                # Leader: 工作台 opens, 存量分析 and 资料审查 fold open in place.
                await login(page, origin, "owner")
                await page.goto(origin + "/home")
                await dismiss(page)
                await page.get_by_role("region", name="首页导览").hover()
                await page.wait_for_timeout(600)
                await shot(page, "leader-01-home")
                await page.get_by_role("region", name="首页导览").get_by_role("button", name="第 3 张：年度项目分布").click()
                await page.wait_for_timeout(700)
                await page.get_by_role("region", name="首页导览").screenshot(path=str(SHOTS / "leader-01b-year-slide.png"))
                await page.get_by_role("button", name="工作台 ▾", exact=True).click()
                await shot(page, "leader-02-workbench")
                await page.get_by_role("menuitem", name="存量分析", exact=True).click()
                await shot(page, "leader-03-workbench-tasks")
                await page.keyboard.press("Escape")
                await page.goto(origin + "/tasks?task=task3")
                await dismiss(page)
                await shot(page, "leader-04-task-deeplink")
                await page.goto(origin + "/overview/domains")
                await dismiss(page)
                await shot(page, "leader-05-domains")

                # User: the same bar order as the administrator.
                await login(page, origin, "user")
                await page.goto(origin + "/home")
                await dismiss(page)
                await shot(page, "user-01-home")

                assert not errors, errors
                await browser.close()
        finally:
            server.should_exit = True
            thread.join(5)
            listener.close()
    print("PASS screenshots in", SHOTS)


if __name__ == "__main__":
    asyncio.run(main())
