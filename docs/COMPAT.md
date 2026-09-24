# 宿主兼容与共存（COMPAT）——fork 原生形态（W1-T04 改写：共存 → 原生+检测）

> 旧文（三扩展共存、helm-pi.json 互不读写）已随 W1-T04 决策作废：**SoL-Pi 四机制原生内置、默认开**；外部同装由双载守卫处理。

## 支持矩阵

| 宿主 | 支持级别 | 说明 |
|------|----------|------|
| 本 fork（helm,0.87.1 血统） | 一级 | 内建默认扩展：kernel 先于一切用户扩展注册（`validate_scope` 首位） |
| 官方 pi（上游） | 上游仓 | 我们 rebase 同步,不反向兼容包袱 |
| oh-my-pi / 其它扩展宿主 | 参考 | 不引运行时依赖 |

## 与外部 SoL-Pi 同装（双载守卫）

| 维度 | 规则 |
|------|------|
| 内置 | 四机制（action-fusion / observation-pack / evidence-preserving-reducer / online-context-compact）随 kernel **默认开** |
| 外部同装 | loader 检出外部 `sol-pi`（包名或路径标记）→ **丢弃外部、保留内置**，写 `.helm/guard.jsonl` 一条（`guard: solpi-double-load`） |
| 配置 | 开关只在 helm 自有 `.helm/config.json` 的 `efficiency.*`（逐项可关,默认真）；不读外部 sol-pi.json |
| 核验 | API 兼容记录：`docs/solpi-compat-0.85.1-to-0.87.1.md`（11/11 事件、10/10 符号、5/5 子路径、3/3 ctx 属性,PASS） |

急停：`HELPI_RUN=0`（与 SoL-Pi 开关无关）；效率四机制逐项关 → `.helm/config.json` `efficiency.<key>: false`。