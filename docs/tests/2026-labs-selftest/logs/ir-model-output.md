## IR Report — `GET /logs` @ 127.0.0.1:18084

**Attacker IP: `198.51.100.66`** — full kill chain in 9 seconds (10:00:12 → 10:00:20Z).

### Attack chain (line refs = numbered log)

| # | Time (Z) | Step | Evidence |
|---|---|---|---|
| 1 | 10:00:12–16 | **Brute force**: 5× `POST /login` 401, `user=admin`, 1 req/s | L6–10 |
| 2 | 10:00:17 | **Credential success**: `POST /login` 200, `note=success_after_burst` | L11 |
| 3 | 10:00:18 | **Post-auth recon**: `GET /admin` 200, `ua=curl/8.0` (scripted, non-browser) | L12 |
| 4 | 10:00:19 | **RCE / webshell**: `POST /upload` 200, `file=shell.php` (event tagged `rce`) | L13 |
| 5 | 10:00:20 | **C2 beacon**: egress `OUT 443 dst=203.0.113.9`, `note=c2_beacon` | L14 |

### IOCs
- **Attacker IP**: `198.51.100.66` (L6–13)
- **C2 IP**: `203.0.113.9:443/TCP` (L14)
- **File**: `shell.php` via `POST /upload` (L13)
- **UA**: `curl/8.0` on `/admin` (L12)
- **Account**: `admin` compromised (L11)
- **Pattern**: 5× 401 → 200 in 5s — no rate-limit/lockout

### Not the attacker
`10.0.0.5` (L1–5, L15–16): internal, 3 failed logins + a `guest` 401 at 10:01:00Z, never touched `/admin` or `/upload` — benign baseline; low-priority credential review only.

### Actions
Block `198.51.100.66` + `203.0.113.9`, rotate `admin` creds, quarantine `shell.php`, hunt egress to `203.0.113.9`, add login rate limiting.

---
Case `cases/st-ir`: evidence **E-002** (full numbered log), finding recorded citing E-002. Raw copy: `cases/st-ir/samples/access.log`.
