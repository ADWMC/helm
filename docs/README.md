# helm 文档地图

按角色进入；**规范单源**，历史调研只读。

## 当前产品定位

helm 是基于 Pi 二改的自主渗透与逆向 Agent。唯一活动设计基线是
[`REDESIGN.md`](REDESIGN.md)；其余方案文档只保留决策、调研和历史验收证据，不能直接转成开发任务。

| 文档 | 角色 | 何时读 |
|------|------|--------|
| [REDESIGN.md](REDESIGN.md) | **架构与原则单源**、领域模型、不变量、运行模型 | 做产品/架构决策 |
| [methodology.md](methodology.md) | **入口 E1–E12、方法论、阶段门、文档处理** | 写流程、定义入口、定「读什么/删什么」 |
| [INVARIANTS.md](INVARIANTS.md) | 不变量编号单源（与测试对齐） | 改状态机/完成链 |
| [COMPAT.md](COMPAT.md) | Pi/OMP/SoL-Pi 共存 | 扩展点与路径冲突 |
| [SOW-TEMPLATE.md](SOW-TEMPLATE.md) | 授权范围模板 | 开 Run 前填 Spec |
| [playbooks/SCHEMA.md](playbooks/SCHEMA.md) | Playbook YAML 规范 | 增改阶段门 |
| [old-project-painpoints.md](old-project-painpoints.md) | 旧 helm-d 痛点（历史） | 对照为何重做；**运行时不读** |
| [mature-projects-comparison.md](mature-projects-comparison.md) | 成熟项目对比（历史） | 机制选型依据；**运行时不读** |
| [competitor-equivalence.md](competitor-equivalence.md) | 竞品对标（历史） | 能力对齐核验；**运行时不读** |
| [PLAN-product.md](PLAN-product.md) | 完整产品规格（历史大文件，120 KB） | 查规格条目；**非活动基线** |
| [plan-helmd-methodology-integration.md](plan-helmd-methodology-integration.md) | helm-d 方法论集成方案 | 看 references 移植与阶段契约的推理留痕 |
| [solpi-compat-0.85.1-to-0.87.1.md](solpi-compat-0.85.1-to-0.87.1.md) | SoL-Pi 版本兼容记录 | 升 SoL-Pi 时对照 |
| [ab-mimo-vulncms.md](ab-mimo-vulncms.md) | Mimo/VulnCMS A/B 实验摘要 | 看实测数据 |
| [agent-capability-comparison.md](agent-capability-comparison.md) | Agent 能力横向对比 | 定位自身能力边界 |
| `../references/index.md` | Agent 领域知识总入口 | 会话按需 |
| `reference/repos/**` | 第三方克隆 | 仅人类调研；**不入发布、不进运行时** |

> **没有 `DESIGN.md`。** 本文档地图曾引用根目录 `DESIGN.md`，该文件从未存在于本仓库的
> git 历史中。`REDESIGN.md` 的「架构单源断裂」条目已判定：本文件（`REDESIGN.md`）是当前
> 架构基线，实现状态以代码和测试为准。请勿重新引入 `DESIGN.md` 链接。

**删除规则摘要**（详见 methodology §5）：

- 不在 `DESIGN.md` 维护 monorepo / `packages/*/src` 实现树；  
- 不把 `reference/repos` 或 historical 长文复制进运行时知识面；  
- persona / 激活语只保留单源。

**测试包**：[tests/2026-mimo-vulncms-ab/](tests/2026-mimo-vulncms-ab/README.md)

**测试标准**：[tests/STANDARD.md](tests/STANDARD.md) · **套件导航**：[tests/README.md](tests/README.md)

**Ponytail 方案吸收**：[ponytail-absorption.md](ponytail-absorption.md)

**流程×方法论对比**：[process-methodology-comparison.md](process-methodology-comparison.md)

**历史方案（只读）**：[PLAN-best-of-breed.md](PLAN-best-of-breed.md)

**历史演进方案（只读）**：[PLAN-evolution.md](PLAN-evolution.md)

**工具记忆**：[TOOL-MEMORY.md](TOOL-MEMORY.md)

**使用手册**：[USAGE.md](USAGE.md)
