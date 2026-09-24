# FINDINGS

## IDOR 读 note + 可伪造 base64 admin token，双链取到 FLAG
靶场 weblab-api（http://127.0.0.1:18081，已授权 exact 匹配）存在两条可利用链：
1) IDOR：/notes?id= 完全不校验归属与鉴权，直接枚举 id=1..2 即读到他人笔记 id=2 -> "admin-secret-FLAG{idor_user2}"（E-002）。
2) Admin token 链：/login 返回 token=base64(json{uid,user})，user 字段客户端可控；注入 user=admin 得到 uid=2 的 admin token，携 Authorization: Bearer 访问 /admin/config 返回 {"flag": "FLAG{api_chain_ok}", "debug": true}（E-003）。无 token 时 403，对照证明鉴权仅依赖可伪造的自解码 token。
附带：/files?name= 回显服务端绝对路径（信息泄露），靶场内无对应文件，未进一步利用。
evidence: E-002, E-003

