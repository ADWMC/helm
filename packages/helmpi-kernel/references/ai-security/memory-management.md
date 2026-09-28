# Agent 记忆管理 (Memory Management)

> 记忆不是"存下来再按相似度检索"。两篇论文指向同一个结论：
> **记忆的关键动作是"作废"，不是"召回"。**
> `arXiv:2601.01885` (AgeMem) 把记忆操作变成显式工具；
> `arXiv:2609.30289` (HiCoMER) 指出扁平池检索会捞出**语义相关但已失效**的记忆。

## 适用范围

**Use when**：跨会话/长程任务中出现"用了过时结论""重复之前的错误""上下文里
互相矛盾的说法"时；或需要设计记忆写入/淘汰策略时。

**不用于**：单会话内的即时上下文管理（→ `context-optimization.md`）。

## 核心问题：相似度检索会捞出失效记忆

HiCoMER 指出的失败模式很具体：

> "they often surface semantically relevant but **outdated or conflicting** memories,
> especially individual memories that no longer align with current team consensus"

**根因**：扁平池按语义相似度/重要性/新近度排序，**没有任何机制表达"这条还有效吗"**。

具体例子（论文场景）：某个成员早期记录"决策 A 可行"，后来团队共识改成了决策 B。
相似度检索会把"决策 A 可行"排在前面（因为问句讲的就是决策），**得到已作废的结论**。

**对 helm 的直接映射**：`tool-memory` 目前有"stale never injected"的机制 ——
**这个方向是对的**。但需要检查它判定"过期"的依据是时间还是**有效性变更**。
时间过期 ≠ 逻辑作废。

## 结构一：记忆操作显式化为工具 (AgeMem)

AgeMem 的做法：**把记忆管理变成 agent 可自主调用的动作**，而不是外挂的启发式控制器。

```
暴露为一等动作：
  store     存
  retrieve  取
  update    改
  summarize 摘要
  discard   丢
```

**为什么重要**：论文的批评是"LTM 和 STM 被当作独立组件，靠启发式或辅助控制器连接，
限制了适应性"。**把决定权交给 agent 自己**，让"什么时候记、记什么、什么时候扔"
成为策略的一部分。

**helm 的对应物**（读 `src/memory/tool-memory.ts` 核对）：

`ToolMemoryStore` 的实际方法只有四个：`upsert` / `search` / `verify` /
`recallForPrompt`（外加 `all` / `close`）。库内还有 `tool_memory` 表，
字段含 `status TEXT NOT NULL`、`probe TEXT`、`last_verified INTEGER`。

**关键：`ToolMemStatus = "verified" | "stale"`，且注释写明
"failed re-verify → stale → never injected"。**

| HiCoMER 的要求 | helm 现状 |
|---|---|
| 有效性字段 | **已有** —— `status` + `last_verified` + `probe` |
| 检索前先过滤失效 | **已有** —— stale 条目从不注入 `recallForPrompt` |
| 冲突时取代而非并存 | **已有** —— `uq_tm_key` 唯一索引 `(scope, scope_key, kind, name, target)`，`upsert` 天然取代 |
| 显式 discard 动作 | **无** —— 没有"这条作废"的独立动作 |

**所以 HiCoMER 的核心mechanism，helm 的 tool-memory 基本都有了** ——
唯一索引保证取代，`status=stale` 保证不注入。**这一点要如实说明，不能照抄论文说
"helm 缺有效性过滤"。**

**真正的差别在两处：**

1. **有效性判据是"探针可重验"，不是"逻辑是否被推翻"**。
   `verify(id, probeOverride)` 靠**重跑探针**判 `verified`/`stale`。
   适合"这个工具路径还在不在"，**不适合"这个结论是否被后续证据推翻"**。
   HiCoMER 的冲突更新器处理的是后者。
2. **缺少 `discard` 动作**（AgeMem 的五个动作 helm 只有三个：
   `upsert`≈store+update / `search`≈retrieve / 无 summarize / 无 discard）。
   helm 用 `note(target="deadend")` 近似标记死路，但那是**记录**不是**作废**。

**第 1 点是可搬的真缺口**：helm 的记忆有效性是**证据探针型**，
HiCoMER 要的是**共识变更型**。两者不冲突，但只做前者会漏掉
"早期结论被后来的证据推翻"这类失效。

## 结构二：分层 + 有效性 (HiCoMER)

HiCoMER 的三个组件，逐个可搬：

### 1. Hierarchical Memory Conflict Updater（冲突更新器）

记忆**分层**：
- **团队记忆** —— 集体决策、协议、当前共识
- **个体记忆** —— 成员观察、执行轨迹、中间进度

**冲突时要更新，不是两者都留着让检索去挑。**

### 2. Validity-Aware Memory Retriever（有效性感知检索）

关键改动：**先从"仍然有效"的记忆里检索，而不是从全部存储里检索。**

```
错误做法：  retrieve(query, ALL_MEMORIES) → rank by similarity
正确做法：  valid = filter(ALL_MEMORIES, still_valid)
           retrieve(query, valid) → rank by similarity
```

**过滤在排序之前。** 这一条最重要，也最容易实现。

### 3. Memory-Grounded Answer Generator

答案必须**落在有效记忆上** —— 与 helm 的证据纪律同构：
结论要有依据，依据要有效。

## 落地到 helm 的建议

**先看清哪些已经有了**（否则会去"修"一个不存在的问题）：

| 步骤 | 动作 | helm 状态 | 依据 |
|---|---|---|---|
| 1 | 记忆条目带有效性字段 | **已有** `status`/`last_verified`/`probe` | HiCoMER |
| 2 | 检索前先过滤失效项 | **已有** stale 从不注入 | HiCoMER 组件 2 |
| 3 | 冲突时取代而非并存 | **已有** `uq_tm_key` 唯一索引 | HiCoMER 组件 1 |
| 4 | **补逻辑失效判据**（非探针） | **缺** —— 现有 `verify()` 只重跑探针 | HiCoMER 冲突更新器 |
| 5 | 显式 discard 动作 | **缺** —— 只有 `upsert`/`search`/`verify` | AgeMem |
| 6 | 结论必须引用有效记忆条目 | 部分（有 `evidence_refs` 字段） | 组件 3 + 证据链 |

**收益最高的是第 4 步**，其次是第 5 步。

### 第 4 步怎么落地（具体）

现在的 `verify(id, probeOverride)` 只能回答"探针还通过吗"。要处理
"结论被推翻"，需要一个**由新证据触发的作废路径**：

```
场景：早期写入 target=HOST  verdict="无认证端点"  status=verified
      后来测试发现 /admin 需要 token
→ 这不是"探针失效"，是"结论被推翻"
→ 需要一条路径把该条目标成 stale 并记录推翻它的 evidence id
```

**实现上不是加新表**，而是让 `verify()` 之外多一个入口：按
`(scope, scope_key, target)` 找到条目，写 `status='stale'`，
把推翻者的 E-id 追加进 `evidence_refs`。这与既有的
"证据纪律"一致 —— 失效本身也要有证据。

## 反模式

| 反模式 | 为什么错 | helm 状态 |
|---|---|---|
| 只按相似度检索 | 捞出已作废的矛盾结论 | **已避免** —— stale 不注入 |
| 用时间戳当唯一有效性判据 | 逻辑作废与时间无关 | **已避免** —— 用探针重验不用时间 |
| 冲突记忆并存 | 检索时随机挑一个，结果不稳定 | **已避免** —— 唯一索引取代 |
| 记忆只增不删 | 噪声累积，检索质量下降 | **部分** —— 无 discard，但 stale 不再注入 |
| 只认探针失效，不认结论被推翻 | 早期错误结论会长期挂着 | **未避免 —— 这是真缺口** |
| 记忆管理外挂成启发式控制器 | 论文：限制适应性，无法端到端优化 | helm 是库调用，非 agent 自主动作 |

## 关键词

memory management · long-term memory · short-term memory · LTM STM · memory
retrieval · validity-aware · memory conflict · outdated memory · memory-augmented
agent · tool-memory · 记忆管理 · 长期记忆 · 记忆检索 · 失效记忆

## 来源

- `arXiv:2601.01885` — "Agentic Memory: Learning Unified Long-Term and Short-Term
  Memory Management for LLM Agents" (AgeMem). 记忆操作工具化 + 三阶段渐进 RL。
- `arXiv:2609.30289` — "Not All Memories Are Equal: Hierarchical Collaborative Memory
  for Validity-Aware Retrieval in LLM Agents" (HiCoMER). 分层 + 有效性过滤 + 两个新数据集。
