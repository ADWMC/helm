# FINDINGS

## IDOR on /notes leaks other users' notes without auth
GET /notes?id=2 with no authentication returns {"note": "admin-secret-FLAG{idor_user2}"}. Ownership is never checked, so any id is enumerable (id=0,3-6 return "no note"). FLAG: FLAG{idor_user2}
evidence: E-002, E-003

## Unsigned base64 token forgery escalates to admin /admin/config FLAG
Token is merely base64({"uid":"2","user":"admin"}) with no signature; POST /login issues one and it is trivially forgeable. Presenting it via Authorization: Bearer or ?token= to /admin/config bypasses the 403 "admin only" and returns {"flag": "FLAG{api_chain_ok}", "debug": true}. FLAG: FLAG{api_chain_ok}
evidence: E-004

## Secondary: /files unauthenticated arbitrary file read (no flag present)
/files?name= reads files relative to labs\weblab-api without auth; probing flag/flag.txt/FLAG/notes/README all returned Errno 2, so flags were not stored there.
evidence: E-005

