# FINDINGS

## Compromise of web app by 198.51.100.66: brute force → admin → webshell upload → C2 beacon to 203.0.113.9
Attacker IP: 198.51.100.66 (external). Attack chain (line refs vs numbered log, E-002): (1) Credential brute force — 5x POST /login 401 user=admin, L6-10, 1 request/sec, 10:00:12-16Z; (2) Brute-force success — POST /login 200 note=success_after_burst, L11, 10:00:17Z; (3) Post-auth access — GET /admin 200, ua=curl/8.0 (non-browser, scripted), L12, 10:00:18Z; (4) RCE via webshell upload — POST /upload 200 file=shell.php (event tagged `rce`), L13, 10:00:19Z; (5) C2 callback — egress OUT 443 dst=203.0.113.9 note=c2_beacon, L14, 10:00:20Z. Full kill chain compressed into 9 seconds (10:00:12→10:00:20Z).

IOCs:
- IP (attacker): 198.51.100.66 (L6-13)
- IP (C2): 203.0.113.9:443/TCP (L14)
- Filename: shell.php (L13)
- Endpoint: POST /upload (L13)
- UA: curl/8.0 on /admin (L12)
- Account: user=admin compromised (L11)
- Pattern: 5x 401 then 200 within 5s (rate-limit/lockout absent)

Noise / not the attacker: 10.0.0.5 (L1-5, L15-16) is internal, 3 failed logins + guest fail at 10:01:00Z — pre-attack baseline/benign, no /admin or /upload activity; low-priority review only.

Remediation: block 198.51.100.66 + 203.0.113.9, rotate admin creds, quarantine/remove shell.php, hunt for further egress to 203.0.113.9, add login rate limiting/lockout.
evidence: E-002

