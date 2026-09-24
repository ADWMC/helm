# CASE

status: closed — 3 findings, 6 evidence items

## resume
1. goal: Assess http://127.0.0.1:18081 (weblab-api) for IDOR, weak/forgable token, path traversal; evidence-backed findings + scope proof.
2. samples: http://127.0.0.1:18081 (loopback-only lab; `labs/weblab-api/server.py`)
3. key params: route=web · requests≈30 · read-only GETs · traversal reads bounded to repo `labs/`
4. open questions: none — all three advertised flaw classes reproduced with negative controls
5. next: remediation review / retest after fixes (see findings.md)
6. evidence ids:
- E-002 root + endpoint enum (curl) + route_task=web
- E-003 /login token issuance + decode (weak token)
- E-004 IDOR on /notes with controls
- E-005 forged base64 token -> /admin/config + controls
- E-006 path traversal + absolute-path disclosure on /files
- E-007 root-cause source labs/weblab-api/server.py
