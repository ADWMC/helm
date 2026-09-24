## Report — http://127.0.0.1:18080 (scope: this host only)

**helmpi_status (called once):**
```
activation: helmpi | run.enabled: true | scope.enforce: true highRisk=deny
supervise: true | breach: wash+refusal+hcot+stream
HELPI_RUN=unset | HELPI_HCOT_AUTOHOOK=1
```

**Routing:** `route_task` → PRIMARY `har` (HTTP session); case workspace opened at `./case-18080`.

### 1. Enumeration (E-002, E-003)
- `GET /` → **200**, `Server: BaseHTTP/0.6 Python/3.13.8`, 150 B, "VulnCMS" with links `/login`, `/dashboard`
- Path probe (status/size): `/login` **200/308**, `/dashboard` **200/33**, everything else (`/admin`, `/api`, `/users`, `/auth`, `/signup`, `/index.html`) → 200/150 fallback — server returns **200 for unknown paths** (no 404 oracle)

### 2. Login endpoint
- **`POST /login`**, form params `user`, `pass` (HTML form action confirms it). `/dashboard` is a 33 B stub (`<h1>Dashboard</h1><p>Welcome.</p>`) served after auth.
- Page hint literally advertises: *"classic SQLi on user field. admin/admin123 if you prefer."*

### 3. SQLi probe — one benign tautology, with controls (E-004)
| Request | Response |
|---|---|
| `user=' OR '1'='1' -- -`, `pass=x` | **200 `Logged in`** — `Welcome ' OR '1'='1' -- -` + `Flag: FLAG{helmpi_local_lab_ok}` |
| control: `user=nosuchuser123&pass=wrong` | `Login failed / Invalid credentials` |
| control: `user=admin&pass=admin123` | `Logged in` + same flag |

### Findings
1. **Confirmed SQLi in `user` (auth bypass)** — arbitrary password authenticates via tautology while a non-matching user fails; differential isolates the injection point. Finding recorded: *POST /login vulnerable to classic SQL injection* [E-002, E-003, E-004].
2. **Reflected unescaped input** — raw payload echoed into HTML → secondary XSS surface.
3. **Weak identification** — 200-for-all-paths + plaintext hint/flag disclosure in responses.
4. Probe was read-only auth-bypass only; no destructive/extractive payload used; all traffic confined to `127.0.0.1:18080`.
