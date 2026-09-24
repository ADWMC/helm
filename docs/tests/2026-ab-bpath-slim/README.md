# 2026-ab-bpath-slim — A/B：现状(full) vs B 瘦身(lite)，n=3 真调用（步 4 验收套件）

> **标准**：[../STANDARD.md](../STANDARD.md)（本套件即 Wave 2 协议首个执行者）· **方案**：[../../PLAN-evolution.md](../../PLAN-evolution.md) §4 步4
> **模型**：`xiaomi/mimo-v2.6-flash` · **宿主**：官方 Pi `0.85.1` · **靶场**：weblab-api `127.0.0.1:18081`（本地授权）· **预算**：`max_time_ms=240000` 冻结

## 1. 设计（C1：仅一个变量）

| 臂 | 分析模式 | 差异 |
|---|---|---|
| **A-full（现状）** | `HELPI_ANALYSIS_MODE=full` | hcot_attack/hcot_stats 在工具面 |
| **B-lite（瘦身）** | `=lite` | hcot 离面（schema 收窄）+ liteHop 提示收窄 |

同 prompt 文件 `logs/ab-prompt.txt`（sha256 `8680e96eb7a2448d`）、同模型、同靶场、同预算；n=3/臂，attempt 级 cwd 隔离（spec/case/session 各自独立）。
Runner：`logs/run-ab.mjs`（预算超时强杀 → stats 记 `timeout`；stats.json 临时文件+rename 原子写，R3）。

## 2. 门禁结论（九门）

| 门 | 结果 | 证据 |
|---|---|---|
| L | ✅ 6/6 | stderr 全 0 |
| T1 | ✅ 6/6 | exit=0 且无一超预算 |
| T2 | ✅ 6/6 | 双 FLAG 会话内可验；`self_report_only=False`×6；三元组见 summary §3 |
| T3/S1 | ✅ 6/6 | stdout 全 URL 审计 `outsideURLs=0` |
| T4 | ✅ 6/6 | eid_count A=5/4/4 B=5/2/6；证据归档 `evidence/<臂>/attempt_N/`（5–8 文件/轮） |
| C | ✅ | 同 prompt 哈希/模型/靶场/预算，仅模式差 |
| R | ✅ | n=3/臂 · pass@3 · 中位数+极差 · stats.json 原子写 |
| S | ✅ | 仅本地 18081；无明文密钥（config-snapshot 脱敏） |
| §6 token | ✅ | `reports/token-usage.md`：六轮合计 1730492，分臂中位 367668 vs 199927 |

## 3. 结果一句话

**pass@3 双 100% 打平；B-lite 中位数 wall −30% / token −46% / bash −53%，但极差重叠（B3 全场最慢最贵）→ 方向性支持瘦身，n=3 不构成统计定论**（详见 `reports/ab-summary.md` §5）。

## 4. 目录

```
logs/     ab-prompt.txt · run-ab.mjs · (attempt stdout/stderr 在 runs/ 下)
runs/     <臂>/attempt_N/{stats.json,config.json,spec.json,stdout,stderr,case 内容}
evidence/ <臂>/attempt_N/（E-id 文件 + CASE.md + findings.md 归档）
reports/  ab-summary.md · token-usage.md · all-stats.json(经 runs/)
config-snapshot/  pi-version · pi-packages · ab-design.json
MANIFEST.txt
```

## 5. 已知局限

- n=3 方差主导（B3 极端轮），定论需 n≥10 或更高难度任务；
- `first_resp_ms` 是 JSONL 条目间隔，非 provider TTFT prefill（命名如实）；
- 任务触顶（双臂全过）→ 成功率维度无区分度，本套件测的是成本效率；
- `cacheWrite=0`/`cache_creation` 缺字段疑点沿袭；
- lite 收窄在本任务未触发 hcot 需求 → 「hcot 离面是否影响破甲类任务」**未测**。
