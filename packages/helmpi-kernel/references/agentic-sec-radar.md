# Agentic 安全技术雷达（radar）

> **定位**：选型/调研用雷达，**不是运行时知识** —— 不注入 system prompt、不作 Agent 指令（P3/P9）。
> **来源**：`reference/repos/awesome-cybersecurity-agentic-ai`（README 7 类目）+ 其他精读仓交叉验证。
> **何时读**：设计新机制前查「是否已有成熟做法」；**不用于**：会话内知识面（那里走 `read_reference`）。

## 7 个 helm-pi 尚未覆盖的方向

| # | 方向 | 代表做法（来源仓） | 对 helm-pi 的潜在落点 | 状态 |
|---|------|--------------------|----------------------|------|
| 1 | **工具/技能供应链扫描** | Aguara 173 规则静态扫 · SkillPreflight 装前评分+SARIF · skillock SHA256 lockfile · Lazaretto OSV 装前验证 | `reference/repos/**` 与第三方 skill 装载前校验 | 未覆盖（雷达项） |
| 2 | **MCP 授权门/代理** | haldir scoped sessions+audit · Pipelock 扫 MCP 流量 · Armorer 执行前拦危险 tool-call | ✅ **已落地**：`src/host/mcp-bridge.ts` ScopeGate+risk 阶梯（2026 Wave 4） | **done（自有实现）** |
| 3 | **可验证/签名回执** | Pipelock signed action receipts · MAREF Merkle audit chain | 升级 P4/I5（现有为子串校验） | 单独立项（L，改 I5 需先动 INVARIANTS） |
| 4 | **失败模式语料** | agentic-anti-patterns：20 个带症状/根因/检测法的失败模式（注入经工具输出、MCP 信任边界崩塌、autonomy creep…） | `src/breach/` 对照测试语料 | 部分（breach 已有自有检测；语料吸收待办） |
| 5 | **执行隔离** | brood-box microVM+egress · Reverser Space 隔离+人监 | Run 执行沙箱 | 单独立项（L，涉执行模型；违「不做强制 Docker」需绕开） |
| 6 | **动态风险评估** | arXiv 2505.18384 针对攻击性 agent 的动态风险评估 | supervise 策略输入升级 | 未覆盖（雷达项） |
| 7 | **评测数据集** | CTF write-ups · CICIDS · CyberBattleSim | docs/tests 弹药（R 门任务难度池） | 部分（labs 五靶场自有；数据集未引） |

## 明确不吸收（对齐 §3 不吸收清单）

- 通用框架（LangChain/CrewAI/AutoGen/Semantic Kernel）→ P10 宿主是 Pi/OMP；
- SaaS 平台条目（Trent/Vulert/Redcells 等）→ 非目标域；
- Learning/Communities 条目 → 不进运行时知识面（历史只读原则）；
- 训练平台（CyberBattleSim 作为训练器）→ helm-pi 不做训练。

## 维护

- 新方向：加行 + 来源行号；**本文件永不进 system prompt**；
- 落地实现后，状态列改 `done（自有实现）` 并链到 `src/` 文件。
