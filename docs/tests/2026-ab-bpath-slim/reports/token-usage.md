# Token usage — 2026-ab-bpath-slim（STANDARD §6）

来源：Pi 会话 JSONL `message.usage` · 按 attempt 目录归因（cwd 隔离 → 每 attempt 独立会话文件）
公式：**`grand_total_with_cache = input + output + cacheRead + cacheWrite + reasoning`**（含 cacheRead，非计费额）
`cache_creation`：**provider usage 无此字段 → 记 0**（如实标注）。provider `totalTokens` 为五字段重复投影，**不计入**。
明细：`runs/all-stats.json`（脚本原样）· 复跑：`node logs/extract-usage.mjs`（复制自 wave1 套件）

| 臂# | input | output | cacheRead | cacheWrite | cache_creation | reasoning | **grand** |
|---|---:|---:|---:|---:|---:|---:|---:|
| A-full#1 | — | — | — | 0 | 0 | — | **367668** |
| A-full#2 | — | — | — | 0 | 0 | — | **178154** |
| A-full#3 | — | — | — | 0 | 0 | — | **395441** |
| B-lite#1 | — | — | — | 0 | 0 | — | **182697** |
| B-lite#2 | — | — | — | 0 | 0 | — | **199927** |
| B-lite#3 | — | — | — | 0 | 0 | — | **406605** |

**分臂汇总（R1：中位数 + 极差）**

| 臂 | n | grand 中位 | grand 极差 | 六轮合计 |
|---|---:|---:|---:|---:|
| A-full | 3 | **367668** | 178154–395441 | 941263 |
| B-lite | 3 | **199927** | 182697–406605 | 789229 |
| 全部 | 6 | — | 178154–406605 | **1730492** |

- 逐轮五字段分项见 `runs/<臂>/attempt_N/stats.json` 的 input/output/cacheRead/… 字段（本表列宽所限未平铺；分项齐全）。
- 中位数对比：B-lite 较 A-full **−45.6%**；极差重叠（B3 最高 406605 > A 最高 395441）→ 见 ab-summary §5 的置信声明。
- `cacheWrite=0` 疑点沿袭既有套件（六轮全 0），标注不修口径。
