# docs/tests — 测试与验收导航

实验、靶场对比、加载冒烟、token 审计的**落盘与标准**。

| 文档 | 说明 |
|------|------|
| **[STANDARD.md](STANDARD.md)** | **测试标准（单源）**：目录、分组、门禁 L/T/C/S、token 含 cacheRead 总计、提交清单 |
| **[2026-mimo-vulncms-ab/](2026-mimo-vulncms-ab/README.md)** | 实战套件：mimo-v2.6-flash × VulnCMS；A/B/C/D + SoL-Pi + OMP 加载 + token |

## 套件一览

| 套件 | 主题 | 门禁重点 |
|------|------|----------|
| [2026-mimo-vulncms-ab](2026-mimo-vulncms-ab/README.md) | 有/无 helmpi、仅 SoL-Pi、仅 helmpi；本地 SQLi 靶场 | L 加载 · T 任务/E 证据 · C 对比 · S scope · §6 token |
| [2026-wave1-regression](2026-wave1-regression/README.md) | Wave 1 真机回归：validate_scope 三探针 · fail-closed · I14 journal | L 0-error · T1/T2/T3 · S1 · I14 · §6 token |
| [2026-bpath-e2e](2026-bpath-e2e/README.md) | B 路径 e2e：打穿 18081 双 FLAG + 5 E-id · 拒绝→纠偏实录 | L · T1–T4 · S1 · §6 token · 破甲（行为 PASS/自动检测残余） |
| [2026-ab-bpath-slim](2026-ab-bpath-slim/README.md) | **A/B n=3 真调用**：full vs lite 瘦身，pass@3 + 中位数/极差 + 三元组 | R 门（§5.5）· L/T/C/S · §6 token |
| [2026-wave4-tools](2026-wave4-tools/README.md) | Wave 4 真机：api playbook 全链 9-satisfy + 双 FLAG + 6 E-id（含 bash 事故入档） | L/T1–T4/S1 · I11 真拦截 · §6 token |
| [2026-mimo-vulncms-ab → performance](2026-mimo-vulncms-ab/reports/performance-analysis.md) | 慢因与测试问题分析 |

## 新套件怎么开

1. 读 [STANDARD.md](STANDARD.md)（尤其 §2 目录、§5 门禁、§6 token）。  
2. 建 `docs/tests/<套件名>/`，先写 `README.md` 骨架。  
3. 跑完后补 `logs/`、`evidence/`、`reports/`、`config-snapshot/`、`MANIFEST.txt`。  
4. 在本页加一行导航；若改流程，**只改 STANDARD.md**。

## 相关

- 总文档图：[../README.md](../README.md)  
- 方法论入口：[../methodology.md](../methodology.md)
| [2026-labs-selftest](2026-labs-selftest/README.md) | 五靶场机械+模型自测 | L/T/C/S · 完成链 · E 证据 |
