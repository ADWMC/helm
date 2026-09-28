# 上下文优化 (Agent Context Optimization)

> 长程 agent 的上下文无界增长会同时压垮两件事：**推理成本**和**推理质量**。
> 这一篇来自 `arXiv:2510.00615` (ACON, KAIST/Microsoft/Cambridge)，实测
> **峰值 token 降 26–54% 的同时任务成功率上升**。
> 关键点：它不是压缩启发式，是**在自然语言空间里优化压缩准则**。

## 适用范围

**Use when**：轨迹变长后模型开始跑偏、成本失控，或需要判断"该丢什么、留什么"时。

**不用于**：
- 单轮短任务（没有压缩收益）
- 证据保全（Receipt 必须存原始输出，压缩会污染证据链 —— 见"与 helm 的边界"）

## 问题分解

论文把上下文分成两类，分别处理：

| 类型 | 内容 | 增长方式 |
|---|---|---|
| **Observation（观察）** | 工具返回、环境反馈 | 单次可能极大（一个长 stdout 就爆） |
| **History（历史）** | 过去轮次的动作+结果 | 累计线性增长 |

**两者压缩策略不同**：观察要"保真截断"（留住关键行），历史要"摘要演化"
（丢掉过程，留状态）。

## 核心机制：在语言空间优化准则

ACON 不做参数微调，而是优化一段**压缩准则 P（自然语言 prompt）**：

```
U = (任务奖励) − λ·(上下文成本)
   最大化成功率       最小化 token
```

用**对比式反馈（contrastive task feedback）**迭代 P：

```
1. 在训练集上跑两遍：
     A = 不压缩跑     (基线上下文 H)
     B = 压缩跑       (压缩上下文 H')

2. 找出**A 成功但 B 失败**的任务 → 对比子集 D_cont
   ← 这批任务精确定位了"压缩丢掉了什么关键信息"

3. 对 D_cont 里每个任务，把压缩前后的上下文喂给 optimizer LLM，
   让它用自然语言说出"为什么压缩后失败了" → 得到反馈文本

4. 聚合多条反馈（拼接），当作"自然语言梯度"更新 P

5. 生成多个候选 P_k，在 D_cont 上评估，选最好的 → 效用最大化步 (UT)
```

**为什么对比式反馈比标量奖励好**：论文原文说得很清楚 ——
"如果 agent 用压缩上下文失败了、用未压缩上下文成功了，这说明压缩丢了关键信息"。
这种**轨迹级对比**给出的是"具体丢了什么"，而二元成功/失败只给"丢没丢"。

## 第二步：压缩最大化 (CO)

只优化成功率会**忽略成本**（可能留太多）。所以 ACON 做**交替优化**：

```
第二轮：只喂**压缩后仍成功**的任务，问 optimizer LLM：
  "哪些信息实际被用到了？"
→ 精炼 P(1) → P(2)，鼓励"更短但充分"的上下文
```

**这就是压缩最大化步 (CO)**：最小化成本项，同时不牺牲成功率。

**工程上可直接抄的结构**：

```
for round in [UT, CO]:
    UT: 关注失败案例 → 问"丢了什么" → 补回来
    CO: 关注成功案例 → 问"用了什么" → 去掉没用上的
    两轮交替，直到成功率不降而 token 下降
```

## 一个要记住的坑：压缩会伤小模型

论文有一个反直觉结果：**压缩对小模型是净收益，对大模型可能是净损失**。

- 小模型（能力弱）：压缩**减少干扰**，成功率最多 **+46%**
- 强模型：压缩损失的信息它本来能自己处理

**所以"压缩率"不是越高压越好。** 应该按目标模型能力调。

## 与 helm 的边界（重要）

helm 有明确的证据纪律，压缩不能违反：

| 对象 | 能否压缩 | 理由 |
|---|---|---|
| `Receipt`（原始工具输出） | **不能** | `compileFinish` 要求 finding 依据是 receipt 的**精确切片**；改写即断链 |
| 送入模型的对话历史 | **可以** | 这是 ACON 的目标对象 |
| `Observation`（已落地的证据） | **不能删** | 同上，是 finish_basis 的合法来源 |
| 每轮拼装的 system prompt | **可以** | helm 已有 tool-memory 的 budget 截断先例（`recallForPrompt`） |

**helm 已有的对应物**（读源码核对，非推测）：

- `tool-memory` 的 `recallForPrompt({ budgetTokens })` —— 只召回已验证条目、超预算截断、
  过期不注入。**这已经是 ACON"按预算选择"的雏形**，只是范围仅限工具记忆。
- **`sol-pi` 的 `online-context-compact` 扩展 —— helm 已有完整的上下文压缩**，
  且比 ACON 在成本侧更细：
  - `decideCompaction()` 做的是**经济学判据**：算 `savingTokens = archiveTokens - memoTokens`，
    再除以 `incrementalCacheCostRatio` 得**收支平衡所需请求数**，与剩余请求数比较。
  - 有 `windowReserveTokens` / `keepRecentTokens` / `firstCompactionRequestScale` /
    `subsequentCompactionMargin` 等可调参数，集中在 `DEFAULT_COMPACTION_ECONOMICS`。
  - 压缩后发 `POST_COMPACTION_PLAN_REMINDER`，要求重新 `update_plan` ——
    **防止压缩后 agent 丢失任务上下文**，这是 ACON 没有提的一手。
- `sol-pi` 的 `evidence-preserving-reducer` —— "压缩但保证据"（归档原文到内容寻址路径，
  receipt 给出切片引用）。**与 ACON 的"压缩摘要 + 可回溯原文"完全同构。**

**所以真正的缺口不是"没有压缩"，而是"压缩准则没有被优化"：**

| | ACON | helm |
|---|---|---|
| 何时压缩 | 固定阈值 | **经济学判据（更细）** |
| 压什么 | 准则 P 决定 | `BOUNDARY_COMPACTION_INSTRUCTIONS` —— **一句硬编码常量** |
| 准则从哪来 | **对比式反馈迭代出来** | 手写，不学习 |
| 成本模型 | `λ·token` | **收支平衡请求数（更细）** |

**ACON 可搬的那一点**：helm 的压缩**指令是写死的**（
`"Preserve completed work, verification results, important decisions, and remaining work."`）。
ACON 的做法是拿"未压缩成功 / 压缩后失败"的**对比样本**去迭代这条指令本身。
**helm 缺的是这个反馈回路，不是压缩机制。**

## 反模式

| 反模式 | 为什么错 | 正确做法 |
|---|---|---|
| 压缩 receipt 原文 | 断掉 finding 的精确切片依据 | 原文归档，压缩只作用于送入模型的历史 |
| 用固定压缩率 | 论文：压缩对大模型可能是净损失 | 按目标模型能力调 |
| 只优化成功率 | 会留下大量无用上下文 | UT/CO 交替，成本也要优化 |
| 用标量奖励调准则 | 只说"丢没丢"，说不出"丢了什么" | 对比式反馈：拿 A 成功 B 失败的样本 |
| 一次性总结全部历史 | 丢失细节后无法回溯 | 摘要 + 内容寻址原文（sol-pi 已这么做） |

## 关键词

context engineering · context optimization · context compression · ACON ·
history compression · observation compression · token budget · contrastive feedback ·
prompt optimization · long-horizon agent · 上下文优化 · 上下文压缩 · 长程 agent

## 来源

- `arXiv:2510.00615` — "ACON: Optimizing Context Compression for Long-horizon LLM Agents"
  (Minki Kang et al.; KAIST / Microsoft / Cambridge). 代码：
  https://github.com/microsoft/acon 。在 AppWorld / OfficeBench /
  Multi-objective QA 上测，峰值 token 降 26–54%，小模型成功率最高 +46%。
