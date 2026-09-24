# FINDINGS

## 未签名 base64 token + /notes IDOR + /admin/config 越权 → FLAG{api_chain_ok}
链路（仅访问 http://127.0.0.1:18081）：
1) GET / 返回端点与提示；GET /login 直接签发 token=base64({"uid":"1","user":""})，无签名/HMAC，可自行伪造 uid（E-002）。
2) IDOR：GET /notes?id=2 无鉴权即返回他人 note；带 uid=1 的 token 时 viewer="1"，说明只按 ?id= 取数、不校验属主，泄露 admin(bob,uid=2) 的 note "admin-secret-FLAG{idor_user2}"（E-003）。
3) 伪造 admin token base64({"uid":"2","user":""}) = eyJ1aWQiOiAiMiIsICJ1c2VyIjogIiJ9 后 GET /admin/config 由 403 "admin only" 变为 200 {"flag":"FLAG{api_chain_ok}","debug":true}（E-004）。
4) /files?name=server.py 泄露源码，确认 USERS/NOTES 结构与 FLAG 常量，与上述返回一致（E-005）。
主 FLAG：FLAG{api_chain_ok}；副产物（IDOR 泄露）：FLAG{idor_user2}。
evidence: E-002, E-003, E-004, E-005

