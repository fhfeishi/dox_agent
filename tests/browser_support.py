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
