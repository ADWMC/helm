# FINDINGS

## FLAG{idor_user2} — /notes 无鉴权 IDOR
/notes?id= 无鉴权且不校验所有权，遍历 id 即读取他人笔记。id=2 返回 admin 秘密笔记 {"id":"2","note":"admin-secret-FLAG{idor_user2}"}（id=3 不存在）。漏洞根因：缺少认证 + 缺少对象级授权（BOLA/IDOR）。
evidence: E-002, E-003

## FLAG{api_chain_ok} — 伪 base64 admin token 链访问 /admin/config
login 接受任意 user 参数（?user=admin → uid=2），token 仅为 base64({"uid":"2","user":"admin"})，无签名。/admin/config 无 token 返回 403 "admin only"；携带 Authorization: Bearer <token> 或 ?token=<token> 返回 {"flag":"FLAG{api_chain_ok}","debug":true}。根因：可伪造凭证 + 服务端仅解码不验签。/files 存在路径拼接但靶场内无 flag 文件（见 E-005）。全程仅访问 127.0.0.1:18081。
evidence: E-004, E-005, E-002

