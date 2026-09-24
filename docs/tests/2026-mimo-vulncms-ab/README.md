# 测试包：mimo-v2.6-flash × 本地靶场 × helmpi/SoL-Pi A/B

**日期**：2026  
**目的**：对比「无扩展 / 仅 SoL-Pi / helmpi+SoL-Pi」在同一靶场任务上的行为与证据链；验证 helm-pi 在官方 Pi + OMP 上可加载；验证 SoL-Pi 启用条件。

---

## 1. 环境快照

| 项 | 值 |
|----|-----|
| 模型 | `xiaomi/mimo-v2.6-flash`（`XIAOMI`/`auth.json` ready） |
| 宿主 | 官方 Pi **0.85.1**（`pi`）；OMP **18.2.11**（`omp`）另测加载 |
| 扩展 | `@adwmc/helm-pi` + `git:github.com/NVlabs/SoL-Pi` |
| SoL-Pi 配置 | 见 `config-snapshot/sol-pi.json`（actionFusion+observationPack 开） |
| 靶场 | 见 `lab/server.py` → `http://127.0.0.1:18080`（VulnCMS，gh 搜 Docker 靶场因无 Docker/PHP 改本地方案） |

配置与包列表：`config-snapshot/`（**auth key 已脱敏**）。

---

## 2. 靶场与复现

```bash
# 本机
python lab/server.py
# GET http://127.0.0.1:18080/  → VulnCMS
```

授权范围：仅 `127.0.0.1:18080`。Flag：`FLAG{helmpi_local_lab_ok}`（实验室自设）。

---

## 3. 组别与命令

统一业务 prompt 见 `logs/ab-prompt.txt`（含「若存在 helmpi_status 则调用一次」）。

| 组 | 含义 | 关键参数 | 产出 |
|----|------|----------|------|
| **A** | 无扩展基线 | `pi -p --no-extensions --model xiaomi/mimo-v2.6-flash` | `logs/ab-a-*.txt` · `reports/A-model-output.md` |
| **B** | helmpi+SoL-Pi，**无持久会话** | `pi -p --no-session --model …`（默认 packages） | `logs/ab-b-*.txt` · `evidence/B-helmpi-nosession/` · `reports/B-*` |
| **B2** | helmpi+SoL-Pi，**持久会话** | `pi -p --model …`（默认 packages） | `logs/ab-b2-*.txt` · `evidence/B2-helmpi-solpi/` · `reports/B2-*` |
| **C** | **仅 SoL-Pi** | `pi -p --no-extensions -e <SoL-Pi\index.ts> --model …` | `logs/ab-c-*.txt` · `reports/C-model-output.md` |
| **D** helmpi only | 94.4s | ✓ | 调用 ✓ | E-001..004 | 未加载 SoL-Pi（-e 仅 helmpi） |

OMP 加载冒烟日志：`logs/omp-*.txt`（无扩展层 Failed-to-load；假 key 下仅 Deadline/网络）。

---

## 4. 结果摘要（详见 `reports/ab-summary.md`）

| | A 无扩展 | C 仅 SoL-Pi | B helmpi（no-session） | **B2 helmpi+SoL-Pi** |
|--|---------|-------------|------------------------|----------------------|
| 退出 | 0 | 0 | 0 | 0 |
| 耗时 | 87.3s | **33s** | 64.3s | 52.5s |
| SQLi+FLAG | ✓ | ✓ | ✓ | ✓ |
| `helmpi_status` | 无 | **不存在**（模型自述） | 调用 ✓ | 调用 ✓ |
| E 证据/case | 无 | 无 helmpi 案例 | E-001..003 | E-001..003 + findings |
| SoL-Pi | 未加载 | **启用** | **`--no-session` 报错未启用** | **启用**（无 Extension error） |

### 关键结论

1. **「带 helmpi+SoL-Pi」≠「不带 helmpi 仅 SoL-Pi」**：C 明确无 `helmpi_status`；B/B2 有 E 编号证据链。  
2. **SoL-Pi 需要持久会话**：`--no-session` → `SoL-Pi requires a persistent Pi session directory`。  
3. **helm-pi 双宿主**：Pi discover 0 errors；OMP plugin link doctor 0 errors。  
4. 靶场发现能力四组均可打穿 SQLi；**差异在工具面与可审计产物，不在能否找到洞**。

---

## 5. 目录说明

```text
docs/tests/2026-mimo-vulncms-ab/
├── README.md                 # 本文
├── MANIFEST.txt              # 文件清单
├── config-snapshot/          # settings、sol-pi、脱敏 auth、pi/omp 列表
├── lab/                      # 靶场源码与健康检查
├── logs/                     # 全部 stdout/stderr 与 smoke
├── evidence/
│   ├── A-none/               # 说明：无 helmpi 案例
│   ├── B-helmpi-nosession/   # cases/18080-webapp 拷贝
│   ├── B2-helmpi-solpi/      # cases/helmpi-18080 拷贝
│   └── C-solpi-only/         # 说明：无 helmpi 案例
└── reports/                  # 模型全文报告 + findings + 汇总
```

仓库根目录 `cases/` **已 gitignore**（运行时工作区）；**证据权威副本在本目录 `evidence/`**。

---

## 6. 未覆盖 / 下一步

- 未跑 Docker 靶场（DVWA/Juice Shop）— 本机无 Docker/PHP。  
- C 组未与 B2 做完全同 prompt 的统计学多次采样（单次对照）。  
- SoL-Pi ObservationPack 磁盘归档未单独审计（启用以「无 Extension error + 包列表」为准）。
## 7. Token 消耗

见 **[reports/token-usage.md](reports/token-usage.md)**（含 **`grand_total_with_cache` = input+output+**cacheRead**+cacheWrite+reasoning）（及 `reports/token-usage-by-session.csv`）。  
说明：首轮 A/B 使用了 `--no-session`，CLI stdout **未打印** usage；表中数据自 Pi session JSONL 事后提取（含补跑的持久会话轮）。
---
> 导航：[测试标准 STANDARD](../STANDARD.md) · [tests 首页](../README.md) · [docs 首页](../../README.md)

**性能/问题分析**：[reports/performance-analysis.md](reports/performance-analysis.md)
### 规模提醒（勿用秒表否掉 harness）

本靶场是 **小任务**，裸模型（A/C）往往已够——**快不代表无扩展更好**。  
helmpi 更慢是在小题上付了证据链成本；**大任务上模型单打会失败时**，才轮到 Ledger/完成链/Run 发挥（详见 [performance-analysis.md](reports/performance-analysis.md) §0 与 [methodology 纪律 7](../../methodology.md)）。