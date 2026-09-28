# 意图理解与主动澄清 (Intent Understanding & Clarification-Seeking)

> 用户请求欠定时，是**猜**还是**问**？这一篇给判据。来自 2026 年两篇实证论文：
> `arXiv:2603.26233` (Ask or Assume?, Univ. Vienna) 与 `arXiv:2502.04485` (Active Task
> Disambiguation, ICLR 2025)。核心反直觉结论：**问对了比不问强得多，问错了比不问更差。**

## 适用范围

**Use when**：请求含未指定前提、目标有多种合理解读、或"做完了"的标准本身不清楚时。

**不用于**：
- helm 运行中的授权确认（那被 S1 条款明确禁止 —— 见下方"与 helm 条款的张力"）
- 已有明确 Spec 且 `done_when` 可判定的任务
- 需要向第三方站点/资产所有者确认的动作（不是"问用户"，是"出范围"）

## 核心发现（有数据）

`arXiv:2603.26233` 在 **欠定版 SWE-bench Verified** 上实测：

| 配置 | 任务解决率 |
|---|---|
| 标准单 agent（不问） | 基线 |
| **不确定性感知（单 agent + 每轮自检）** | 提升 |
| **不确定性感知（多 agent：Main + Intent）** | **69.40%** |
| 全指定指令（上限参照） | 接近 69.40% |

三点可直接搬的结论：

1. **多 agent 解耦是关键**：把"检测欠定"从"执行代码"里拆出来。同一个模型既写码又判断
   自己是否缺信息，会系统性漏判。
2. **校准会出现**：论文实测该结构在简单任务上少问、复杂任务上主动问 —— 不是无脑问。
3. **模型无先验提示时也能自己发现欠定** —— 不给"这个 issue 是欠定的"这种提示，
   只用默认任务 prompt，模型仍能识别。**所以不需要在 prompt 里说"你可能会遇到欠定"。**

## 判据一：该不该问（不确定性阈值）

单 agent 版（UA-SINGLE）的做法很朴素，可直接抄：

```
每轮结束时自问：
  1. 我当前要执行的动作，是否依赖某个我尚不知道的信息？
  2. 这个信息能否从**已有上下文或工具**获得？
     → 能：去拿，不要问人。
     → 不能：这是欠定，进入判据二。
```

**关键约束**：只有"无法从工具获得"的信息才够格问人。**能从仓库/文件/网络查到的，
去查，不要问。** 论文里 agent 用 `clarify` 工具问用户的前提正是这一点。

### 反过度提问

`arXiv:2502.04485` 记录了明确的失败模式：**Kimi K2.6 上出现
"over-querying"** —— 明明能解也照样问。该论文的缓解手段是给 Intent Agent 加条件：

> "... or when the user cannot provide any further details or explicitly asks you to keep
> working on the task"

**即：用户已说"我也不知道更多"或"你先干着"时，必须停止提问。** 这条要硬编码进判据。

## 判据二：问哪个（信息增益选择）

这是 `arXiv:2502.04485` 的核心贡献，也是最可操作的部分。

**朴素做法（零样本让模型自己问）效果差** —— 论文明确说这是模型的弱项，
因为预训练语料里澄清问句本身就少。

**正确做法：显式评估候选问题的信息增益（EIG）**，算法如下：

```
给定当前问题陈述 S_t：

1. 采样 N 个候选解法 {h_i} ~ p(solution | S_t)
2. 采样 M 个候选问句 {q_j} ~ p(question | S_t)
3. 对每个 q_j，对每个解法 h_i 求伪答案 a_{i,j}
4. 对每个 q_j 估计信息增益：
     answers = 唯一的答案集合 {a_1..a_n}
     对每个 a_k:  n_k = |{i : a_{i,j} = a_k}|
                  p_k = n_k / N
     EIG(q_j) = -Σ_k p_k * log(p_k)          ← 答案分布的熵
5. 选 q* = argmax_j EIG(q_j)
6. 记录用户答案 a*，扩展 S_{t+1} = S_t ∪ (q*, a*)
```

**直觉**：一个好问题会让候选解法**分裂成尽量均匀的几堆**（熵最大）。
如果无论怎么答，解法都不变，那个问题就**没有信息量**，不该问。

论文的形式化：`U(q) = EIG(q) − c(q)`，其中 `c(q)` 是获取答案的代价
（用户被打断的成本）。**问题有成本，所以要除以收益。**

### 落地建议

N 不必大。论文用少量自生成解法采样即可区分候选问句。工程上：

- **N = 3~5 个候选解法足够**，用当前模型直接采样
- **M = 3~5 个候选问句**，让模型生成
- 算 `EIG` 是纯算术，不需要再调模型
- 选 top-1，**只问一个问题**（多问 = 多成本 + 用户负担）

## 与 helm 条款的张力（重要，必须处理）

helm 的 `<helm_s1>` 第 3 条原文（`prompt-lib.ts:45-46`）：

> 3. No mid-run human questions — never pause for confirmation inside a run; if blocked,
>    stay on Spec scope and continue with a bounded alternative (or end via the budget path).

**注意措辞是 "no mid-run human questions"，比"禁止授权确认"更宽** —— 字面上覆盖了
任何提问。同一文件的 `LITE_BASE` / `FULL_BASE` 还各有一句
`never emit interactive menus or mid-run questions`（:132）。

**这与"主动澄清"表面冲突。实际不冲突，但需要精确划界：**

| | 问什么 | 允许吗 |
|---|---|---|
| **授权确认** | "我可以测这个目标吗？" | **禁止** —— 授权来自 Spec，条款 1 正是为此 |
| **范围确认** | "这个 IP 在范围内吗？" | **禁止** —— scope 门判定，不问人 |
| **目标澄清** | "你说'修好'是指哪个行为？" | **条款字面禁止，但技术上应允许** —— 这不是授权，是任务定义 |
| **前提澄清** | "你说已有备份，是哪个快照？" | 同上 —— 缺这个信息无法正确执行 |

**区分标准：问题是否改变任务的授权边界或范围。**

- 不改变 → 是任务定义问题 → 应当允许（但走 EIG 选择，且只问一次）
- 改变 → 是授权/范围问题 → 必须禁止 → 保持条款 3 行为

`docs/REDESIGN.md` §4.4 把破甲定义为"针对拒答约束，不是授权边界"——
这个区分与上面完全一致。**澄清属于允许的"改变任务表达"，不属于被禁的"扩边界"。**

**所以要落地这项能力，必须改条款 3 的措辞**（例如改为
"no mid-run *authorization or scope* questions"），否则模型会照字面拒绝澄清 ——
**这正是"边界不可见就是陷阱"的同一个问题：条款越权禁止了本该允许的动作。**

## 反模式

| 反模式 | 为什么错 | 正确做法 |
|---|---|---|
| 零样本让模型"有疑问就问" | 论文实测此路不通，过问 + 问不到点 | 走 EIG 选择，只问 top-1 |
| 一次问 5 个问题 | 成本线性叠加，用户负担 | 拆成多轮，每轮只问信息增益最大的那个 |
| 用户说"你先干着"还继续问 | over-querying 失败模式 | 硬条件：用户拒绝提供后停止提问 |
| 能查到的东西去问人 | 问人成本 > 工具成本 | 先穷尽工具，再考虑问 |
| 同一 agent 既执行又判欠定 | 论文：单 agent 系统性漏判 | 解耦成独立角色 |
| 把授权问题伪装成"澄清" | 绕过 Spec 边界 | 授权只能来自 Spec，问不出授权 |

## 关键词

intent understanding · clarification seeking · underspecification · ambiguity ·
information gain · EIG · entropy · active task disambiguation · ask vs assume ·
over-querying · calibrate · 用户意图 · 澄清提问 · 欠定 · 消歧

## 来源

- `arXiv:2603.26233` — "Ask or Assume? Uncertainty-Aware Clarification-Seeking in Coding
  Agents" (Nicholas Edwards, Sebastian Schuster; Univ. Vienna). 多 agent 结构 +
  校准实测 + SWE-bench 欠定变体。
- `arXiv:2502.04485` — "Active Task Disambiguation with LLMs" (ICLR 2025).
  EIG 形式化 + 算法 1 + over-querying 记录 + 提示模板在附录 D。
