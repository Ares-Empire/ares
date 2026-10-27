#!/usr/bin/env python3
"""Serves dist/ for looking at a build, with the Content-Security-Policy the server sends, so anything that breaks it
(an inline style, a script from elsewhere) shows up here as an error too; python3 -m http.server sends no policy.

    python3 tools/serve.py [port]      http://127.0.0.1:8790/en/ by default; port 0 picks a free one
"""

import functools
import http.server
import sys
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / "dist"
# The header the patrikbreeck.com block in /etc/caddy/Caddyfile sends: keep the two the same.
CSP = ("default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; "
       "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".map": "application/json", ".webp": "image/webp"}

    def end_headers(self):
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):
        pass   # quiet: errors show in the browser


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    if not DIST.is_dir():
        print("dist/ is missing: run python3 build.py first", file=sys.stderr)
        return 1
    handler = functools.partial(Handler, directory=str(DIST))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"serving dist/ with the site's Content-Security-Policy at http://127.0.0.1:{server.server_address[1]}/en/",
              flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
