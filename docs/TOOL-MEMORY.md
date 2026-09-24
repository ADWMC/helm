# 工具记忆系统（Tool Memory）设计

> **定位**：记住「**什么工具/手法在什么目标上有没有用**」，不是替代 OMP 的跨会话总结，也不是 Ledger 完成链。  
> **对齐**：P1–P10 · PLAN-best-of-breed · 纪律 3/4 · 与 SoL-Pi/OMP memory 正交

---

## 0. 三套记忆，别搅在一起

| 系统 | 记什么 | 权威性 | 谁写 |
|------|--------|--------|------|
| **OMP `memory.backend`** | 项目结论、教训、跨会话摘要 | 启发式注入，可 stale | OMP |
| **helm-pi Ledger/Observation** | 本 Run 的步骤与**完成证据** | **权威**（P1/P4） | Loop/Domain |
| **Tool Memory（本设计）** | 工具是否有效、死路、版本、安装方式 | **提示层**，**永不单独完成/当 Evidence** | 工具/人 |

**硬规则（P4）**：Tool Memory 条目 = **Diagnostic 级**；必须能追溯到某次 E-id/Obs 才升级为「有依据的结论」。

---

## 1. 数据模型（最小）

```text
ToolMemoryEntry {
  id            # tm-…
  scope         # global | workspace:<ws> | target:<host>
  kind          # tool | tactic | deadend | install
  name          # 工具名或手法名，如 detect_packer / sqli-auth
  target        # 可选：host/样本特征指纹
  verdict       # works | fails | unknown
  confidence    # high | medium | low
  note          # 一句话
  evidenceRefs  # E-ids 或 Obs ids（可空）
  source        # session | agent | human
  createdAt / updatedAt
  hits          # 命中计数（衰减或排序用）
}
```

存储：**`~/.helm-pi/tool-memory.jsonl`**（全局）+ 可选 workspace 覆盖。  
P0 用 JSONL（易审计、易 diff）；P1 可迁 SQLite 与 Ledger 同库分区。

---

## 2. 接口（扩展工具）

| 工具 | 作用 |
|------|------|
| `tool_memory` | `action: register \| note \| search \| deadend` |
| （已有）`save_evidence` / `record_finding` | 有证据时挂 E-id |
| （可选 P2）`find_tool` | 外部工具发现后写入 `kind=tool, verdict=unknown` |

### 2.1 register

```json
{ "action": "register", "name": "detect_packer", "verdict": "works",
  "note": "UPX samples OK", "evidence": ["E-002"], "scope": "workspace" }
```

### 2.2 note（追加观察，不改 verdict 也行）

```json
{ "action": "note", "name": "frida", "note": "anti-frida ×3 failed on target X",
  "evidence": ["E-005"] }
```

连续同手法失败 → 写 `kind=deadend`（对齐 helm-d tool_memory）。

### 2.3 search

```json
{ "action": "search", "q": "packer OR detect_packer", "target": "…" }
```

返回最近 N 条 + hits 排序；**明确标注**：`not evidence — diagnostic only`。

### 2.4 deadend

```json
{ "action": "deadend", "name": "sqlmap-tamper-x", "target": "…", "evidence": ["E-010"] }
```

---

## 3. 何时写入

| 时机 | 行为 |
|------|------|
| 模型显式调用 | register/note（persona/methodology 引导，**不自动编造**） |
| Loop step `failed` 且无新 Obs | 可选自动 `deadend`（supervise 同路） |
| 人工 CLI | `helmpi tm note …` |

**禁止**：每次工具调用自动刷记忆 → 噪声；必须显式或明确失败模式。

---

## 4. 何时读取（进上下文）

| 时机 | 方式 | 约束 |
|------|------|------|
| `before_agent_start` / propose 视图 | 最多 **3–6 条** 相关 search 结果 | 标 `diagnostic`，I6 |
| `route_task` 后 | 可选附 2 条该域 deadend | 不阻断 |
| lite 模式 | **默认不注入**（少跳转） | 纪律 7 |

**永不**把 tool-memory 当 `finish_basis` 或 finding 的唯一依据。

---

## 5. 与 helm-d `tool_memory` / 各家对照

| 来源 | 我们采用 | 不采用 |
|------|----------|--------|
| helm-d | deadend、与 E-id 关联、register/note 语义 | 塞进 CASE.md 散文无 schema |
| PentAGI memorist | 专职读写、限额 | 独立大 agent 编制（P0 不必） |
| OMP mnemopi | 项目隔离 scope | 把工具死路塞进 OMP 全局语义记忆 |
| PG | Diagnostic ≠ Evidence | 把工具经验当 observation |

---

## 6. 架构落点

```text
src/memory/
  tool-memory.ts    # 读写 JSONL、search、merge hits
src/index.ts        # 注册 tool_memory 工具
src/propose.ts      # （P1）proposeView 附带 3 条 diagnostic
src/status.ts       # 显示 tm 条数
```

配置：

```jsonc
"memory": {
  "toolMemory": { "enabled": true, "injectOnPropose": true, "maxInject": 5 }
}
```

---

## 7. P0 验收

1. `tool_memory` register/search/deadend 可用  
2. search 输出含 **not evidence** 标记  
3. 有 evidence 数组时校验非空格式（P0 可只记 id 字符串，不盘 E 目录）  
4. 单测：写入→检索→deadend 去重/更新 hits  
5. `npm run check` 绿  

## 8. 非目标（P0）

- 向量检索 / embedding  
- 替代 OMP memory  
- 自动每次 bash 都记  
- 进入 finish_basis  

---

## 9. 一句话

**工具记忆 = 带 scope 和 E-ref 的结构化 Diagnostic 库**：帮下次少走死路，**不能**替 Ledger 证明完成。
