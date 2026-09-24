# CASE

status: open

## resume
1. goal:
2. samples:
3. key params:
4. open questions:
5. next:
6. evidence ids:
- E-001 case-open
- E-002 recon: GET / service index
- E-003 IDOR: GET /notes?id=2 unauthenticated
- E-004 admin token chain: /login forge -> /admin/config FLAG
- E-005 /files arbitrary-read probe (no flag stored)
