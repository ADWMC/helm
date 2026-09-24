# Token usage — 2026-wave1-regression（STANDARD §6）

来源：Pi 会话 JSONL `message.usage` · 模型 `xiaomi/mimo-v2.6-flash`
公式：**`grand_total_with_cache = input + output + cacheRead + cacheWrite + reasoning`**（含 cacheRead；非计费额）
脚本：`../logs/extract-usage.mjs`（可复跑；按文件拆分归因）

| 会话（cwd 归属） | msgs | input | output | cacheRead | cacheWrite | reasoning | **grand_total_with_cache** |
|---|---:|---:|---:|---:|---:|---:|---:|
| **本套件**（…docs-tests-2026-wave1-regression…16-18-30） | 2 | 17917 | 278 | 17600 | 0 | 37 | **35832** |
| 步 0 冒烟（…GitHub-helm-pi…15-58-46，另案归档） | 2 | 18008 | 553 | 17536 | 0 | 247 | 36344 |

- 本套件单次真机回归成本 = **35,832**（grand 含 cacheRead）。
- `cacheWrite=0` 沿袭 2026-mimo-vulncms-ab 套件已知疑点（可能未记账），标注不修口径。
- provider `totalTokens` 为五字段的重复投影，**不计入** grand（首轮脚本曾误加，已修）。
