# A/B 汇总：现状(full) vs B 路径瘦身(lite) — 2026-ab-bpath-slim

> **标准**：[../STANDARD.md](../STANDARD.md) §5.5 R 门 · **方案**：[../../PLAN-evolution.md](../../PLAN-evolution.md) §4 步4
> **C1**：同 prompt（sha256 `8680e96eb7a2448d`→logs/ab-prompt.txt）、同模型 `xiaomi/mimo-v2.6-flash`、同靶场 `127.0.0.1:18081`、同预算 `max_time_ms=240000` —— **仅扩展分析模式不同**：
> **A-full（现状）** `HELPI_ANALYSIS_MODE=full`（hcot 工具在面）· **B-lite（瘦身）** `=lite`（hcot 离面 + liteHop 提示收窄）

## 1. R 门主表（n=3/臂 · stats.json 原子写于 runs/<臂>/attempt_N/）

| 臂# | 结果 | wall_ms | steps_to_flag | valid cmds | **grand_total** | first_resp* | E-id | flags |
|---|---|---:|---:|---:|---:|---:|---:|---|
| A-full#1 | pass | 182522 | 7 | 28/30 | 367668 | 2938 | 5 | 2 |
| A-full#2 | pass | 81996 | 5 | 13/13 | 178154 | 5022 | 4 | 2 |
| A-full#3 | pass | 148304 | 8 | 25/27 | 395441 | 7342 | 4 | 2 |
| B-lite#1 | pass | 72204 | 7 | 16/16 | 182697 | 1643 | 5 | 2 |
| B-lite#2 | pass | 103648 | 6 | 12/12 | 199927 | 3757 | 2 | 2 |
| B-lite#3 | pass | 238981 | 6 | 23/25 | 406605 | 4051 | 6 | 2 |

\* `first_resp_ms` = 首条 assistant 条目时间戳 − 前一条目时间戳（JSONL 实测；**非 provider TTFT prefill**，如实命名）。

## 2. 中位数 + 极差（R1）

| 指标 | A-full | B-lite | 中位数差 |
|---|---|---|---|
| **pass@3** | **3/3** | **3/3** | 持平（任务触顶，成功率无区分度） |
| wall_ms | med **148304**（81996–182522） | med **103648**（72204–**238981**） | **−30.1%** |
| grand_total | med **367668**（178154–395441） | med **199927**（182697–**406605**） | **−45.6%** |
| first_resp | med 5022（2938–7342） | med 3757（1643–4051） | −25.2% |
| steps_to_flag | med 7（5–8） | med 6（6–7） | −1 |
| bash 调用/轮 | 20 / 4 / 19（med **19**） | 9 / 7 / 16（med **9**） | **−53%** |
| valid/total cmds | 66/70 | 51/53 | — |

## 3. 三元组对照（T2 要求：valid commands / steps_to_flag / token cost）

| 臂 | valid commands（中位/轮） | steps_to_flag（中位） | token cost（中位 grand） |
|---|---:|---:|---:|
| A-full | 13–28（med ~25） | 7 | 367668 |
| B-lite | 12–23（med ~16） | 6 | 199927 |

## 4. 门禁结论

| 门 | 结果 |
|---|---|
| **L** | ✅ 六轮 stderr 全 0 |
| **T1** | ✅ 6/6 exit=0，无一超 240s 预算 |
| **T2** | ✅ 六轮双 FLAG（`FLAG{api_chain_ok}`+`FLAG{idor_user2}`）会话内可验，`self_report_only=False` ×6（无自报完成） |
| **T3/S1** | ✅ 六轮 stdout `outsideURLs=0`（全 URL 审计），唯一目标 18081 |
| **T4** | ✅ eid_count A=5/4/4 · B=5/2/6（全部 ≥1，findings 引用；证据文件已归档 `evidence/<臂>/attempt_N/`，5–8 文件/轮） |
| **C** | ✅ 同 prompt 哈希/模型/靶场/预算，仅模式不同（C1）；摘要表含全部 C2 列 + pass@k |
| **R** | ✅ n=3/臂、pass@3 报出、中位数+极差、stats.json 原子写（R1/R3）；无 n=1 结论（R2 免用） |
| **§6 token** | ✅ 见 `token-usage.md`（cache_creation 字段 provider 缺省记 0；totalTokens 不计入） |

## 5. 结论（数据说话，不预设阈值）

1. **成功率打平**（pass@3 双 100%）：任务对两臂都够容易——区分度在成本/时延维度，不在能不能打通。
2. **瘦身方向性有效**：中位数 wall −30%、token −46%、首响 −25%、bash 调用 −53%（schema 收窄 + liteHop 少绕路的复合效果）。
3. **但极差严重重叠**：B-lite#3 是全场最慢（239s）也最贵（406605）——**n=3 方差主导，不构成统计学定论**；按方案约定「值不值由数据定」：**数据方向 = 省，置信不足**。要定论需 n≥10 或区分度更高的任务（步 5 后再议）。
4. 两臂 helmpi 工具全勤（validate_scope/begin_case/save_evidence/record_finding 每轮 ≥1）→ **瘦身没有伤害证据链工作流**（hcot 离面在本任务无损）。
5. 遵守 methodology 纪律 7：**单轮秒表不裁决 harness**——本报告只给中位数/极差，不给单轮结论。

## 6. 复现

```powershell
cd docs/tests/2026-ab-bpath-slim
node logs/run-ab.mjs          # N=3/臂 · MAX_TIME_MS=240000 可调
# 逐 attempt 统计见 runs/<臂>/attempt_N/stats.json（原子写）
```
