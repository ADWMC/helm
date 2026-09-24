# 宿主兼容与共存（COMPAT）

## 支持矩阵

| 宿主 | 支持级别 | 说明 |
|------|----------|------|
| 官方 Pi（peer 锁定测试矩阵） | 一级 | 扩展入口、TUI 命令、激活词、工具收窄 |
| oh-my-pi | 一级 | 同 `pi.extensions` 清单；侧栏为可选适配 |
| DSH / Cordis | **不支持** | 旧 helm-d 形态，不迁移 preset 双源 |

## 与 SoL-Pi 同装

| 维度 | 规则 |
|------|------|
| 配置 | `helm-pi.json` vs `sol-pi.json` **互不读写** |
| 存储 | `helm-pi/` vs `sol-pi/` 会话目录；禁止交叉删除 |
| 事件 | 不替换宿主 built-in edit/write/bash 队列；不主动抢占 compact 边界 |
| 推荐 | 文档建议同装 Action Fusion + ObservationPack（效率）；Reducer 默认审 |

急停：`HELPI_RUN=0` · `HELPI_SUPERVISE=0`（与 SoL-Pi 开关无关）。

## 禁止

- monkey-patch 宿主内部  
- 运行时路径依赖 `reference/repos/**`  
- 把 historical 文档当 Agent 指令  
