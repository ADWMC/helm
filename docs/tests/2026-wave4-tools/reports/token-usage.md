# Token usage — 2026-wave4-tools（STANDARD §6）

来源：Pi 会话 JSONL `message.usage` · cwd=本套件（两轮共享目录 → 会话按文件归因）
公式：**`grand_total_with_cache = input + output + cacheRead + cacheWrite + reasoning`**（含 cacheRead；`cache_creation` provider 缺字段记 0；`totalTokens` 不计入）

| 会话 | msgs | **grand_total_with_cache** | 归属 |
|---|---:|---:|---|
| W4 会话 #1 | 19 | **427888** | attempt 1（bash 服务故障轮，含 14 次失败探针的重试开销） |
| W4 会话 #2 | 19 | **378459** | attempt 2（成功轮：api playbook 全链 + 双 FLAG + 6 E-id） |
| **合计** | 38 | **806347** | 两轮均标 W4（目录共享） |

- 分项五字段见 `token-usage-by-session.json`（脚本原样输出）。
- **归因局限（如实）**：两会话 msgs 同为 19，按文件名时间戳排序推定归属（#1 较早）；严格按 attempt 隔离需每轮独立 cwd（AB 套件做法），本套件为共享目录设计所致。
- 对照：单轮成功 e2e（bpath 套件）=138649 —— attempt2 的 378459 含 playbook/阶段工具多轮往返；attempt1 的 427888 是**故障重试烧掉的 token**（bash 反复超时），可作 §4「预算冻结」必要性的实证注脚。
