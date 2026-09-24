# FINDINGS

## IDOR on /notes?id= leaks admin note FLAG{idor_user2}
GET http://127.0.0.1:18081/notes?id=2 with no credentials returns {"id":"2","note":"admin-secret-FLAG{idor_user2}","viewer":null}. Handler reads NOTES[nid] without comparing the caller uid to note owner, so horizontal/vertical privilege escalation is trivial. Same request for id=1 returns alice-note, id=0 -> "no note".
evidence: E-003, E-006, E-002

## Unsigned base64 uid token -> admin /admin/config yields FLAG{api_chain_ok}
Chain: (1) weak /login issues admin token for any {"user":"admin"} POST with no password check -> token eyJ1aWQiOiAiMiIsICJ1c2VyIjogImFkbWluIn0= (uid=2); (2) equivalent offline forgery b64({"uid":"2"}) = eyJ1aWQiOiIyIn0=; (3) GET /admin/config?token=eyJ1aWQiOiIyIn0= or Authorization: Bearer <uid2 token> returns {"flag":"FLAG{api_chain_ok}","debug":true}, while no token returns 403 {"error":"admin only"}. _auth_user only base64-decodes and compares uid=="2", no signature/secret.
evidence: E-005, E-004, E-006, E-002

