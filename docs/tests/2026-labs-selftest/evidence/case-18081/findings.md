# FINDINGS — weblab-api (http://127.0.0.1:18081)

**Scope respected:** every request went to `http://127.0.0.1:18081` (≈30 requests, curl, read-only GETs). No other host or port was contacted. File reads via `/files` were deliberately bounded to this repo's `labs/` tree. `route_task` → PRIMARY=web.

**Target:** `labs/weblab-api/server.py`, `HTTPServer(("127.0.0.1", 18081))`, BaseHTTP/0.6 Python/3.13.8.

## 1. IDOR / missing object-level auth on `/notes` — unauthenticated read (E-004, E-007, E-002)
`GET /notes?id=2` returns `admin-secret-FLAG{idor_user2}` to a `uid=1` token (`viewer:"1"`), and — worse — returns it with **no token at all** (`viewer:null`) or with `token=garbage`. The token is echoed as `viewer` but never compared to the note owner (`# IDOR: does not check uid vs note id`).
Controls: `id=3..6` → 404 `no note`, so the 200s are not a fallback; they are the two real objects, fully world-readable.
**Impact:** unauthenticated horizontal data read of every note; flag `FLAG{idor_user2}` disclosed.

## 2. Unsigned base64 token = forgeable authority → admin bypass on `/admin/config` (E-005, E-003, E-007)
The bearer token is `base64({"uid","user"})` with no MAC/secret/expiry; `_auth_user()` merely decodes it. Minting offline `base64('{"uid":"2"}')` = `eyJ1aWQiOiIyIn0=` yields `200 {"flag":"FLAG{api_chain_ok}","debug":true}` — unauthenticated → admin.
Controls prove `uid` is the sole decision: forged `uid=1`, `token=garbage`, and no token all → `403 {"error":"admin only"}`; the legitimate `user=admin` token → 200.
Aggravating: `GET/POST /login` grants a `uid=2` token to anyone typing `user=admin` (no credential check) and issues valid tokens for arbitrary nonexistent usernames (`alicezzz_nosuch` → uid 1).
**Impact:** any identity assumable, admin config + flag `FLAG{api_chain_ok}` disclosed.

## 3. Path traversal in `/files` + absolute-path disclosure (E-006, E-007, E-002)
`name` is url-decoded and joined onto the server's own directory with no `realpath`/`commonpath` containment: `os.path.join(os.path.dirname(__file__), name)`.
Evidence: `name=server.py` → 200 full source (leaks `USERS`/`NOTES`/`FLAG`); `name=../README.md` → 200 `labs/README.md`; percent-encoded `%2e%2e%2fREADME.md` → 200 (encoding not a mitigation).
Controls: `name=does_not_exist.txt` → 404; default `GET /files` → 404 carrying the raw errno with absolute base path `…\helm-pi\labs\weblab-api\readme.txt` (info disclosure). Reads capped at 500 chars.
**Impact:** arbitrary local file read as the server process + path disclosure aiding further traversal.

## Chain (lab solved end-to-end)
`GET /` (banner+hint) → `/login?user=alice` (token) → `/notes?id=2` (IDOR, `FLAG{idor_user2}`) → forge `{"uid":"2"}` → `/admin/config` (`FLAG{api_chain_ok}`) → `/files?name=../…` (traversal + source).

## Remediation
1. **BOLA:** resolve the note's owner server-side and compare to the *authenticated* subject; reject when unauthenticated. Never trust `id` alone.
2. **Token:** sign state (HMAC/JWT with server secret, or server-side sessions with random IDs + TTL); authorize on a claims lookup, not a client-declared `uid`. `/login` must verify a credential.
3. **Traversal:** `p = os.path.realpath(os.path.join(BASE, name))` and require `os.path.commonpath([BASE, p]) == BASE` before opening; return generic errors instead of `str(e)`.

Evidence: E-002 … E-007 in `evidence/`.
