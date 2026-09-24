# CASE

status: solved

## resume
1. goal: 在 http://127.0.0.1:18081（本地授权靶场）完成 IDOR / admin token 链，拿到 FLAG 并落盘证据
2. samples: http://127.0.0.1:18081 （唯一授权目标，全程仅访问该地址）
3. key params:
   - 弱认证: GET /login?user=admin → uid=2 token（无凭据校验）
   - token = base64(json {uid,...})，无签名/无过期
   - admin 鉴权: _auth_user() 解出 uid == "2" 才放行 /admin/config
   - IDOR: /notes?id= 不校验 uid 与 note 归属
   - 路径穿越: /files?name= 拼接目录，可读 server.py（500B 截断）
4. open questions: 无
5. next: 无（已拿两条 FLAG）
6. evidence ids:
- E-001 case-open
- E-002 GET / 枚举 + hint
- E-003 /login?user=admin 换发 uid=2 token
- E-004 /admin/config 200 → FLAG{api_chain_ok}（含 403 负对照）
- E-005 /notes?id=2 IDOR → FLAG{idor_user2}（含 viewer 身份证据）
- E-006 /files 路径穿越读源码

## FLAGs
- FLAG{api_chain_ok}   (admin token 链 → /admin/config)   证据 E-003, E-004
- FLAG{idor_user2}      (IDOR → /notes?id=2)              证据 E-005
