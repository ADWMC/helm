# helm-pi references 总索引

> 知识按需读，不注入 system prompt（E5/P3）。**每行 = 发现信号**：做什么 · Use when · 不用于（负触发）· 关键词 —— Anthropic-Skills「description 是唯一发现信号」规范。命中再展开正文。

- `playbooks/api.yaml` — API/IDOR/鉴权链阶段门 · Use when: REST/IDOR/token 链任务 · **不用于**: 二进制（→reverse）、IR（→blue-ir） · kw: IDOR token authz api
- `playbooks/web-pentest.yaml` — Web 渗透阶段门（scope→recon→enum→test→exploit→verify→report→close）· Use when: HTTP 面授权测试 · **不用于**: 纯 API 任务（→api.yaml） · kw: web sqli xss http
- `playbooks/ctf.yaml` — CTF 多步拼 flag 阶段门 · Use when: 靶机打 flag · **不用于**: 报告型审计 · kw: ctf flag chain
- `playbooks/reverse.yaml` — 逆向分析阶段门 · Use when: 样本/二进制研判 · kw: reverse entropy packer
- `attack-coverage.md` — **生成文件**：playbook × ATT&CK 技术覆盖表 · Use when: 查技术映射 · **不用于**: 手改（单源=各 YAML `attack:` 字段）
- `attack-navigator.json` — ATT&CK Navigator layer（生成）· Use when: 导入 Navigator 可视化覆盖
- `agentic-sec-radar.md` — agentic 安全**技术雷达**（7 个未覆盖方向）· Use when: 选型/新机制调研 · **不用于**: 运行时注入、系统提示、Agent 指令（雷达≠知识） · kw: radar mcp receipt sandbox anti-pattern
- `toolbox/decision-tree.md`、`toolbox/methodology.md` — 分诊与方法论（**待迁入**，当前缺 → 路由走 `route_task`）

垂直域：android / web / native / protocol / malware / ai-security / evidence / blue —— 各域 `index.md` 按需添加，**每行遵守上面四要素**（缺失域不建空文件）。
