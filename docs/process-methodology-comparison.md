# 流程与方法论对比：成熟项目 × helm-pi

> **历史研究（只读）**：本文保留流程比较和早期方法论取舍，不是当前产品规范或开发任务来源。
> 当前活动方案以 [`REDESIGN.md`](REDESIGN.md) 为准。

> **范围**：流程（谁在什么时候做什么）与方法论（怎么想、怎么判完成），不是包结构 API 抄写。  
> **对照源**：PentestGPT · Cairn · CAI · PentAGI · helm-d · Ponytail · helm-pi（本仓）  
> **日期**：2026  
> **关联**：[mature-projects-comparison.md](mature-projects-comparison.md)（完成/状态/工程）· [methodology.md](methodology.md)（本仓方法论）· [ponytail-absorption.md](ponytail-absorption.md)

---

## 1. 总览：六家流程骨架

| 项目 | 流程一句话 | 方法论载体 | 驱动 |
|------|------------|------------|------|
| **PentestGPT (agent)** | Supervisor 提最小任务 → Executor 做一件 → 钉 observation → 重复或 finish | 类型化 TaskKind + done_when + prompt 里最短路径纪律 | 代码环 |
| **Cairn** | origin/goal 图上：bootstrap / reason / explore → Fact 链到 goal | prompt JSON 契约（何时可 complete）+ Hint | 图 + Dispatcher |
| **CAI** | 选领域 Agent → 工具/handoff 推进 →（可 continue） | 各 Agent 的 instructions + 工具分类 | LLM 编排 |
| **PentAGI** | SOW 定 scope → 主 Agent 一串检查清单 → 流水线产出报告 | **长清单式 SOP prompt** + 监督限额 | 自治 + 监督 |
| **helm-d** | persona 纪律 + 分诊→…→决策点 + references 按需 | principles + evidence workflow（**多为散文**） | 人在环 |
| **Ponytail** | 每响应保持「懒阶梯」；lite/full/ultra | 单 skill **阶梯 + 强度过滤** | 注入规则 |
| **helm-pi（本仓）** | 七纪律 + Playbook 阶段门 + 完成四态；Session/Run 双驱动 | **methodology 单源 + YAML playbook + INVARIANTS** | 文档+可测门禁 |

---

## 2. 流程对比（阶段怎么走）

### 2.1 阶段从哪来

| 来源 | 阶段定义方式 | 例 | 可机器强制？ |
|------|--------------|----|--------------|
| **PentAGI** | 超长 **action plan prompt**（列 endpoint × 漏洞类） | 每端点查 PT/XSS/SQLi/… | 弱（靠模型走清单） |
| **helm-d evidence/workflow** | Markdown **Phase gates + deliverables 清单** | intake 报告 → reverse → vuln | **弱**（要模型自觉） |
| **Cairn** | **没有固定阶段**；只有任务形 bootstrap/reason/explore | 图生长代替阶段 | 协议强制 complete 引用 |
| **PentestGPT** | **没有 Playbook 阶段**；有 **TaskKind 序** | discover→test→exploit→verify | **强**（compile_plan） |
| **CAI** | 按 **选中的 Agent** 换域；无统一阶段表 | redteam → dfir | 弱 |
| **helm-pi** | **Playbook YAML**（schema、gate_out、next） | `reverse`：scope→intake→triage→… | **强**（Domain 拒 next，设计已定） |

**结论 1**：成熟项目分两派——  
- **清单派**（PentAGI、helm-d 散文）：人读起来清楚，**代码不拦**。  
- **编译器/图派**（PG、Cairn）：完成与依赖 **代码拦**。  
helm-pi 已选 **Playbook 门禁 + 完成编译器**，方法论文档负责「人和模型怎么理解」，**不靠背诵过关**。

### 2.2 人在环 vs 自治

| | 何时要人 | 怎么要 | helm-pi |
|--|----------|--------|---------|
| **PG** | 几乎不要（部署即边界） | — | Run 默认自治；高风险 HITL |
| **Cairn** | Hint 随时 | 协议 Hint 表 | Hint 表（I17） |
| **CAI** | 会话里可选 | REPL | Session 人在环 |
| **PentAGI** | SOW 审批在开工前 | 模板 | **SOW-TEMPLATE** → Spec |
| **helm-d** | **每阶段末决策点菜单** | ask_user_question | 保留菜单；Run 默认自动最浅步 + 高风险 HITL（纪律 7） |
| **helm-pi** | 同左 + HITL | Hint / approve | E9 / Playbook hint_menu |

**结论 2**：helm-d **阶段全靠人点**做不大；helm-pi 把「决策点」降为 **hint_menu 默认自动、人可插 Hint**，避免小任务被菜单拖死，大任务仍可干预。

### 2.3 知识与规则怎么进上下文

| 项目 | 知识在哪 | 怎么进模型 | 风险 |
|------|----------|------------|------|
| **CAI** | Agent instructions + tools 文档 | 选 Agent 即带人格 | 长 instructions |
| **PentAGI** | **SOP 整段进 prompt** | 一次贴大清单 | token 爆、难测 |
| **helm-d** | **references/ 只读** | `read_reference` | 好；但 workflow **没代码门** |
| **Ponytail** | skill 正文 | **按档过滤注入**每响应 | 好；但只管写代码 |
| **PG** | 几乎不读外部知识 | 短 Supervisor/Executor 指令 | 任务窄 |
| **Cairn** | 图 YAML 快照 | 每任务喂图 | 图大则贵 |
| **helm-pi** | **references + playbook 数据** | 按需读；persona 只留纪律 | 对齐 P3；**待实现门禁闭环** |

**结论 3**：我们方法论 **载体选对了**（单源 + YAML + 按需读）；差距在 **Playbook gate 是否真的在 Loop 里执行**（设计有、工程要闭环）。

### 2.4 范围（Scope）流程

| 项目 | Scope 形态 | 强制点 |
|------|------------|--------|
| **PentAGI** | SOW 模板（allowed/forbidden/stop） | prompt 声明 |
| **PG** | `allowed_targets` 字节白名单 | **compile_plan 拒** |
| **helm-pi** | Spec + ScopeGate + SOW 模板 | **assertStepPlan**（已有） |
| **helm-d** | persona/AGENTS 工作区话术 | **弱**（曾因此拒答/误伤） |
| **Cairn** | origin 即边界 | 协议 from 禁 goal 等 |

**结论 4**：范围流程我们已 **向 PG 对齐**（代码拒）；比 helm-d 强一个量级。

### 2.5 工具与证据流程

| | 选工具 | 证据 | helm-pi |
|--|--------|------|---------|
| **PentAGI** | 20+ 容器工具货架 | Flow 树 | 未全量迁 |
| **helm-d** | find_tool 阶梯 + toolbox | save_evidence + E-id | **已迁** case/evidence |
| **PG** | 全 provider 工具 | **exact receipt** | **已迁** groundExcerpt |
| **CAI** | kill-chain 六类 | 相对松 | 只借标签思想 |
| **Ponytail** | 平台优先表 | 自测 assert | 未迁（笔记有） |

---

## 3. 方法论对比（怎么想、怎么判）

### 3.1 核心「戒律」对照

| 戒律 | helm-d | PG | Cairn | PentAGI | Ponytail | **helm-pi** |
|------|--------|-----|-------|---------|----------|-------------|
| 不编造 / 证据优先 | ✓ 原则 | ✓ exact quote | Fact 轻引用 | 报告要求 | 懒但不谎 | **P4 + 纪律 3** |
| 一次一小步 | 部分 | **最小 evidence-backed task** | 一 Intent 一 Fact | 清单细步 | 阶梯一档 | **纪律 4** |
| 完成可拒 | 弱（关案门） | **finish_basis** | **complete 引用 Fact** | 状态机 | — | **四态 + L1–L4** |
| 范围硬 | 弱 | **强** | origin | SOW | — | **ScopeGate** |
| 外部内容当数据 | AGENTS | 明文 | 图是数据 | — | — | **纪律 6 / P9** |
| 按规模选强度 | mode 三档 | 单窄环 | 无档 | 全清单默认 | **lite/full/ultra** | **纪律 7 + analysis_mode** |
| 防跑偏 | advisory/dead-end | 收敛短板承认 | reason 看 open intents | Mentor 限额 | YAGNI | supervise 设计 |
| 人在环节奏 | **每阶段菜单** | 极少 | Hint | SOW 前 | /ponytail | **菜单可自动+Hint** |

### 3.2 我们方法论的结构优势

相对多数成熟项目，helm-pi 方法论文档已经是 **「分层可执行」**：

```text
docs/methodology.md     → 人与模型：入口、七纪律、域流程叙述
references/playbooks/*  → 机器：阶段、deliverable、gate_out
docs/INVARIANTS.md      → 测试：I1–I18
docs/SOW-TEMPLATE.md    → 范围输入
src/domain/*            → 代码：完成/范围/门禁
```

**多数成熟项目只有其中 1–2 层**：  
- PentAGI 强 SOP、弱代码完成门  
- PG 强完成门、**几乎没有领域 playbook 叙述**  
- helm-d 强知识叙述、**弱代码完成门**  
- Cairn 强图协议、阶段自由  

helm-pi 的 **产品意图**是：**叙述层 + 数据阶段 + 代码门禁 + 双驱动（人/Run）四层齐全**。

### 3.3 我们方法论仍不如成熟项目的点

| 缺口 | 对标谁 | 说明 |
|------|--------|------|
| **A. Playbook 未进 Loop 硬拒** | PG compile_plan / 设计 §3.2 | 文档有 gate，**Loop 还未系统拒绝非法 next**（部分测试有 checkGateOut） |
| **B. 领域步骤仍偏叙述** | PentAGI 一张网清单 / PG TaskKind | web/ctf 等 YAML 尚薄；域 checklist 不如 PentAGI 密 |
| **C. 收敛策略未成环** | PG 实弹教训 / 自研设计 | 「连续 discover 强制 test→exploit」有设计，**缺多阶段 Run 实弹** |
| **D. 领域专家切换** | CAI `/agent redteam` | 我们有 playbook + 领域工具，**弱「人格/Agent 切换」产品面** |
| **E. 监督深度** | PentAGI Mentor/Planner | supervise **已写**，未挂到真实长任务 |
| **F. 人在环 vs 自治默认** | helm-d 菜单太重 / PG 太裸 | 纪律 7 已写；**lite 默认减跳转未产品化** |
| **G. 战役级 SOP 长度** | PentAGI base_web_pentest | 我们 method 叙述短而精；**极细检查树**可放 references 不进门禁 |
| **H. 持续验证闭环** | Ponytail agentic bench / PG qualification | 有小靶场 A/B；**缺同规模大任务验收** |

---

## 4. 流程形态对比图（方法论「形状」）

```text
PentestGPT:   [typed step loop]────────finish=compiler
Cairn:        [graph OODA]────────────complete=protocol
PentAGI:      [SOW]→[huge checklist prompt]→[flow report]
CAI:          [pick specialist]→[tools/handoffs]→chat
helm-d:       [persona]→[phase essays]→[user menu]→[E-ids]
Ponytail:     [inject ladder every turn]
helm-pi:      [SOW+scope]→[playbook gates]→[propose/compile]
              ↘ Session 人在环 ↘ Run 自治（同一完成链）
```

---

## 5. 一张「该学谁」的流程表（给 helm-pi）

| 流程环节 | 最佳参照 | 已有？ | 动作 |
|----------|----------|--------|------|
| 范围模板 | PentAGI SOW + PG 白名单 | ✓ 模板 + ScopeGate | 保持 |
| 最小任务提案 | PG smallest evidence-backed | 设计 ✓ / Loop 部分 | 长 Run 验收 |
| 类型边界 | PG TaskKind 禁止穿越 | compile 有 TEST 词表 | 扩 kind 车道 |
| 图上长程 | Cairn Fact/Intent/Hint/reopen | Ledger 有 | 多 Worker 后期 |
| 领域阶段可拒 | 设计 Playbook（自研） | YAML+门测试 | **Loop 接 gate** |
| 细检查树 | PentAGI 清单 | 弱 | 写进 **references/web** 非 prompt |
| 专家角色 | CAI agents | 弱 | `/helmpi agent` 或 playbook 默认人格 |
| 监督防卡 | PentAGI Mentor + PG 收敛教训 | supervise 代码 | 挂 Run |
| 写码节制 | Ponytail 阶梯 | 纪律/笔记 | methodology §4 工具选择强化 |
| 按规模选档 | 自研纪律 7 + Ponytail 档 | ✓ 文档 | **lite 默认减工具跳** |
| 完成语义 | PG finish + Cairn complete | 设计全 + 代码部分 | 保持；补 reopen 实测 |
| 知识按需 | helm-d principles | ✓ | 保持 |
| 测试标准 | 自研 STANDARD + Ponytail bench 思想 | ✓ | 加大任务套件 |

---

## 6. 差异化：helm-pi 流程的「自有形状」

不要变成「又一张 PentAGI 清单」或「又一个 PG 环」。自有合成是：

```text
┌─ 输入：SOW/Spec（PentAGI 范围） ─────────────────────────┐
│  Session：人在环分析（helm-d 知识 + 菜单可选）            │
│  Run：提案/编译（PG 完成语义）                            │
│  图：Claim/Direction/Hint（Cairn 长程，可选）              │
│  阶段：Playbook 门禁（自研，代码可拒）                     │
│  纪律：七条（含规模档）+ 证据 E/Obs（helm-d+PG）           │
│  效率：SoL-Pi 共存；工具按需（非每轮全跳）                  │
└──────────────────────────────────────────────────────────┘
```

**一句话**：  
成熟项目各自 **一段强**（PG 完成、Cairn 图、PentAGI 清单、CAI 角色、helm-d 知识、Ponytail 节制）；  
helm-pi 方法论的正确目标是 **四层对齐（叙述 / 阶段数据 / 不变量 / 运行）**，用小任务证明门禁不空转，用大任务证明 harness 非摆设——而不是在 33s 玩具题上比谁更快。

---

## 7. 下一步（流程向，可进 backlog）

1. **P0** Loop 硬接 `canEnterNext`（非法阶段 → blocked，对齐设计 §3.2）。  
2. **P0** `analysis_mode=lite` 默认少 route/reference（纪律 7 产品化）。  
3. **P1** web/ctf playbook 从叙述扩到 **可 gate 的 deliverable 键**。  
4. **P1** 收敛车道（连续 discover → 强制 test/exploit）进 Run。  
5. **P2** `/helmpi agent <domain>` 角色切换（CAI 形态，皮在 playbook/工具集）。  
6. **P2** 大任务测试套件（多阶段、可恢复、比完成不比秒）。

---

## 8. 修订

| 版本 | 说明 |
|------|------|
| **1.0** | 流程×方法论横向对比；七家骨架、阶段/知识/scope/完成、该学谁表、自有形状 |
