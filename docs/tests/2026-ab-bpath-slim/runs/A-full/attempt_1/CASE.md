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
- E-002 GET / service index + hint (curl)
- E-003 IDOR: GET /notes?id=2 unauthenticated returns admin note with FLAG
- E-004 Weak login: POST /login {"user":"admin"} issues uid=2 (admin) token
- E-005 Forged token b64({"uid":"2"}) -> GET /admin/config returns admin FLAG
- E-006 Server source labs/weblab-api/server.py confirming IDOR + unsigned token
