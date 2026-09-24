# ATT&CK 覆盖表（生成文件，勿手改）

> 由 `node tools/attack-coverage.mjs` 生成；单源 = 各 playbook 的 `attack:` 字段。

| T-ID | 覆盖 playbook |
|------|---------------|
| T1078 | api, web-pentest |
| T1190 | api, web-pentest |

**统计**：unique techniques = 2 · 覆盖 playbook = 2/4

## 各 playbook

- `api`: T1190, T1078 — API 安全测试
- `ctf`: _(无 attack 标注)_ — CTF
- `reverse`: _(无 attack 标注)_ — 逆向分析
- `web-pentest`: T1190, T1078 — Web 渗透
