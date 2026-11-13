"""Vercel entry point for the Al Doha Food dashboard.

Vercel runs Python as serverless functions, so the background thread that
app.py uses locally (live_loop) cannot run here. Instead, the simulated live
readings advance on demand: each /api/live request applies one tick per 3 s
that has passed since the last one (capped). Everything else is served by the
same Handler as `python app.py`.
"""
import mimetypes
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app  # noqa: E402

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

_last = {"t": 0.0}


def _catch_up():
    now = time.time()
    if not _last["t"]:
        app.live_tick()
        _last["t"] = now
        return
    steps = min(int((now - _last["t"]) // 3), 10)
    for _ in range(steps):
        app.live_tick()
    if steps:
        _last["t"] = now


class handler(app.Handler):
    def send(self, body, ctype, status=200, extra=None):
        # Vercel compresses responses itself; skip app.py's own gzip step.
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlparse(self.path).path == "/api/live":
            _catch_up()
        return super().do_GET()
