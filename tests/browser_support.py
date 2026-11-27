from http.server import SimpleHTTPRequestHandler
from urllib.parse import urlsplit


class FrontendHandler(SimpleHTTPRequestHandler):
    """Mirror the app's SPA fallback for offline browser reloads; APIs/assets still return 404."""

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.split("/")[1] in {"home", "chat", "library", "tasks", "review", "results", "overview", "intelligence"} and "." not in path:
            self.path = "/index.html"
        super().do_GET()


"""Shared login for isolated real-service browser scripts.

Guide behavior has its own journey in browser_review_simple; unrelated journeys mark the
guides as read through the real endpoint so the welcome card cannot cover their controls.
"""
async def login(page, origin):
    response = await page.request.post(origin + "/api/auth/login", data={"username": "admin", "password": "123456"})
    assert response.status == 200, await response.text()
    for area in ("home", "overview", "chat", "library", "tasks", "review", "intelligence"):
        response = await page.request.post(origin + "/api/auth/guides", data={"key": area})
        assert response.status == 200, await response.text()


async def open_chat(page):
    """Open 对话工作台. Since query 2026-1127 1532 it is the first page of the 存量分析 menu, not an
    entry of its own, so a journey that used to click a top-bar link opens the menu first. The bar is
    still settling right after a page load (the account's role and the fonts arrive late and can move
    the trigger), so the menu is reopened if the first click missed it."""
    nav = page.get_by_role("navigation", name="主导航")
    trigger = nav.get_by_role("button", name="存量分析")
    item = page.get_by_role("menuitem", name="对话工作台", exact=True)
    await trigger.wait_for(state="visible")
    await page.evaluate("() => document.fonts.ready")
    for _ in range(4):
        await trigger.click()
        if await item.is_visible():
            await item.click()
            return
        await page.wait_for_timeout(200)
    assert await item.is_visible(), "存量分析 ▾ did not open"
    await item.click()
