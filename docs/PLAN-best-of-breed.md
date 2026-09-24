# helm-pi 最佳方案（Best-of-Breed）v1

> **原则**：每个问题只取一个最佳做法，**不**把六家流程缝成一团。  
> 来源：`process-methodology-comparison.md` · `mature-projects-comparison.md`  
> 状态：P0 本迭代实现；P1/P2 可排期。

---

## 0. 选型总表（只留一个答案）

| 问题 | **采用** | 不采用（及原因） | 实现层 |
|------|----------|------------------|--------|
| 范围硬边界 | **PentestGPT 字节白名单 + ScopeGate** | helm-d 纯 persona | 已有 `scope.ts` |
| 单步/整跑完成 | **PG：done_when + exact quote + finish_basis** | 凭关案文案 | 已有 `completion` + `evidence` |
| 领域阶段 | **自研 Playbook YAML + Domain 拒 next** | PentAGI 长 prompt 清单进门禁 | **P0 接 Loop** |
| 长程多路探索 | **Cairn 图（可选 Run 策略）** | 过早多 Worker | P2 |
| 任务最小化 | **PG：一次只一个 evidence-backed step** | 投机 backlog | Loop 已有 |
| 收敛防空转 | **自研车道：同 kind 上限 → failed=convergence** | 只靠 Mentor | Loop 部分有 |
| 防卡死限额 | **PentAGI supervise 硬限额** | 只写在文档 | 已有 `supervise.ts`，P1 挂长任务 |
| 领域知识 | **helm-d：references 按需读** | 塞 system prompt | 已有 |
| 范围开工前 | **PentAGI SOW 模板** | 无 | 已有 |
| 专家角色切换 | **CAI：/agent 切域（弱实现即可）** | 一上来 Swarm | P2 |
| 写码/工具节制 | **Ponytail 阶梯 + 档位** | 整包装 ponytail | 纪律已有，**P0 落地 lite** |
| 规模与速度 | **纪律 7：小任务不比秒表** | 用玩具题否定 harness | 已写文档 |
| 效率上下文 | **SoL-Pi 共存** | 内嵌 fork | 已有 COMPAT |
| 阶段可读叙述 | **helm-d 式 playbook 散文在 references** | 长 SOP 进每轮 prompt | 已有 |
| 测试 | **本仓 STANDARD + 同规模档** | 混规模比墙钟 | 已有 |

**一句话**：  
**Scope/完成 用 PG；阶段 用自研门；长程 用 Cairn（可选）；清单 用 references；档位 用 lite/full；角色用 CAI 点缀；知识用 helm-d；效率用 SoL-Pi 共存。**

---

## 1. 架构形状（定稿）

```text
Spec/SOW ──► ScopeGate（PG）
                 │
     ┌───────────┴───────────┐
     ▼                       ▼
 Session（人在环）         Run（自治）
  纪律七条                  Propose → compile
  references 按需            Playbook.gate 拒非法 next
  mode=lite|full|deep        完成四态 + finish_basis
  hint 菜单                  converge 车道
     │                       │
     └────────► 同一 Ledger / Evidence ◄────────┘
                      │
                 SoL-Pi（效率，共存）
```

---

## 2. P0（本迭代做）

| ID | 项 | 验收 |
|----|----|------|
| **P0-1** | **Playbook 当前阶段入 Ledger + Loop/提案强制 `canEnterNext`** | 非法 `next` → 明确错误/blocked，不静默进阶 |
| **P0-2** | **`analysisMode: lite\|full\|deep` 配置 + 扩展行为** | lite：状态标明 lite；工具描述引导**默认少跳** route/reference；`helmpi_mode` 可读可切 |
| **P0-3** | **收敛车道已在 Loop**（同 kind 上限） | 测试已有 convergence_failed；保持并文档化 |
| **P0-4** | 方法论/Ponytail 对齐文案已存在 | 不重复写长文 |

### P0-2 lite 行为定义（避免再扫成「慢就是差」）

| mode | 默认工具习惯 | 证据 |
|------|--------------|------|
| **lite** | 可 `route` 一次或直接干；**默认不** skill_index + 多篇 reference；**不要求** status | 单证据行或直接答 |
| **full** | route ≤1 + index≤1 + 按需 ref≤2 + 标准 save_evidence | E-id |
| **deep** | 全 playbook 多 evidence + findings | E + findings |

配置键：`session.analysisMode`（默认 **full**，小任务可 `lite`）。

---

## 3. P1

- web/ctf playbooks 补齐 **可 gate 的 deliverable 键**  
- supervise 真挂到长 Run 的 step 内  
- `/helmpi mode lite` 与分析档打通  
- 大任务测试套件（比完成不比秒）

## 4. P2

- Cairn 式并行 Direction 策略开关  
- CAI 式 `/helmpi agent <domain>`  
- Console 图 UI  

## 5. 明确不做

- 不缝合六家源码  
- 不把 PentAGI 长清单当 system prompt  
- 不用玩具题墙钟裁决产品  
- 不在 DESIGN 写 src 包树  

---

## 6. 实现顺序

1. Plan 文档（本文件）  
2. Ledger `phase` + `advance_phase` / 提案阶段校验  
3. config `analysisMode` + 扩展 `helmpi_mode` + lite 工具描述  
4. 测试 + `npm run check`  
5. 提交

---

---

## 7. 实现状态

- [x] P0-1 Playbook 阶段门硬拒（phase.ts + applyProposal）
- [x] P0-2 analysisMode lite/full/deep + helmpi_mode + `/helmpi mode`
- [x] P0-3 收敛车道（loop 同 kind 上限）
- [x] P1 web-pentest / ctf / reverse 可 gate deliverable 键
- [x] P1 supervise 挂入 Run Loop
- [x] P1 Loop `opts.playbook` 强制 phaseId 门
- [x] P1 完成向多阶段测试（不比墙钟）
- [x] `npm run check` 全绿

## 8. 仍属 P2（本迭代不做）

- 并行 Direction、`/helmpi agent`、Console 图 UI

