# 不变量（INVARIANTS）

> 单源。测试与 DESIGN §3 引用**本表编号**。修改须先改本文。

## Ledger / 状态

| ID | 不变量 |
|----|--------|
| I1 | `revision` 从 0 连续递增；每次权威变更 +1；每 revision 一条 Transition/Journal。 |
| I2 | 同时最多一个 `active` Step（或显式并行槽，槽位数写在 Spec）。 |
| I3 | 模型提案写入前必须 `parse → validate → commit`；校验失败则状态不变。 |

## 证据与完成

| ID | 不变量 |
|----|--------|
| I4 | `done` Step 必须 ≥1 条本 Step 的 Observation。 |
| I5 | `Observation.excerpt` 是 eligible receipt 的**连续子串**（仅允许 CRLF/LF 规范化）。 |
| I6 | Diagnostic / Attempt.summary **不能**作 basis 或 finish 依据。 |
| I7 | 截断/回退的证据 **不能**把 outcome 保持为 `done`（降级为 `progress`）。 |
| I8 | `Run.finish` 时无 open Step；`finish_basis` 全部来自 `done` 的 Observation。 |
| I9 | 结构 `completed` ≠ 语义 goal；语义需 GoalVerifier（L4）。 |
| I10 | 收敛预算耗尽 → `failed`/`blocked(convergence)`，**禁止**伪 `completed`。 |
| I11 | Playbook `gate_out` 不满足则不得进入 `next` 阶段。 |
| I12 | 关案须：L3/L4 记录，或 Journal 中显式 `no-evidence` 逃逸。 |
| I19 | `Run.finish` 若 Spec/playbook 声明 coverage 要求：finish 须携带 ≥1 条本 Run 的 coverage 记录（阴性面：查过且干净），或 Journal 中显式 `coverage-waived` 豁免；两者皆缺 → `finish` 拒绝。 |

## 范围与图

| ID | 不变量 |
|----|--------|
| I13 | Step.`target` 字节级 ∈ `Spec.allowed_targets`（或允许的子域规则，规则在 Spec 显式）。 |
| I14 | Scope 外工具调用在执行前 `deny`，并写 `scope_denied` Journal。 |
| I15 | Claim 只 INSERT 描述，不 UPDATE；纠错 = 新 Claim。 |
| I16 | `complete` 可 `reopen`：撤销完成边并允许再探索。 |
| I17 | Hint 表独立，不写入 Claim/Direction 事实边。 |
| I18 | 外部内容（回显/样本/网页/工具日志）不得作为指令执行（P9）。 |
