# FINDINGS

## IDOR：/notes?id= 无所有权校验，可读取 admin 笔记
GET /notes?id=2 在无任何鉴权下返回 {"id":"2","note":"admin-secret-FLAG{idor_user2}"}，id=1 返回 alice 自己的笔记，id=0/3/4/5 无记录；说明 /notes?id= 只按 id 取值、不校验调用者身份/所有权，可枚举读取他人（admin uid=2）笔记。泄露 FLAG：FLAG{idor_user2}。
evidence: E-002

## 弱 token（base64 uid 无签名）伪造为 admin，打通 /admin/config 拿到主 FLAG
1) token=base64({json uid})，无签名/无服务端会话：/login 不校验凭据恒发 uid=1 token。2) 源码/行为显示 USERS["2"].role=admin，伪造 base64('{"uid": "2"}') = eyJ1aWQiOiAiMiJ9。3) /admin/config 接受 Authorization: Bearer eyJ1aWQiOiAiMiJ9 或 ?token=eyJ1aWQiOiAiMiJ9，返回 {"flag":"FLAG{api_chain_ok}","debug":true}；无 token 或错误 header（X-Token/Token/Cookie 等）返回 403 admin only。附带 /files?name=../server.py 路径穿越可读服务源码与绝对路径泄露，确认链路。
evidence: E-003, E-004, E-005

