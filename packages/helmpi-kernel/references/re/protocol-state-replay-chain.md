# Chain: 私有协议状态与重放面

## Scenario
授权实验室内自定义端口服务（18080-18084 档位或 Spec 列明的其他本地口）,
有抓包或可产生流量;目标=画出协议状态机并验证"请求可否被原样重放/状态是否可回退"。

## 信号（可复现）
```bash
curl -s -m 3 -D - http://127.0.0.1:<port>/ -o /tmp/p1.bin   # 首包四元组与体
xxd /tmp/p1.bin | head -8                                   # magic/长度域
curl -s -m 3 -D - -H 'X-Seq: 0' http://127.0.0.1:<port>/next -o /tmp/p2.bin && xxd /tmp/p2.bin | head -8
```
判定:响应含自定义 magic/序号域且 `/next` 类推进端点存在 → 进链;纯标准 HTTP 面 → 终止
（走 web playbook,不重复建链）。

## 方法
首包字段 → 序号/状态变量假设 → 推进与回退实验（**只在授权端口**）→ 重放判定 → 证据=逐包 diff。

## 攻击链
1. 首包与基准字段提取 → 存证（`-D -` 头+`xxd` 体,双 E-id）。
2. 假设状态字段:构造 `X-Seq: n` 三连（0,1,0）→ 体 diff → 状态机三态假设（单调/回退/无状态）。
3. 重放:原样重发首包 → 比对响应（相同=可重放;含一次性 nonce 则不可,记 nonce 位点）。
4. 越权回退:若回退成功 → 触及权限面 → **先 `validate-scope`**,在册才继续;不在册=记录拒绝行
   （G2 拦截本身是证据,不绕）。
5. 报告: 字段表 / 状态机假设与实验序号 / 重放结论(可/否+条件) / nonce 机制（若有）。

## 工具映射
bash（curl/xxd/diff）→ `helmpi_validate_scope`（推进前）→ `save_evidence`（包对）→
`record_finding`（可重放/可回退=finding;被拦=coverage 行）。
