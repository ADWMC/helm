# Token usage — 2026-bpath-e2e（STANDARD §6）

来源：Pi 会话 JSONL `message.usage` · 模型 `xiaomi/mimo-v2.6-flash`
公式：**`grand_total_with_cache = input + output + cacheRead + cacheWrite + reasoning`**（含 cacheRead，非计费额）
脚本：`../logs/extract-usage.mjs`（可复跑 · 按文件归因）

| 轮次（cwd=本套件） | msgs | input | output | cacheRead | cacheWrite | reasoning | **grand_total_with_cache** |
|---|---:|---:|---:|---:|---:|---:|---:|
| **e2e 打靶**（16-25-56） | 7 | 7512 | 3020 | 127872 | 0 | 245 | **138649** |
| **拒绝→纠偏实录**（后一轮） | 2 | — | — | — | 0 | — | **36854** |
| 本套件合计 | 9 | — | — | — | 0 | — | **≈175503** |

- 分项明细见 `token-usage-by-session.json`（脚本原样输出）。
- 归因排除：同 cutoff 内另有 35832 属 `2026-wave1-regression` 套件，不计入本套件。
- `cacheWrite=0` 疑点沿袭既有套件，标注不修口径。
- 对照参考：步 0 冒烟 ≈36344/轮、wave1 范围查询 35832/轮 —— e2e 打靶是重头（7 轮 + 大量 curl 回执进上下文，cacheRead 127872 占 92%）。
