## Report — 127.0.0.1:18080 (scope: this host/port only)

**helmpi_status (called once, result included):**
```
activation: helmpi   run.enabled: true   scope.enforce: true (highRisk=deny)
supervise: true      breach: wash+refusal+hcot+stream
HELPI_RUN=unset      HELPI_HCOT_AUTOHOOK=1
```

### 1. Enumeration
| Path | Result |
|---|---|
| `GET /` | 200 — **VulnCMS** index, links → `/login`, `/dashboard` |
| `GET /login` | 200 — login form, `POST /login`, fields `user` / `pass` |
| `GET /dashboard` | 200 — "Dashboard / Welcome." (no auth observed) |
| `GET /admin` | 200 — unauthenticated |

Server: `BaseHTTP/0.6 Python/3.13.8`. Evidence: **E-002**.

### 2. Login endpoint
**`POST http://127.0.0.1:18080/login`** with form-encoded `user`, `pass` (rendered by `GET /login`). The page itself leaks: *"Hint: classic SQLi on user field. admin/admin123 if you prefer."*

### 3. SQLi — one benign probe
| Request | Response |
|---|---|
| baseline: `user=admin&pass=wrongpass` | **401** `Login failed / Invalid credentials` |
| probe: `user=admin'` (single trailing quote), same wrong pass | **200** `Logged in / Welcome admin'` + `FLAG{helmpi_local_lab_ok}` |

A lone `'` flipped 401→200 and was echoed raw → classic string-interpolated SQLi with auth bypass in one probe, plus reflected input. No further payloads sent. Evidence: **E-003**.

### 4. Findings
1. **Critical — SQLi auth bypass** on `/login` `user` field (confirmed, E-003). Fix: parameterized queries / server-side auth, not string concat.
2. **Medium — reflected input** in the greeting (`Welcome admin'`) → XSS-adjacent.
3. **Medium — authz gap**: `/dashboard` and `/admin` return 200 unauthenticated (E-002).
4. **Low — info disclosure**: self-identified "VulnCMS", framework banner, and an explicit hint with default creds on the login page.

Finding recorded in case `cases/helmpi-18080` citing E-002, E-003.
