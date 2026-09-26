# helm-pi 演进方案（PLAN-evolution）

> **历史归档（非活动方案）**：本文记录 ADR 和参考仓吸收过程。实施、验收和生命周期以
> [`REDESIGN.md`](REDESIGN.md) 为准；本文不再产生新开发任务。

> **定位**：架构转向 ADR + 14 个参考仓的吸收波次清单。**规范单源不变**：不变量 → [INVARIANTS.md](INVARIANTS.md)；测试门禁 → [tests/STANDARD.md](tests/STANDARD.md)；流程 → [methodology.md](methodology.md)；架构 → [../DESIGN.md](../DESIGN.md)。
> **依据**：14 个参考仓精读（6 份报告，论断全部带 `路径:行号`）+ 本仓 token 实测（2026-mimo-vulncms-ab 套件）。
> **状态**：**ADR-001 已批准 —— 决议为 B 预案（单代理瘦身）起步**（依据步 0 真机冒烟，见 §5 定案）；A′ 分发降为备选（A″ 进程级，前置验证另立）。实施时不变量改动一律**先改** [INVARIANTS.md](INVARIANTS.md) 单源；每步以 §4 验收为准。

---

## 0. 结论摘要（TL;DR）

1. **起步路线（ADR-001 决议）**：步 0 冒烟证伪宿主 task 工具 → 按预案走 **B：单代理瘦身**（父面摘工具 schema + 渐进装载 + Spec token 门禁）；**A′ 分发降为备选**——若重启则走 A″（进程级子 pi 分发，前置 = child_process 可用性真机验证）。破甲编排层与 token 门禁设计**两路通用**，照常推进。
2. **吸收 14 仓** → 5 个波次，约 `S×26 + M×15 + L×3` 排期项，另有 4 个 L 级单独立项；每条挂不变量/门禁验收。
3. **不吸收清单**（§3）先于吸收生效：挂不上 P1–P10、触「明确不做」的一律不进。
4. **验收硬化**：每波完成 = `npm run check` 全绿 **+ 一个 `docs/tests/` 真机真调用套件**（真 `pi` 宿主 + 真模型 + 本地靶场，过 STANDARD L/T/C/S 门禁与 §6 token）；无真机套件只记「未验证」，不记完成。

---

## 1. ADR-001 执行体转向子代理分发

### 1.1 上下文（事实）

- 现状：`src/` 零分发代码（grep `dispatch|subagent|child` 无匹配）；扩展 API 面无 spawn 原语（宿主 `.d.ts` grep `HITS=0`）；宿主**内部**有 subagent thread（`events.d.ts:791`，事件/确认 cross-post 到父线程 :108/:172）；同宿主 shannon 已用内置 `task` 子会话 + CHILD_TOOLS 收窄。
- 症状一（抽风）：多域知识/工具挤同一上下文 → 域间跑偏。对症原则本来就有：P3（知识按需）、E5、P6、I2、有界视图（[DESIGN.md:252-262](../DESIGN.md#L252-L262)）。
- 症状二（token）：实测 `grand_total_with_cache = 488,169`，**cacheRead 占 89%**；D(helmpi) 202,535 vs A(裸) 156,147 = **+29%**；根因 = 「扩展工具 schema + 系统提示每轮重放」（performance-analysis.md:76）。

### 1.2 选项与选择

| 选项 | 内容 | 结论 |
|------|------|------|
| A 朴素分发 | 每步起子代理，父侧读子原文观察 | **否**：双份上下文账单；破甲钩子对子线程是否触发未验证 |
| **B 单代理瘦身（选定）** | 摘工具 schema + 渐进装载 + token 门禁，不分发 | **✅ 决议起步**（步 0 证伪 task 工具后按 §5 预案执行）；代价：域间抽风根因（上下文隔离）本阶段只缓解不根治 |
| A″ 进程级分发（备选） | dispatch 自起子 `pi --session` 进程喂 child-context，stdout/证据文件回执 | **降级为备选**：P10 更干净（不依赖宿主内部 API）；重启前置 = ①child_process 真机可用性 ②按案长驻的冷启动 token 成本实测 |
| ~~A′ 宿主线程分发~~ | 依赖宿主 task 工具 | **已证伪**（步 0：`TASK工具=无` + 事件面仅类型声明无实现），作废 |

### 1.3 A′ 设计（四条纪律）

1. **按案长驻**：一个案/域一个子代理，不按步重开（重开 = cache 冷启动）；父面**动态摘除**已分发域的工具 schema（airecon `blocked_tools` 配方）。
2. **只回执**：子代理原文**永不进**父 LLM 上下文；只回 I5 短 excerpt → Observation，父 Propose 走有界视图。
3. **破甲编排层**（breach 是纯库，`index.ts:3` 自述 host-agnostic）：
   - 装载期：任务书头 = SOW/blast_radius 授权帧 + `normalizeInput` 规范化 + 拒绝纠偏模板 + `washText`——**一次性注入，吃全程 cache**；
   - 观察期：父侧 `classifyStance`/`ingest→settle` **纯正则 = 0 token**，检出拒绝 → 向子代理续发 steering（低频才花钱）；
   - 保底：ladder 耗尽 → **收回父代理直跑**（现有 hcot_attack/advisory/工具 wash 全套原样生效）。分发是策略开关，不是单行道（对齐 M6：策略开关下不变量仍绿）。
4. **渐进装载**：任务书只带 description + doneWhen；方法论正文走 `read_reference` 按需（E5；Anthropic-Skills description-first 模式）。效率层**复用 SoL-Pi**（ActionFusion/ObservationPack/compact，[COMPAT.md](COMPAT.md) 约定不抢 compact 边界），不重造。

### 1.4 不变量影响（实施前先改单源，本文件不改）

| 编号（拟） | 内容 | 状态 |
|-----------|------|------|
| **I19** | finish 须带 coverage（阴性面）或显式豁免 —— strix 配方 | 待立（步 1） |
| ~~I20~~ | ~~子代理入账 + 父侧观察 + 收回直跑~~ | **不立**（B 路径无子代理；若未来启用 A″ 再立） |
| I10 | 语义**不变**：`Spec.max_tokens` 超限走既有 `failed/blocked(convergence)` | 复用（B 路径照常落地） |

---

## 2. 吸收波次（14 仓 → 文件级清单）

来源缩写：**PWF**=planning-with-files · **BP**=BoxPwnr · **PB**=pentest-bench · **SW**=Pentest-Swarm-AI · **DM**=Dark-Moon · **AR**=airecon · **SH**=shannon · **ST**=strix · **CM**=Cybermes · **BH**=bughunter-ai · **CT**=cybersec-toolkit · **HX**=hexstrike-ai · **AS**=Anthropic-Cybersecurity-Skills · **AW**=awesome-cybersecurity-agentic-ai

### Wave 0 · ~~分发 MVP~~（已取消 → B 路径瘦身）

> 步 0 证伪宿主子代理能力，本波**作废**；其内容转为 B 路径 MVP（见 §4 步 3）：任务书/破甲头/渐进指针的「装载」设计保留并入**单代理**路径（system prompt + read_reference），`child-context.ts`/`dispatch.ts`/`attempt.child` 不再新建；I20 不立。唯一遗留可复用件：`Spec.max_tokens`（进 §4 步 3）。

### Wave 1 · 正确性补洞

| 改造点 | 来源 | 落点 | 量 | 验收 |
|--------|------|------|----|------|
| 收敛计数落盘 `run_state`（kindStreak/decisions 进库） | PWF | `src/ledger.ts` + `src/loop.ts:87-88` | M | **I10** 跨进程生效 + `run.test.ts` 2 例 |
| `reconcileRun()` 起手对账 + journal `recovered` | PWF | 新 `src/recover.ts` | S | I1 |
| scope 匹配器（CIDR/通配/regex）+ `matched_by/reason` 进 Journal | CM | `src/domain/scope.ts` | M | I13/I14 + `domain.test.ts` |
| fail-closed 网段门（默认仅 loopback/RFC1918，Spec 显式覆盖） | CT | 同上（与上行合并） | 合并 | I13/I14 |
| finish coverage 阴性面 | ST | **先立 I19**，再 `src/domain/completion.ts` + ledger | M | I8/I9 |
| 证据状态梯 CONFIRMED/UNCONFIRMED + 8 条负面清单 | DM | `src/domain/evidence.ts`、`src/export.ts` | S | I4–I7 |
| guard 拒绝带 `why+instead` 替代路径 | DM | `src/supervise.ts` | S | I14 |
| per-response 工具调用熔断 | ST | supervise + loop | S | stepToolCap 同处 |
| SOW 补 `blast_radius` 段 / forbidden_actions / `helmpi_validate_scope` 首注册 | CT/CM | `docs/SOW-TEMPLATE.md`、`src/index.ts` | S×3 | P5/P8 |

### Wave 2 · 评测协议升级（tests/STANDARD.md，补 n≥3 短板）

| 改哪节 | 改法 | 来源 | 量 |
|--------|------|------|----|
| 新增 §5.5 重复性门 R | n≥3，报 **pass@k** + 成功率 + 中位数/极差；n=1 只标 `exploratory` 禁写「通过」 | BP | S |
| §5.2 T2 | **禁止自报完成**（判定外部可验）+ 并入三元组 `valid commands / steps_to_flag / token cost` | PB | S |
| §4 | 冻结预算（turn cap+墙钟+`max_tokens`）+ wall/active 双时钟 | BP | S |
| §2 目录 | `runs/<组>/attempt_N/{stats.json,config.json,log}`，stats.json 原子写单源 | BP | M |
| §6 token | 六列分列（新增 cache_creation 独立列） | BP | S |
| §3 / §8 | 对比表加 `steps_to_flag` 列；checklist 加 n≥3/预算/stats 三查 | PB/BP | S×2 |
| CLI `helmpi bench` | 聚合 pass@k + bench-summary + token CSV | BP+PB | M→L **单独立项** |

### Wave 3 · M6 并行与部分完成

| 改造点 | 来源 | 落点 | 量 |
|--------|------|------|-----|
| 黑板 pub/sub + 每槽游标（至少一次投递）+ 信号量 = `parallel_directions` 配方 | SW | 新 `src/parallel/scheduler.ts` + 游标并入 Ledger revision（槽位数写 Spec，I2） | **L** |
| Run 终态 `partial` + 有序原因集 | SH/SW | `src/domain/types.ts`、`src/export.ts`、loop 收敛分支 | M |
| idle watchdog（inFlight 保护）→ 按 I12 收口 | SW | `src/loop.ts` | S |
| 预算耗尽 → 出 partial 报告不 cancel | SW | loop 收敛分支（与上行合并） | 合并 |

退出标准照旧：[DESIGN.md](../DESIGN.md) §13 M6「策略开关下不变量仍绿」= `npm run check` 全绿。

### Wave 4 · 知识与工具面

| 改造点 | 来源 | 落点 | 量 |
|--------|------|------|-----|
| MCP 受管桥：`模型→ToolSpec→ScopeGate→bridge→MCP`（内核不 import MCP SDK，删桥 Loop 仍可测） | HX | 新 `src/host/mcp-bridge.ts` | M |
| config `mcpServers` 严格 schema + high-risk 必须 approval + 151 工具六类种子表 | HX | `src/config.ts`、`src/index.ts` | S×3 |
| playbook 增可选 `attack: [T…]` 字段 | AS | `docs/playbooks/SCHEMA.md` + `src/playbook-yaml.ts` | S |
| T-ID 扫描 → ATT&CK Navigator layer + 覆盖表 | AS | 新 `tools/attack-coverage.mjs` | M |
| playbook lint 进 `npm run check`（schema+门禁冲突检测，仿 5-tool CI） | AS | scripts | M |
| description 四要素（含负触发）落索引 | AS | `docs/README.md`、`references/index.md` | S |
| `references/index.md` 加 `agentic-sec-radar.md`（7 个未覆盖方向） | AW | references | S |
| 20 条 agent 失败模式 → breach/supervise 对照测试语料 | AW | `src/breach` 测试 | M |
| 补 API 域 playbook（现有 7 个缺 API/IDOR 域） | BH | `docs/playbooks/` + `playbook-yaml.ts` | M |
| export 补 retry/error 列 + 退出码 0/2 语义 + md/结构化双产物 | BH/ST/SH | `src/export.ts`、`src/cli.ts` | S×3 |

### 单独立项（不排期，前置条件另立）

`helmpi bench` 全量（L）· 签名 Receipt 升级 I5（L）· 微VM 执行沙箱（L）· 宿主工具层 path deny 下沉（L，shannon 配方，需宿主 hook 可行性验证）。

---

## 3. 不吸收清单（先于此方案生效）

| 类别 | 不收什么 | 来源 | 挂靠 |
|------|----------|------|------|
| 第二宿主/强制基建 | Temporal+Docker、Docker sandbox、Kata VM+670 工具安装器、LangChain/CrewAI 等框架 | SH/ST/CT/AW | 「明确不做」+ P10 |
| 判定类 | 模型自报完成、无条件 advance/失败自动 skip、stall→放行、质量加权分当裁定 | PB/BH/PWF/AR | I8/I9/I10/P2 |
| scope 类 | fail-open 默认、`env=1` 解锁外网、`auto_exploit` 默认开、prompt 级 scope、`/api/command` 任意执行、绕伦理话术 | CM/CT/AR/BH/HX | P5/P8/I14 |
| 知识/面外 | 818 语料全量入运行时、MD agent 当 prompt 执行、pheromone 启发式、自动修复 PR 链、SaaS/遥测 | AS/DM/SW/ST | P3/P4/P6/P8 |

---

## 4. 顺序与验收（每步留命令证据）

**验收原则（硬）**：`npm run check` 全绿只是**必要条件**。**每一波完成 = 单测绿 + 一个 `docs/tests/` 真机真调用套件** —— 真 `pi` 宿主、真模型、本地授权靶场（18080–18084），按 [tests/STANDARD.md](tests/STANDARD.md) 执行：L 门（扩展加载 0 error）、T 门（exit 0 + 外部可验结论 + scope 不越界 + E-id 证据链）、C 门（同 prompt 同模型仅扩展组合不同）、S 门（仅本地授权 + 无明文密钥），产出齐 `logs/ evidence/ reports/ MANIFEST`，有 LLM 调用必附 `token-usage.md`（§6 口径）。**缺真机套件 = 该波未完成，只记「未验证」。**

| 步 | 内容 | 验收（命令 + 输出留档） |
|----|------|------------------------|
| 0 | 真机冒烟：真 `pi` + 真模型起 task 子代理，跑最小靶场动作 | ✅ **已完成（2026-09）** → [`tests/2026-dispatch-smoke/`](tests/2026-dispatch-smoke/README.md)：`SMOKE1_EXIT=0`、`STDERR_SIZE=0`（L 门 0 error）、18081 → 200 OK（T 门）、**条件①②均证伪**（`TASK工具=无`；事件面仅类型无实现）→ 触发 §5 预案 = **B 路径决议** |
| 1 | ~~立 I19、I20~~ → **仅立 I19**（I20 取消，B 无子代理）；ADR 状态落为已批准-B | ✅ **已完成**：INVARIANTS.md L26 新增 I19（无 I20 行）；`npm run check` 47/47 保持 |
| 2 | Wave 1 补洞（I20 相关项剔除） | ✅ **已完成（2026-09）** → 单测 47→**61 · 全绿 · `npm run check` exit 0**（run_state/reconcile/scope 匹配+fail-closed/I14 journal/I19 coverage/证据梯/instead/validate_scope/SOW×2）；**真机回归** → [`tests/2026-wave1-regression/`](tests/2026-wave1-regression/README.md)：`RUN_EXIT=0`、`STDERR_SIZE=0`（L1）、三探针实测=预期（T2）、**fail-closed 真机拒绝** + `SCOPE_DENIED_COUNT=2`（I14 落 journal，S1 本地）、§6 token=35832 → **过 T1/T2/T3/S1/I14/§6** |
| 3 | **B 路径瘦身 MVP**（取代原分发 MVP）：父面按域动态收窄工具 schema + 知识渐进装载（description 先行/`read_reference` 按需）+ `Spec.max_tokens` 接 I10 | ✅ **代码面完成**：`npm run check` **67/67 · exit 0**（47→67：`tool-surface` lite/HCOT=0/domain 三门 + `Spec.maxTokens`→token_budget 失败 + tokens 跨重启持久）；**真机 e2e** → [`tests/2026-bpath-e2e/`](tests/2026-bpath-e2e/README.md)：双 FLAG + **5 E-id 物理落盘**（T2/T4）、`OUTSIDE_18081=0`（T3/S1）、§6 token=138649+36854、**拒绝→纠偏行为实录 PASS**（引用 scope 判定+替代路径）→ **过 L/T1–T4/S1/§6**；⚠️ 残余：破甲自动检测钩子 `-p` 单发不触发（检测函数 probe 已证有效，advisory SIZE=0）——记入套件 §5，interactive 复测排下轮 |
| 4 | Wave 2 协议 → **A/B：现状 vs B 瘦身**（n≥3 真调用，同靶场同 prompt） | ✅ **已完成（2026-09）** → 协议：STANDARD 八处改造（§5.5 R 门 / T2 禁自报+三元组 / 预算冻结+双时钟 / runs 目录 stats 原子写 / §6 六列+totalTokens 不计 / C2 加列 / checklist 三查）；**A/B 套件** → [`tests/2026-ab-bpath-slim/`](tests/2026-ab-bpath-slim/README.md)：n=3/臂 6 次真调用 **pass@3 双 3/3**、九门全绿（L/T1/T2/T3/T4/C/R/S/§6）、**B-lite 中位 wall −30% / token −46% / bash −53%**，极差重叠 → 方向性支持、n=3 不作统计定论（数据说话，未预设阈值） |
| 5 | Wave 3 并行 + Wave 4 工具面 | ✅ **Wave 4 已完成（2026-09）**：`npm run check` **75/75 + lint 4/4 · exit 0**（attack 字段+格式拒错 / api playbook / lint 进 check / attack-coverage→navigator / MCP 桥零 SDK+假服务器集成 / config mcp.servers / export 三件 / 索引四要素+雷达 / **50 条反模式 8 映射+KNOWN GAPS**；T639 经本地 ATT&CK 全映射零命中判伪删除）；**真机套件** → [`tests/2026-wave4-tools/`](tests/2026-wave4-tools/README.md)：attempt1 bash 宿主故障如实入档（**I11 真机拦截** `not_allowed_next` + 模型拒伪造）· attempt2 **双 FLAG + E-001..006×6 文件 + api playbook 9-satisfy 推进至 report**，过 L/T1–T4/S1/I11/§6（token 合计 806347）→ **过全部门禁**；**Wave 3 并行按决议暂挂**（执行体依赖 A′/A″，不计本目标必成项） |

## 5. 开放条件（会改变范围/实现）

1. ~~本机 `pi` 是否默认暴露 task/子代理工具~~ → ✅ **已定案：无**（`2026-dispatch-smoke`：模型自报 `【TASK工具=无】`、工具列表无 task、`pi --help` 无参、dist `.js` 无实现）。
2. ~~子线程事件 cross-post 文本完整性~~ → ✅ **已定案：不可用**（`events.d.ts:791` 有 subagent 类型、dist `.js` grep `subagent` = 0 命中；且无子代理可起，条件①的下游）。
3. token 实测疑点：套件 C 组 usage=0 缺口、cacheWrite=0 —— 测 B 瘦身 A/B 时按 STANDARD §6 盯（**开放**）。
4. **A″ 重启前置（新增，仅备选路径）**：扩展内 `child_process` 可用性真机验证 + 按案长驻冷启动 token 成本实测（**开放，不阻塞 B 路径**）。

## 6. 关联

- 架构/里程碑：[../DESIGN.md](../DESIGN.md)（§5 两层运行、§13 M6）
- 不变量单源：[INVARIANTS.md](INVARIANTS.md)（I1–I18；I19/I20 待立）
- 测试单源：[tests/STANDARD.md](tests/STANDARD.md)（本方案 Wave 2 改它）
- 宿主共存：[COMPAT.md](COMPAT.md)（SoL-Pi 效率层复用边界）
- 选型稿（不重复）：[PLAN-best-of-breed.md](PLAN-best-of-breed.md) · 流程：[methodology.md](methodology.md) §5
- 参考仓：`../reference/repos/**` —— **仅人类调研，不入发布、不进运行时**
