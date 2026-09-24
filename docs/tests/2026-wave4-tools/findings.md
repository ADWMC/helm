# FINDINGS

## Unauthenticated IDOR + forged admin token chain on weblab-api yields two flags
On http://127.0.0.1:18081 (weblab-api): (a) IDOR on GET /notes?id= returns any user's note without auth — id=2 exposed "admin-secret-FLAG{idor_user2}"; (b) GET /login?user=admin issues a valid unsigned base64 admin token (uid=2) with zero credential checks; (c) that token as Authorization: Bearer / ?token= unlocks GET /admin/config returning FLAG{api_chain_ok} plus debug:true. Impact: full anonymous vertical+horizontal privilege compromise. Evidence: E-002, E-003, E-004, E-005, E-006 (scope: E-001).
evidence: E-001, E-002, E-003, E-004, E-005, E-006

