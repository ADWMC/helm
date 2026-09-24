# FINDINGS

## Login endpoint identified: POST /login (VulnCMS)
Scope http://127.0.0.1:18080 only. The app (VulnCMS, BaseHTTP/0.6 Python/3.13.8) exposes exactly two distinct pages: / (index) and /login; /dashboard is a third distinct page. All other probed paths (/admin, /robots.txt, /signup, /register, /logout, /api, /static) return the 150-byte index body (catch-all, no real endpoints). Login endpoint: POST /login with form fields `user` and `pass` (page itself hints "classic SQLi on user field"). /dashboard is reachable without auth pre-login but is a static stub.
evidence: E-002

## Confirmed SQL injection auth bypass on /login user field (one benign probe)
Single probe: POST /login with user=' OR '1'='1 and pass=probe (arbitrary password). Response was HTTP 200 "Logged in" with server-issued flag FLAG{helmpi_local_lab_ok}, proving the credentials are interpolated into a SQL query unsanitized and the tautology bypasses authentication (boolean-based SQLi, classic login bypass). No error-based leakage needed. Secondary observation: payload reflected verbatim into HTML (unencoded), implying reflected XSS, but not tested per scope. Remediation: parameterized queries / prepared statements, plus output encoding; the endpoint also leaks a lab flag on success.
evidence: E-003

