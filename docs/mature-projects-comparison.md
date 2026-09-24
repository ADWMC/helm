# 成熟项目横向对比（机制 · 完成 · 工程）

> **目的**：不是罗列功能，而是对比 **成熟安全 AI 项目怎么做「状态 / 完成 / 收敛 / 工程」**，给 helm-pi 当标尺。  
> **对象**：PentestGPT · Cairn · CAI · PentAGI（主对比）+ SoL-Pi / oh-my-pi（工程成熟度参照）+ helm-d（旧基线）。  
> **日期**：2026 · 源码均在 `reference/repos/`

---

## 0. 一张总表（先看骨架）

| 维度 | **PentestGPT** (agent) | **Cairn** | **CAI** | **PentAGI** | **helm-d** |
|------|-------------------------|-----------|---------|-------------|------------|
| 产品形态 | 可恢复的自主 pentest **运行时** | 通用状态空间 **搜索引擎**（pentest 是首个域） | 多智能体 **安全框架/REPL** | 全栈自治 **渗透平台** | DSH **安全分析插件** |
| 权威状态 | SQLite MemoryKernel + revision | SQLite/协议图（Fact/Intent） | 较弱（会话/JSONL 偏诊断） | PostgreSQL + Flow 树 | 会话 + CASE.md（弱） |
| 单步完成 | `done_when` + **exact receipt quote** | Intent **conclude → 一条 Fact** | 多靠 Agent 自报/continue | Action 树 + 限额 | 几乎无机器门 |
| 整任务完成 | `finish` + **finish_basis**（无 open work） | `POST …/complete`：**引用 Fact 边到 goal** + 可 `reopen` | continue 模式偏「别停」，完成语义弱 | Flow 报告/任务树状态 | `end_case` 字符串/计数门 |
| 语义目标 | 明确写：**结构完成 ≠ 语义**；要 **oracle** | 图上 complete 判断可错可 reopen | 竞赛/CTF 导向 | 自治渗透，非 BAS | 无 verifier |
| 收敛/防空转 | 类型硬边界、一次一任务、**实弹承认收敛是短板** | reason 看 open intents、max_intents、Hint 态势 | handoff/orchestration | Mentor 同工具阈值、硬限额、Reflector | advisory 采纳率，非收敛 |
| 角色模型 | **Supervisor + Executor** 两角色 | Worker 无角色（bootstrap/reason/explore 三**任务形**） | 十余领域 Agent + handoff | 专家 + Adviser/Planner/Reflector | 单 persona + 子代理 |
| 隔离边界 | **部署环境**（FULL_ACCESS） | 容器/本机 workspace | 多进程/工具层 guardrail | **Docker 沙箱 + 网络隔离** | 宿主沙箱/话术（弱） |
| 测试量级（本克隆） | ~12 模块测 + 集成 | ~13 | **555** py | **135** go/test | 22 个宿主 seam check |
| 成熟度一句话 | **完成链最硬，收敛未解决** | **图协议最干净，域语义靠 prompt** | **谱最宽，状态机最软** | **产品最全，栈最重** | **知识最厚，运行时最脆** |

---

## 1. 完成判定：四家怎么「宣布做完了」

### 1.1 PentestGPT —— 工业级「可拒收的完成」

**单步**（`compile_execution`）：

1. Executor 只能回 `done | progress | blocked | failed`。  
2. `done` **必须**有 Observation；excerpt 必须能在 **该 episode 的 grounding receipt** 里找到连续原文（仅允许 CRLF/LF）。  
3. 找不到 → 若有兑底 receipt 可标 `evidence_fallback`，**DONE 被降级为 PROGRESS**。  
4. quote 超长截断到 4000 → **只能 progress，截断永不完成**。  
5. 改写/转述 prior evidence → 丢弃，最多 progress。  
6. 无 action 的 attempt 可复用 **同任务** 精确旧 observation；**跨任务 observation 无效**。

**整 Run**（`compile_plan`）：

```text
finish 必须：
  - 无 BLOCKED/READY/ACTIVE 的 task
  - finish_basis_ids 非空 ⊆ observations
  - 每条 basis 的 producer task 必须 DONE
  - 不允许 finish 与 next_task_id 同时存在
```

**层级纪律**（防止类型穿越）：

- `TEST` 的 objective/done_when 里出现 “gain a shell / capture the flag…” → **计划校验直接失败**（TEST 不许偷跑 EXPLOIT）。  
- `EXPLOIT` 必须 cite **同 target 最新 DONE 的 TEST observation** 并 `depends_on` 该 TEST。  
- Diagnostic / attempt summary **永远不能**当 basis 或 finish。

**他们自己承认的完成缺陷**（HTB + architecture.md）：

| 问题 | 说明 |
|------|------|
| **收敛失败** | Q8 十几个任务全是 discover/enum，**从未进入 EXPLOIT** → 结构上合法，语义上永远完不成 |
| **校验过严无策略出口** | 非零退出/超长/改写 quote 导致 **run 中止或降级**，缺「提取后再钉」的自动恢复 |
| **结构 COMPLETED ≠ flag** | 必须另跑 `--expected-flag` audit |
| **turn 预算 ≠ 动作预算** | 单 episode 曾打出 28 条 command，turn 限制绑不住原生工具 |

**成熟点**：把「完成」做成 **可单测的编译器**；把「没完成」做成 **progress/blocked** 而不是假 done。  
**教训**：完成门再硬，也要配 **收敛策略**，否则变成「永远合法地不完成」。

---

### 1.2 Cairn —— 图上的完成是一条边 + 可撤销

**单步 explore**：

- 只服务一条 Current Intent；失败也允许结束，但必须 **充分探索过**。  
- 产出 **一条增量 Fact**（禁止把图里已有信息当新事实、禁止塞大 blob，大文件引用路径）。  
- **不输出 complete**（那是 reason/bootstrap 的事）。

**整项目 complete**（协议级）：

```text
POST /projects/{id}/complete
  from: 一串 Valid fact ids   （不得含 "goal" 作 from）
  → 服务端建一条 to=goal 的已结论 Intent
  → status=completed，清空 reason lease
  → 若误判：POST …/reopen 撤销完成边，纠错写成新 Fact 再探索
```

服务端还校验：completed 项目必须 **恰好一条** completion intent，缺失/重复 → 409。

**bootstrap**（prompt 级）：

- Goal **未达成禁止 complete**；部分进展不得写成完成。  
- 只有「本 session 已确定性达成」才允许 fact+complete。

**conclude（超时收尾）**：

- **禁止再探索、禁止 complete**；只输出已确认 Fact —— 收束极强。

**bootstrap/reason 的完成判断在 prompt 里**（YAML 图 + `complete.from`），  
**协议层不证明语义正确**，只保证：图一致、complete 是一条可审计边、可 reopen。

**成熟点**：完成是 **一等图操作**；错误完成可 **reopen**（helm-d 关案不可逆语义弱很多）。  
**短板**：Intent 无 worker_history；语义判断全押在 reason/LLM。

---

### 1.3 CAI —— 谱宽、完成软

| 机制 | 与「完成」的关系 |
|------|------------------|
| 多 Agent + handoff | **切换专家**，不是状态机完成 |
| `--continue` | 该停时自动续 prompt → **反完成偏置**（适合不死，不适合判定做完） |
| Guardrails | 阻止危险/注入，**不判定 goal** |
| Kill-chain 工具分类 | 便于选工具，不是阶段门 |
| reporter/retester 等 Agent | 有「报告角色」，仍靠 LLM 职责分离 |
| 归档状态 | 仓库 archived；完成语义未产品化为可拒收编译器 |

**成熟点**：领域 Agent 矩阵、handoff、并行、**注入四层防御**、研究与竞赛验证。  
**短板**：**没有** PG 级 finish_basis / done_when 编译器；**没有** Cairn 级 complete/reopen 协议。

---

### 1.4 PentAGI —— 执行谱全，完成偏「跑完 + 报告」

| 层 | 做法 |
|----|------|
| Flow/Task/SubTask | 状态机 pending→running→done/failed，**执行过程可审计** |
| 专员分工 | researcher/developer/executor… 子任务委托 |
| 监督 | 同工具连打阈值 **5**、总调用 **10**；通用 Agent 工具上限 **100**，受限角色 **20**；Reflector 无工具调用恢复 |
| 计划 | Planner 预拆 3–7 步（默认关） |
| 报告 | flow report：Web/MD/PDF |
| Goal 语义 | 偏「渗透任务跑完并出报告」；**非** PG 那种 finish_basis 校验器；**自陈非 BAS** |

**成熟点**：**过程完成**（树、限额、防卡死）+ **产品化交付物**（报告、监控、沙箱工具包）。  
**短板**：完成正确性更多在「状态都标完了 / 报告生成了」，而不是「每步证据钉死 + finish 可拒收」。

---

### 1.5 完成能力雷达（主观，按源码机制打分）

```text
                 单步证据钉死   Run可拒收finish   语义oracle   错误可撤销   收敛/防空转   过程可视
PentestGPT            ★★★★★        ★★★★★          ★★★★☆       ☆☆☆☆☆      ★★☆☆☆      ★★★☆☆
Cairn                 ★★★☆☆        ★★★★☆          ★★☆☆☆       ★★★★★      ★★★☆☆      ★★★★☆
CAI                   ★★☆☆☆        ★☆☆☆☆          ★★☆☆☆       ☆☆☆☆☆      ★★☆☆☆      ★★★☆☆
PentAGI               ★★★☆☆        ★★★☆☆          ★★☆☆☆       ★★☆☆☆      ★★★★☆      ★★★★★
helm-d                ★★☆☆☆        ★☆☆☆☆          ☆☆☆☆☆       ★☆☆☆☆      ★☆☆☆☆      ★★☆☆☆
```

**没有一家满分** → helm-pi 的机会是 **组合正确机制，而不是缝合功能**：

1. **PG 的单步/finish 编译器语义**（含四态、降级、类型边界）  
2. **Cairn 的图上 complete + reopen + Hint**（长程与纠错）  
3. **PentAGI 的过程树 + 监督限额**（防卡死、给人看）  
4. **PG 明文的 oracle 分离**（别让调度器假装证明了 flag）  
5. **CAI 的领域角色与 guardrail 分层**（宽谱 + 输入输出 tripwire）  
6. **收敛策略**（四家都没完全解决，必须自研：假设车道、同 kind 预算、强制 TEST→EXPLOIT）

---

## 2. 状态与记忆：谁的「权威」配得上称权威

| 项目 | 权威 | 诊断/非权威 | 恢复 |
|------|------|-------------|------|
| **PG** | SQLite：run/task/attempt/observation/**transition 每 revision 一条** | trace 三件套 input/events/output；provider 对话 **不是记忆** | 先恢复已有 terminal trace 再调模型；**有动作的失败不重放** |
| **Cairn** | 图协议（Fact 只增、Intent 生命周期、complete/reopen） | Prompt 里的 YAML 快照 | Dispatcher 按项目状态硬停/重启容器 |
| **PentAGI** | PG 风格业务表 + Flow | LLM 会话、Langfuse | 队列 + 容器生命周期 |
| **CAI** | 偏弱；`run_to_jsonl`、session load | 大量 tracing/repl | continue/load 历史 |
| **helm-d** | 无统一库；CASE.md + evidence 文件 + 内存 Map | 会话事件、advisory ledger（**只证明采纳指导**） | `case_status` 读 Markdown resume 块 |

**对比结论**：

- 成熟做法 = **append-only transition + 有界投影进 prompt**（PG 写死：存全、喂得少）。  
- helm-d 的 advisory 是好东西，但 **证明对象错了**（听不听话 ≠ 任务完没完）。

---

## 3. 收敛与「一直合法地干却不完成」

这是 **PG 实弹失败的主因**，也是 helm-d「决策点等人 / MOMENTUM 瞎交货」的镜像问题。

| 项目 | 收敛手段 | 不足 |
|------|----------|------|
| **PG** | 一 hypothesis 一任务；禁投机 backlog；TEST 不许提 shell 词；decision 上限默认 20 | **无强制进入 EXPLOIT 的状态机**；靠 Supervisor 自觉 → HTB 空转 |
| **Cairn** | reason 看 open intents 是否覆盖线索；Hint 写「SSH/SQLi 已排除」；max_intents | 仍可能无限 declare intent；无领域「必须打到 exploit」 |
| **PentAGI** | 同工具 5、总调用 10、角色 100/20、Reflector、Planner | 默认监督关；重在卡死而非战略收敛 |
| **CAI** | orchestration 工具、parallel/contest | 续跑偏置；完成不硬 |
| **helm-d** | decision-point 菜单、dead-end tool_memory、mode 阶梯 | **完成与收敛都停在 prompt** |

**helm-pi 自研点**（成熟项目都没做够的）：

```text
车道状态机（伪代码）:
  discover/enum 连续 N 次且无新 surface → 强制开 TEST 假设
  有 DONE 的 TEST → 下一 proposal 若无 exploit 车道 → 规划器注入「必须 exploit/verify 或 blocked」
  同 target 重复 surface → Diagnostic + 收敛 Hint，不产生新 ready 任务
  decision_budget 耗尽 → Run=failed(reason=convergence)，禁止 completed
```

---

## 4. 角色与编排：从「谁干活」看成熟度

| | 主角 | 扩展方式 | 适合 |
|--|------|----------|------|
| **PG** | Supervisor 提一个 ready 或 finish；Executor 做一个 lease | 几乎不横向扩；下一步要 **收敛投影/RAG**，不是加 Agent | 靶场单目标深打 |
| **Cairn** | 无角色 Worker + 三任务形；多 Worker 并行图 | 换 CLI 后端（claude/codex/**pi**） | 长程搜索、多路探索 |
| **CAI** | 领域 Agent 矩阵 + orchestration/selection 入口 | handoff、agent-as-tool、pattern | 全谱攻防、REPL、研究 |
| **PentAGI** | 主 Agent + 专员 + 监督角色 | Delegation、小模型+强 Adviser | 产品化自治渗透 |
| **helm-d** | 单 luna persona | 领域工具，不是领域角色 | 人在环分析 |

**洞察**：

- **编排复杂度应跟完成语义一起长**：CAI 角色多但完成软；PG 角色少但完成硬。  
- helm-pi：**会话层**可以像 CAI 多人格；**Run 层**应先像 PG 两角色 + 图，**不要**一上来堆 Swarm。

---

## 5. 隔离、护栏、外部内容

| 项目 | 边界 | 注入/危险命令 | 外部内容 |
|------|------|---------------|----------|
| **PG** | **部署隔离**；kernel 逻辑权威非沙箱 | Scope 白名单字节级；TEST 词表 | 明文 untrusted never instructions |
| **Cairn** | 项目容器/local workspace | 协议只管图；攻击在 Worker 内 | 图内容是数据 |
| **CAI** | 工具层 + guardrail 并行 | 输入/输出 tripwire、base64 危险命令 | DATA 标记 + 消毒 |
| **PentAGI** | **默认强容器隔离**（DinD 等有坑文档） | 工具白盒、网络边界 | 搜索/爬虫隔离 |
| **helm-d** | 宿主能力 + persona 工作区话术 | tool-wash、H-CoT/流式补丁战争 | AGENTS §6 当数据 |

**对比**：  
- 成熟度谱：**PentAGI 部署隔离 ≈ PG 部署隔离 ≫ CAI 工具层 ≫ helm-d 话术层**。  
- helm-pi：**ScopeGate 在 ToolHost 前** + 可选容器 executor；不把「破甲」当隔离。

---

## 6. 工程与可维护性（成熟项目凭什么能维护）

| 项目 | 文档 | 测试 | 契约 | 发布 |
|------|------|------|------|------|
| **PG** | CONTEXT 词典+不变量、architecture 接口表、实弹 qualification 报告（敢写 Not qualified） | 不变量向测试、loop/plan mock | 接口与 hidden impl 分离 | uv 锁、resume 要求 config 全等 |
| **Cairn** | protocol/dispatcher **长规格**（状态机、lease、错误码） | 协议+调度测试 | Agent **不碰 API**，Dispatcher 唯一写者 | compose + local mode |
| **CAI** | mkdocs 全套 | **555** tests | SDK Agent/Tool/Guardrail 类型面 | 已归档（维护性已死） |
| **PentAGI** | README 极长+边界自陈 | **135** go/test | schema/flowfiles | 多 compose 矩阵、EULA |
| **SoL-Pi** | 配置/兼容/安全专文 | **20** 专项 + 真 Extension 加载 | 只打 public API、默认关 | peer 锁 Pi 版本 |
| **OMP** | 数十篇子系统文档 | monorepo check | 扩展契约清晰 | 版本化 packages |
| **helm-d** | MAINTENANCE 坑表极实用 | 22 宿主 seam check | **preset 双源、peer rc** | tgz+五资产事故史 |

**成熟项目共同点**：

1. **词典 + 不变量**（PG CONTEXT）或 **协议规格**（Cairn）单源。  
2. **失败当一等公民**（PG qualification、PentAGI Boundaries）。  
3. **权威与投影分离**（存全喂少）。  
4. **测试打契约不打字符串**（避免 helm-d 式只测 mock ctx 注册名也能过、真组装却残废）。

---

## 7. 对 helm-pi 的直接结论（可执行）

### 7.1 必须学的机制（按优先级）

| 优先 | 机制 | 来源 | 落点 |
|------|------|------|------|
| P0 | 单步四态 + exact quote + 降级 progress | PG `compile_execution` | `core` 完成编译器 |
| P0 | finish_basis + 无 open work + 类型边界（TEST≠EXPLOIT） | PG `compile_plan` | `core` 计划编译器 |
| P0 | 结构完成 ≠ 语义；独立 oracle | PG CONTEXT | GoalVerifier |
| P0 | 图上 complete 可引用、可 **reopen** | Cairn 协议 | Claim/Direction + reopen |
| P1 | 收敛车道 / 同 kind 预算 / 耗尽=failed | 自研（PG 失败驱动） | Loop 策略 |
| P1 | 过程树 + 工具硬限额 + 无调用恢复 | PentAGI | supervise + Timeline |
| P1 | 领域角色可选、输入输出 tripwire | CAI | Session 人格 + Guard |
| P1 | 项目容器/local 双执行、唯写者 | Cairn/PentAGI | ToolHost executor |
| P2 | 有界 prompt 投影（存全喂少） | PG | Propose view |
| P2 | 按需知识、首轮收窄 | helm-d 自身优点 | Session |

### 7.2 不要学的

| 项 | 来源 | 原因 |
|----|------|------|
| 只 continue 不 finish | CAI `--continue` | 反完成 |
| 靠 persona 宣布完成/授权 | helm-d 弱完成 | 不可拒收 |
| 一上来 Swarm 多角色 | 误读 CAI | 完成语义未稳时放大熵 |
| 整栈 Neo4j+OTEL 当内核 | PentAGI | 过重；可选插件 |
| 破甲/流式补丁当主战场 | helm-d 0.4.x | 维护黑洞，与完成链无关 |
| 手抄宿主 preset | helm-d 事故 | 双源必炸 |

### 7.3 成功时的「完成」长什么样（验收话术）

> 给定 goal + allowed targets：  
> 每一步要么 `done` 且 excerpt 能在 receipt 里 **字节级找回**，要么诚实 `progress/blocked/failed`；  
> `finish` 在有 open work 时被 **代码拒绝**；finish_basis 指向 DONE 观察；  
> 语义是否拿到 flag 由 **oracle 或人工 approve_goal** 单独盖章；  
> 误 complete 可 **reopen**；收敛耗尽报 **failed=convergence** 而不是 COMPLETED；  
> 全程 Journal 可重放，与会话无关。

---

## 8. 修订

| 版本 | 说明 |
|------|------|
| 1.0 | 初版：helm-d 痛点 + 参考优点摘要 |
| **1.1** | **成熟项目横向对比：完成四层、收敛、状态权威、角色、隔离、工程；helm-pi P0–P2 行动表** |

**流程与方法论专项**：[process-methodology-comparison.md](process-methodology-comparison.md)
