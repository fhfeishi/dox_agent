"""Measure suspected defects instead of guessing. Read-only."""
import asyncio
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.agent.config import Settings            # noqa: E402
from src.main import create_app                   # noqa: E402
from tests.browser_artifacts_live import start_server  # noqa: E402
from tests.browser_ui_shots import snapshot_corpora, SNAPSHOT  # noqa: E402
from tour import real_state, dismiss, login       # noqa: E402

PROBE = """() => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // text that is cut horizontally without an ellipsis (scrollWidth overflow, overflow visible)
    if (el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 2) {
      out.push({kind: 'text-clip', tag: el.tagName, cls: (el.className||'').toString().slice(0,90),
                text: el.textContent.trim().slice(0,60), sw: el.scrollWidth, cw: el.clientWidth,
                overflow: cs.overflowX, ellipsis: cs.textOverflow});
    }
  }
  return out;
}"""


async def main():
    snapshot_corpora()
    state_dir, user_dir = real_state()
    settings = Settings(_env_file=None, state_dir=state_dir, corpora_root=SNAPSHOT,
                        user_dir=user_dir, embedding_path="")
    app = create_app(settings)
    origin, server, thread, listener = start_server(app)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        await login(page, origin, "owner")
        for path in ("/home", "/chat", "/results", "/library", "/tasks"):
            await page.goto(origin + path)
            await page.wait_for_timeout(2000)
            await dismiss(page)
            rows = await page.evaluate(PROBE)
            print("==", path, len(rows))
            for r in rows[:12]:
                print("  ", r["kind"], r["text"][:40], "|", r["sw"], ">", r["cw"], "|", r["overflow"], r["ellipsis"], "|", r["cls"][:60])
        await browser.close()
    server.should_exit = True
    thread.join(5)
    listener.close()


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent)
    asyncio.run(main())
