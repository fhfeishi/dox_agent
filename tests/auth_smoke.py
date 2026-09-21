"""Optional real-browser test with a local cookie-protected fixture, no real credentials."""

import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from src.parsers import crawl4ai_page


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        signed_in = "fixture=allowed" in self.headers.get("Cookie", "")
        text = "PRIVATE_FIXTURE_CONTENT" if signed_in else "LOGIN_REQUIRED"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        paragraphs = "<p>This local fixture checks browser session reuse for document extraction.</p>" * 8
        self.wfile.write(
            f"<!doctype html><html><head><title>Fixture</title></head><body><main><h1>{text}</h1>{paragraphs}</main></body></html>".encode()
        )

    def log_message(self, *args):
        pass


async def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}"
    try:
        _, public = await crawl4ai_page(url, {})
        state = {
            "cookies": [
                {
                    "name": "fixture",
                    "value": "allowed",
                    "domain": "127.0.0.1",
                    "path": "/",
                    "expires": -1,
                    "httpOnly": True,
                    "secure": False,
                    "sameSite": "Lax",
                }
            ],
            "origins": [],
        }
        _, private = await crawl4ai_page(url, {"storage_state": state})
        assert "LOGIN_REQUIRED" in public
        assert "PRIVATE_FIXTURE_CONTENT" in private
        assert "LOGIN_REQUIRED" not in private
        print("Crawl4AI storage-state reuse passed on cookie-protected local fixture")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
