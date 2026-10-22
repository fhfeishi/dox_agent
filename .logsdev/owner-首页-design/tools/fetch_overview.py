"""Dump the real /api/overview/libraries payload so the two overview demos can embed it verbatim."""

import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.async_api import async_playwright

from src.agent.config import Settings
from src.main import create_app
from tests.browser_artifacts_live import start_server
from tests.browser_ui_shots import login, snapshot_corpora

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / ".logsdev/owner-首页-design/tools/libraries.json"
SNAP = Path("/tmp/dox-shots-corpora")


async def main():
    snapshot_corpora()
    with TemporaryDirectory(prefix="dox-dump-") as directory:
        root = Path(directory)
        settings = Settings(_env_file=None, state_dir=root / "state", corpora_root=SNAP,
                            user_dir=root / "usr", embedding_path="")
        app = create_app(settings)
        origin, server, thread, listener = start_server(app)
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                await login(page, origin, "owner")
                response = await page.request.get(origin + "/api/overview/libraries", timeout=300000)
                rows = await response.json()
                await browser.close()
            OUT.parent.mkdir(parents=True, exist_ok=True)
            OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
            print("rows:", len(rows), "bytes:", OUT.stat().st_size)
            for row in rows:
                print(row["name"], "| projects", row["projects"], "| fields", len(row.get("fields") or []),
                      "| items", row["lineage"]["items"], "| maturity", (row["lineage"].get("maturity") or [])[:1])
        finally:
            server.should_exit = True
            thread.join(timeout=30)
            listener.close()


asyncio.run(main())
