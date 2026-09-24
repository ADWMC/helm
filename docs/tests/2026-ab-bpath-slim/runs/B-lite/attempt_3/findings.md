# FINDINGS

## weblab-api: 弱认证换发 admin token → /admin/config 拿到 FLAG{api_chain_ok}
攻击链（全部对 http://127.0.0.1:18081，curl 完成）：
1) GET /login?user=admin 不校验任何凭据，直接签发 uid=2(admin) 的令牌 eyJ1aWQiOiAiMiIsICJ1c2VyIjogImFkbWluIn0= = base64({"uid":"2","user":"admin"})；令牌仅 base64、无签名，也可手工伪造 eyJ1dWQiOiAiMiJ9。
2) GET /admin/config?token=<uid2 token>（或 Authorization: Bearer <token>）→ HTTP 200 {"flag": "FLAG{api_chain_ok}", "debug": true}。
3) 负对照：uid=1 token 或无 token → 403 admin only，证明鉴权只比对 uid=="2"。
根因：/login 以明文 user 参数直接决定 uid；_auth_user() 只 base64 解码取 uid，无签名/过期/服务端会话。
附带漏洞：/files?name= 路径穿越可读 server.py 源码（500 字节截断），泄露 FLAG 与 NOTES 常量。
FLAG: FLAG{api_chain_ok}
evidence: E-002, E-003, E-004, E-006

## weblab-api: /notes?id= IDOR 未校验归属 → FLAG{idor_user2}
GET /notes?id=2 无需任何认证即可读取 admin/bob 的私有 note：{"id":"2","note":"admin-secret-FLAG{idor_user2}","viewer":null}。
带 uid=1 普通用户 token 请求时返回 viewer:"1"，证明服务端已解析出请求者身份却仍不做 uid==note.owner 校验（源码注释亦标记 "IDOR: does not check uid matches note id"）。
id=3/999/-1 返回 404 no note，确认可枚举且仅有 1、2 两条记录。
FLAG: FLAG{idor_user2}
evidence: E-005, E-002

