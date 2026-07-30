#!/usr/bin/env python3
"""
Tiny static file server for editing this site locally.

Same idea as `python3 -m http.server`, with one difference: it tells the
browser never to cache. Without that, you edit index.html / styles.css /
game.js, hit reload, and the browser quietly serves you the old file — which
looks exactly like "my change didn't work".

Not needed in production. Real hosts (Netlify, GitHub Pages, Cloudflare)
send correct cache headers on their own.

    python3 dev-server.py          # http://localhost:8123
    python3 dev-server.py 3000     # a different port
"""

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # quiet: one line per image request isn't useful


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    print(f"Field Notes → http://localhost:{port}   (Ctrl+C to stop)")
    try:
        ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")
