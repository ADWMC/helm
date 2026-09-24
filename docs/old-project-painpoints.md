# 旧项目（helm-d）痛点 × 参考实现优点

> **用途**：helm-pi 的「为什么重做」与「什么必须做对」单源。  
> **方法**：通读本仓 `reference/repos/*` 与 helm-d 自身事故/审计/维护文档，对照机制而非功能清单。  
> **日期**：2026

---

## 一、helm-d 痛点（按杀伤力排序）

### A. 宿主耦合与部署脆弱 — 最高频事故源

| 痛点 | 证据（来自仓库） | 后果 |
|------|------------------|------|
| **Preset 手抄宿主 standard** | `MAINTENANCE` §5；事故 `incident-2026-08-26`：手抄/过期 yml → standing mount 重建 → **44 工具、零平台工具、bootstrap 失效**，模型连试 17 个 shell 名全 unknown | 整会话致残，且**静默开席**（inactiveRows 只查插件激活，不查产出基准） |
| **双链路不同步** | 包换血（profile node_modules）与 preset yml 换血可只成功一半 | 半新半旧组合 |
| **生成器靠事后补救** | 后来才有 `gen-preset.mjs --check` / 指纹头 / auto-heal；旧路径是手改 `agent.cordis.yml`（明文禁止） | 每次宿主升级 = 必炸雷区 |
| **peer 钉死 rc 版本** | `@deepseek-ai/* >=0.1.5-rc.1 <0.2.0-0` | 宿主小步演进就断 |
| **UI 半边曾整模块不加载** | `exactPackageSpecifier` 只认 `@scope/name`，深路径 `helm-d/dist/health.js` 导致 client **从未进模块图** | 设置卡「永远不出现」类诡异 bug |
| **API 注入声明过窄** | `/api/helmd/tools` 500：`inject` 只声明 `webServer` 却读 `ctx.tools` | 上线即坏 |
| **读私有字段侥幸** | `layers.global.tools.entries()` 靠 TS private 运行时仍可读 | 宿主重构即碎 |

**根因一句话**：能力寄生在 **Cordis 深插件模型 + 手写/生成 preset 双源** 上，健康检查不验证「工具目录产出」。

---

### B. 状态与自主性缺失 — 做不成「无人值守」

| 缺什么 | 表现 |
|--------|------|
| **无权威任务状态** | 进度靠会话上下文 + `CASE.md`；压缩后靠 `case_status()` 回读，不是可重放账本 |
| **无阶段门** | 方法论写在 persona/AGENTS 里，**没有代码强制**「有证据才能进下一阶段」 |
| **无提案/裁定分离** | 模型直接「说完成」；缺少 PG 式 schema 提案 + 确定性校验 + finish 必须 cite observation |
| **无范围硬门** | persona 声称工作区前提；**工具层仍可能被沙箱/审批物理拦**（或相反：无统一 ScopeGate） |
| **人在环推进** | 分诊→…→决策点每步靠人；不是「模型提案、代码裁决、人只纠偏」 |
| **H-CoT/流式钩子复杂度极高** | 与核心分析争资源；CHANGLELOG 显示大量「拒绝根因 / 预 fill / 嵌套重发」补丁战争 |

**根因一句话**：helm-d 是 **DSH 上的强知识插件**，不是 **带账本的运行时**。

---

### B2. 「完成任务」断裂 —— 最大产品问题（细读源码后）

完成不是一个词，在参考系里被拆成**四层可执行判定**；helm-d 几乎只有「散文 + 关案时弱检查」。

#### 对照：完成在参考系里长什么样

| 层 | PentestGPT | Cairn | helm-d（现状） |
|----|------------|-------|----------------|
| **① 单步完成** | `Task.done_when` 必填；Executor 报 `done` 必须 `evidence_excerpt` 落在 **receipt 连续原文**；截断/回退/改写 → **强制降级为 `progress`，截断永不完成** | `explore` 必须充分探索该 Intent 再结束；产出「增量 Fact」，不把半成品当 complete | 无 `done_when`。工具有输出即算「做过了」；完成靠叙述 |
| **② 阶段/计划完成** | `compile_plan`：`finish` 与 `next_task_id` 互斥；finish 时 **禁止 open task**；`finish_basis_ids` 必须来自 **已 DONE 任务的 canonical observation**（≤4、去重、存在） | `reason` 判 Goal：`complete.from` 只能引用 **Valid facts**，且要解释「为何现有 Fact 已足够证明 Goal」 | `workflow.md` 的 Phase gates 是 **Markdown 交付物清单**；`analysis_mode` 合同是 **prompt 文本**；`advisory` 只能证明「是否采纳建议」，**不能证明阶段出口** |
| **③ 案例/Run 关闭** | `RunStatus.COMPLETED` = 结构完成 + 显式 basis 引用；开放 work 时 finish **直接拒绝** | `bootstrap`：**未达成禁止输出 complete**，部分进展 ≠ 完成；超时走 `bootstrap_conclude`：**只总结已确认 Fact，禁止 complete** | `end_case`：deep 要 ≥1 finding；**零证据时只认 summary 字面量 `(no-evidence: …)`**。不校验 goal 是否达成、不校验 finding 是否支撑 goal、不校验阶段是否走完 |
| **④ 语义目标是否真完成** | 文档写明：`COMPLETED` **只保证结构完成**，**不证明**任意语义 goal；留 **held-out oracle**（如 `--expected-flag` audit）与调度/记忆分离 | Goal 是显式字段；由 `reason`/`bootstrap` 在图上判断并落 complete 节点（判断可错，但**有位置、有引用、可重审**） | **无 goal verifier**。模型说「分析完了」就是完了；报告有模板无机器验收 |

#### helm-d 侧具体断裂点（实现级）

1. **Goal 是自由文本**（`begin_case(goal)`），从进案到关案**没有任何代码读这个 goal 去判定达成**。  
2. **关案门是字符串门**：`end_case` 看 evidence 计数 + `(no-evidence:)` 正则 + deep 模式 finding 数——**结构门，不是目标门**。  
3. **`record_finding` 只验证 E-id 存在**，不验证 finding 是否引用了与 goal 相关的观察、是否可复现、是否完成 `done_when`。  
4. **阶段推进靠人**：AGENTS 规定每阶段末「决策点 3–6 选项 + `ask_user_question`」——**多步任务在无人点选时无法自动走完**；又与「MOMENTUM 反停滞」打架。  
5. **完成标准写在散文**（AGENTS §11「结果符合需求…关键事实有证据」），**没有与 `compile_plan.finish` 同级的 reject 路径**；模型可以交付一篇完整报告而底层 step 全是空转。  
6. **压缩恢复契约**（`CASE.md ## resume`）是给人/模型看的 Markdown，**不是 revision 连续的 Transition**；丢 resume 块 = 断链。  
7. **advisory ledger 方向对但用错了层**：它度量「是否听了我们的指导」，不能替代「任务是否完成」；proof 种类是 `tool_called` / `finding_recorded`，**不是** `done_when_satisfied`。  
8. **反停滞 vs 完成纪律冲突**：MOMENTUM 要求做不成就交最近可交付物；完成纪律要求无证据不关。缺一层 **`progress | blocked | failed | done` 四态**（PG 有），只剩「说完了 / 没说完」。

#### 参考系自己也踩过的「完成」坑（必须写进 helm-pi 验收）

来自 **PentestGPT HTB Enigma 实弹**（`HTB_ENIGMA_QUALIFICATION_20260712.md`）：

| 现象 | 含义 |
|------|------|
| Q8 **从未选中 EXPLOIT**，预算耗在 discover/enumerate | **过度分解 + 无收敛控制** → 结构上一直在「合法推进」，语义上永远完不成 goal |
| Q5–Q8：非零退出被拒为证据 / 超长 quote 被拒 / 改写 quote 中止 run | **证据校验过严且缺逃逸** → 完成路径被验证器堵死（校验对了，**收敛与降级策略不够**） |
| Claude 被 provider 安全层 block | 完成闭环外还有 **宿主/供应商拦截**，与「模型说没完成」不同因 |
| 结论自陈：结构 COMPLETED ≠ 语义证明 | 必须把 **oracle/verifier 单列**，禁止调度器假装自己证明了 flag |

Cairn 侧对应设计：

- complete **必须 cite 图上已有 Fact**，并写「为何足够」；  
- conclude 阶段 **禁止再 complete、禁止再探索**，只允许「已确认事实」收尾——**强收束**，避免超时还在嘴硬。

#### 一句话诊断

> **helm-d 解决了「怎么找证据、怎么写报告」，没有解决「谁、用什么代码、按什么条件，宣布这一步/这一案/goal 算完成」。**  
> 完成停在 prompt 纪律；参考系完成在 **schema + 不变量 + 降级四态 + 图上 complete 节点 + 可选 oracle**。

#### helm-pi 必须有的完成链（从痛点反推，与 DESIGN 对齐）

```text
Step.done_when  ──compile_execution──►  done | progress | blocked | failed
       │                    │
       │                    └─ excerpt 必须钉 receipt；截断/回退 → 只能 progress
       ▼
Playbook gate   ──Domain 谓词──►  出口交付物皆有 evidence_refs 才进下一阶段
       ▼
Run.finish      ──compile_plan──►  无 open work + finish_basis ⊆ DONE 观察
       ▼
Goal verifier   ──独立于调度──►  可选 oracle（flag/hash/脚本）或人工 approve
       ▼
end_case         仅当上述结构成立；(no-evidence:) 只作咨询/阻塞逃逸并记 Journal
```

配套：

- **收敛策略**（防 PG 式空转）：同 kind 连续上限、强制「假设 → TEST → EXPLOIT」车道、decision_budget 失败原因写入 Diagnostic 而非静默 COMPLETED。  
- **人决策点** = `Hint` / `approve` **写入账本**，不阻塞整环；与 MOMENTUM 兼容：默认自动选「最浅可继续步」，高风险才 HITL。  
- **四态永远可用**：模型至少能交 `progress+证据`，避免「要么嘴上完成、要么卡死」。

---

### C. 行为层与知识层纠缠

| 痛点 | 证据 |
|------|------|
| **Persona 过长且反复推倒** | 16k→减脂 <2k；TARGET PREMISE 自曝被模型当 adversarial input；授权/沙箱措辞反复清洗 |
| **原则写在文档，执行靠自觉** | `principles.md` 优秀，但无 INVARIANTS 测试钉住「Evidence ≠ Diagnostic」 |
| **references 膨胀** | 637+ md + src-hunter 3164 文件级语料——检索路由与包体/维护成本高 |
| **破甲与分析两线作战** | 行为层（拒答）+ 运输层（stream）+ H-CoT 引擎，占大量维护带宽，且与「更好的渗透执行」目标可分离 |

---

### D. UI / 扩展面干扰

- 自造展开卡 **霸占** `settings.plugin.item`，挤压官方插件（`ui-ux-architecture-redesign` 根因分析）。
- 多入口打架：settings 卡 + 右栏 tab + 左栏 + main 抢占。
- 后来才规划独立 Tab / 统一工作台——**正确方向但实现晚、且绑 DSH slot**。

---

### E. 工程与发布摩擦

- Release 五件套曾漏传 installer；同版本 pnpm 跳装；相对路径 ENOENT；四处商店数字要与 tool-catalog 对齐。
- 22 个 check 脚本 = 高，但多为 **宿主 seam 冒烟**，对 **Domain 不变量 / Ledger** 覆盖弱。
- monorepo 单包 + 大量生成物 yml，心智负担重。

---

### F. 旧项目值得原样继承的优点（避免因噎废食）

1. **知识按需读，不灌 system prompt**（`principles` §1/§6）。  
2. **首轮工具锚定 + 失败降级**（bootstrap 设计干净）。  
3. **证据 E 编号 + 报告模板 + 工具获取阶梯**。  
4. **六域 references 体量与索引习惯**。  
5. **分诊→报告→逆向→研判→决策点** 行业流程骨架。  
6. **工具描述清洗**、**外部内容当数据**（方向对，实现可收敛到 ScopeGate/Guard）。  
7. **严格配置/检查文化**（要升级成 Domain 测试，而不是宿主 mock）。

---

## 二、参考项目：实现方式与真正优点

### 1. 确定性双角色环（PentestGPT · `pentestgpt_agent`）

**实现要点**

- **Supervisor / Executor** 两角色；`compile_plan` / `compile_execution` 是**确定性编译器**。  
- **MemoryKernel = SQLite 权威**；revision + append-only `Transition`。  
- **Evidence = exact contiguous quote** from receipt；Diagnostic/summary **永不**为 evidence/basis。  
- 任务 kind 硬边界：`DISCOVER ≠ EXPLOIT`；EXPLOIT 必须 cite **同 target 最新 TEST observation**。  
- **有界检索**：给 Supervisor/Executor 的上下文是定额窗口，不是全库。  
- 每 episode **fresh**；`allowed_targets` 字节级白名单。

**优点**：可测、可恢复、防「模型嘴替完成」、防 scope 污染。  
**helm-pi 映射**：P1/P2/P4/P5/P6 + Propose schema + Ledger revision —— **已写入 DESIGN v2.0**。

---

### 2. 状态空间黑板（Cairn · server-protocol / dispatcher）

**实现要点**

- `origin` / `goal` + **只增 Fact** + `Intent(from[], to, claim/heartbeat/conclude)` + 图外 **Hint**。  
- 任务仅三类：`bootstrap | reason | explore`；**Dispatcher 唯一写者**，Agent 不碰协议。  
- reason 项目级 lease、超时释放 worker、stopped 硬停杀进程。  
- Fact 描述 = 轻量洞见 + **大输出文件引用**（图不背 10MB）。  
- Worker 可跑 **已登录的 `pi` CLI**（对我们宿主对齐极友好）。

**优点**：长程自主有因果链；多 Worker 协调靠共享状态而非群聊；审计 = 读图。  
**局限（他们自己写了）**：Intent 无 worker_history；单 Dispatcher。  
**helm-pi 映射**：Claim/Direction/Hint/Journal + 并行 Direction 策略作 Run 执行选项。

---

### 3. 多智能体 + 并行护栏（CAI）

**实现要点**

- Agent = instructions + tools + **handoffs**；Pattern = 分层/链/并行/竞赛。  
- Kill-chain **六类工具标签**（recon→…→control）。  
- **Input/Output guardrail tripwire**：并行廉价检查，触发即停贵模型。  
- 外部内容 **DATA not INSTRUCTIONS** + 危险命令执行前拦截（含 base64）。  
- 领域 Agent 工厂（red/blue/RE/DFIR…）+ 可 continue 自动续跑。

**优点**：安全边界与角色分离清楚；注入防御有 PoC 驱动。  
**局限**：仓库已 archived；修复进商业后续，开源树是冻土。  
**helm-pi 映射**：ScopeGate tripwire、风险级、领域专家 = 会话人格/子会话，**不照搬 Python SDK**。

---

### 4. 执行谱 + 监督卫生（PentAGI）

**实现要点**

- `Flow → Task → SubTask → Action → Artifact/Memory` **可查询执行树**。  
- **Planner** 预分解 3–7 步；**Mentor** 同工具/总调用阈值介入；**Reflector** 无工具调用恢复；**分角色硬限额**。  
- 工具按任务选容器；OSINT search 可插拔；Flow 报告导出。  
- 默认 **Docker 整栈** + 可选 Neo4j/OTEL——重，但是「产品完整」参照。

**优点**：防死循环、防跑偏、执行过程产品化可视化。  
**局限**：自陈非 BAS；栈重；部分能力 Beta 默认关。  
**helm-pi 映射**：`supervise` **可选策略包** + Journal/Timeline；**不**把整栈当内核。

---

### 5. Pi 生态效率与扩展（SoL-Pi · oh-my-pi）

| | 优点 | 对 helm-pi |
|--|------|------------|
| **SoL-Pi** | 只打 public API；配置严格；证据归档保留；四机制默认关、可组合 | 共存契约、配置风格、P10 内核 |
| **oh-my-pi** | 扩展清单 `pi.extensions`；LSP/DAP/TUI；侧栏生态 | adapter-omp 可选；核心不依赖私有 API |

---

### 6. 对照表：痛点 → 参考答案 → helm-pi 决策

| helm-d 痛点 | 谁示范了解法 | helm-pi 决策 |
|-------------|--------------|--------------|
| 手抄 preset / 双源 / 静默残废 | —（宿主插件模型问题） | **不进 Cordis preset 深水**；Pi 扩展清单 + 启动自检「工具目录产出」断言 |
| 无权威状态 | PentestGPT MemoryKernel | **Ledger SQLite + revision + Transition** |
| 无阶段门 | 自身 playbooks 意图 + PG done_when | **Playbook YAML + Domain gate 测试** |
| 完成靠嘴 | PG finish_basis_ids + exact quote | **done 必须 cite Observation；excerpt 连续性校验** |
| 范围/权限人格化 | PG allowed_targets + CAI guardrail + dsh-purge 教训 | **ScopeGate 代码路径**；不靠 persona 声称授权 |
| 无人长跑 | Cairn 图 + Dispatcher | **Claim/Direction/Hint + Run Loop** |
| 卡死重复 | PentAGI mentor/limits | **supervise 可关策略** |
| UI 抢位 | 自身 ui-ux 重构文 | TUI 命令面为主；侧栏/Console **可选适配层** |
| 破甲战争泥潭 | CAI 输入输出护栏思路 | **分析/执行为主**；拒答处理收敛为可关模块，不进核心完成语义 |
| 知识灌 prompt | helm-d 自己的原则 | **坚持 references 按需读**（继承） |

---

## 三、参考项目「实现优点」提炼（可直接当验收标准）

1. **状态可重放**：任一时刻 `ledger dump + Journal` 能解释「为何认为完成了」。  
2. **提案有 schema**：LLM 输出进库前必 `parse → validate → commit`。  
3. **证据可钉账**：每条 finding/finish 能点开到 receipt 原文与工具调用。  
4. **范围可证明拒绝**：矩阵测试覆盖出界 target / 高危操作。  
5. **上下文有预算**：Propose 视图定额，禁止全量聊天回放。  
6. **监督不篡改业务**：Mentor/限额只改提示或 Step 状态，不直接写 Claim。  
7. **宿主可拔**：删掉 `adapter-*` 后 `core+runtime` 测试仍全绿。  
8. **方法论可测**：Playbook gate 是 Domain 函数，不是 prompt 背诵。  
9. **可选重能力后置**：并行 Worker、容器执行、向量记忆、Console —— 插件化。  
10. **自检工具目录**：扩展 load 后断言「期望工具集合」出现，防 helm-d 式静默残废。

---

## 四、结论（给设计的一句话）

**旧 helm-d 输在「寄生宿主 + 无账本 + 自治缺失」，赢在「知识按需 + 证据文化」。**  
**参考系的真优点不是功能列表，而是三条机制：确定性账本、只增探索图、可关的执行监督。**  
helm-pi v2.0 的分层与不变量已经对齐这三条；实现顺序必须先 **Ledger + Scope + Evidence**，再谈 Mission/UI/破甲插件。
