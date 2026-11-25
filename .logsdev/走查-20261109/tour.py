"""UI walkthrough harness: boots the real app against a read-only snapshot of .knowledge
and photographs every page for a design review. Not a check.

    .venv/bin/python .logsdev/走查-20261109/tour.py [page ...]
"""
import asyncio
import os
import shutil
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.agent.config import Settings            # noqa: E402
from src.main import create_app                   # noqa: E402
from tests.browser_artifacts_live import start_server  # noqa: E402
from tests.browser_ui_shots import snapshot_corpora, SNAPSHOT  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SHOTS = Path(__file__).resolve().parent / "shots"
WIDTH = int(os.environ.get("VIEWPORT_W", "1440"))
HEIGHT = int(os.environ.get("VIEWPORT_H", "900"))

PAGES = {
    "home": "/home",
    "library": "/library",
    "results": "/results",
    "tasks": "/tasks",
    "review": "/review/formal",
    "review-templates": "/review/templates",
    "review-evidence": "/review/evidence",
    "intelligence": "/intelligence",
    "chat": "/chat",
    "overview-build": "/overview/build",
    "overview-domains": "/overview/domains",
    "experts": "/experts",
    "ingest": "/ingest",
}


async def dismiss(page):
    for _ in range(4):
        guide = page.get_by_role("button", name="知道了")
        if await guide.count():
            await guide.first.click()
            await page.wait_for_timeout(200)
        else:
            break


async def login(page, origin, username):
    await page.request.post(origin + "/api/auth/logout")
    r = await page.request.post(origin + "/api/auth/login",
                                data={"username": username, "password": "123456"})
    assert r.status == 200, await r.text()
    for area in ("home", "overview", "chat", "library", "tasks", "review", "intelligence"):
        await page.request.post(origin + "/api/auth/guides", data={"key": area})


REAL = Path("/tmp/dox-tour-real")


def real_state():
    """A copy of the live state and accounts so the walkthrough shows real reports, runs and chats.
    The originals are never written to."""
    if REAL.exists():
        return REAL / "state", REAL / "usr"
    REAL.mkdir(parents=True)
    shutil.copytree(ROOT / ".knowledge" / ".state", REAL / "state")
    shutil.copytree(ROOT / ".local" / "usr", REAL / "usr")
    return REAL / "state", REAL / "usr"


async def main(wanted, user):
    SHOTS.mkdir(parents=True, exist_ok=True)
    snapshot_corpora()
    if os.environ.get("TOUR_REAL_STATE"):
        state_dir, user_dir = real_state()
        ctx = None
    else:
        state_dir = user_dir = None
        ctx = TemporaryDirectory(prefix="dox-tour-")
    if ctx is not None:
        root = Path(ctx.name)
        state_dir, user_dir = root / "state", root / "usr"
    settings = Settings(_env_file=None, state_dir=state_dir, corpora_root=SNAPSHOT,
                        user_dir=user_dir, embedding_path="")
    app = create_app(settings)
    origin, server, thread, listener = start_server(app)
    if True:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": WIDTH, "height": HEIGHT})
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
                await login(page, origin, user)
                for name in wanted:
                    path = PAGES.get(name, name)
                    t0 = time.time()
                    await page.goto(origin + path)
                    await page.wait_for_timeout(600)
                    await dismiss(page)
                    await page.wait_for_load_state("networkidle")
                    await page.wait_for_timeout(1200)
                    out = SHOTS / f"{user}-{name}.png"
                    await page.screenshot(path=str(SHOTS / f"{user}-{name}-v.png"))
                    # The shell is a fixed h-screen with internal scrollers; unclip it so one shot holds the
                    # whole page. Screenshot-only: nothing is saved back to the app.
                    height = await page.evaluate("""() => {
                        for (const el of [document.documentElement, document.body]) {
                            el.style.height = 'auto'; el.style.overflow = 'visible';
                        }
                        const root = document.getElementById('root');
                        if (root) { root.style.height = 'auto'; root.style.overflow = 'visible'; }
                        for (const el of document.querySelectorAll('*')) {
                            const cs = getComputedStyle(el);
                            if (cs.overflowY !== 'visible' || cs.height !== 'auto') {
                                if (el.scrollHeight > el.clientHeight + 20 || cs.overflowY === 'hidden') {
                                    el.style.height = 'auto';
                                    el.style.maxHeight = 'none';
                                    el.style.overflowY = 'visible';
                                    el.style.overflowX = 'visible';
                                }
                            }
                        }
                        return document.documentElement.scrollHeight;
                    }""")
                    await page.wait_for_timeout(700)
                    await page.screenshot(path=str(out), full_page=True)
                    print(f"{name:18s} {time.time()-t0:5.1f}s  doc={height}")
                if errors:
                    print("ERRORS:", errors[:10])
                await browser.close()
    server.should_exit = True
    thread.join(5)
    listener.close()
    if ctx is not None:
        ctx.cleanup()


if __name__ == "__main__":
    args = sys.argv[1:]
    user = os.environ.get("TOUR_USER", "admin")
    wanted = args or list(PAGES)
    asyncio.run(main(wanted, user))
