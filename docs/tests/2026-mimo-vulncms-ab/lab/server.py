#!/usr/bin/env python3
"""Minimal local SQLi lab (authorized localhost only). Port 18080."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

USERS = {"admin": "admin123", "guest": "guest"}
FLAG = "FLAG{helmpi_local_lab_ok}"


class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[lab] {self.address_string()} {fmt % args}", flush=True)

    def _html(self, body: str, code: int = 200):
        data = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/login"):
            self._html(
                """<!doctype html><html><body>
<h1>VulnCMS Login</h1>
<form method="POST" action="/login">
<label>user <input name="user"></label><br>
<label>pass <input name="pass" type="password"></label><br>
<button>login</button>
</form>
<p>Hint: classic SQLi on user field. admin/admin123 if you prefer.</p>
</body></html>"""
            )
        elif self.path.startswith("/dashboard"):
            self._html("<h1>Dashboard</h1><p>Welcome.</p>")
        else:
            self._html(
                """<!doctype html><html><body>
<h1>VulnCMS</h1>
<ul>
<li><a href="/login">Login</a></li>
<li><a href="/dashboard">Dashboard</a></li>
</ul>
</body></html>"""
            )

    def do_POST(self):
        if not self.path.startswith("/login"):
            self._html("not found", 404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8", "replace")
        q = parse_qs(raw, keep_blank_values=True)
        user = (q.get("user") or [""])[0]
        pw = (q.get("pass") or [""])[0]
        # Vulnerable on purpose (local lab only)
        if user == "admin" and pw == "admin123":
            ok = True
        elif "'" in user or "--" in user or "or 1" in user.lower():
            ok = True
        else:
            ok = USERS.get(user) == pw
        if ok:
            self._html(
                f"<h1>Logged in</h1><p>Welcome {user}</p><p>Flag: {FLAG}</p>"
            )
        else:
            self._html("<h1>Login failed</h1><p>Invalid credentials</p>", 401)


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 18080), H).serve_forever()
