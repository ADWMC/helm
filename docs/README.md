# helm-pi 文档地图

按角色进入；**规范单源**，历史调研只读。

| 文档 | 角色 | 何时读 |
|------|------|--------|
| [../DESIGN.md](../DESIGN.md) | 架构与原则、领域模型、不变量、运行模型 | 做产品/架构决策 |
| [methodology.md](methodology.md) | **入口 E1–E12、方法论、阶段门、文档处理** | 写流程、定义入口、定「读什么/删什么」 |
| [INVARIANTS.md](INVARIANTS.md) | 不变量编号单源（与测试对齐） | 改状态机/完成链 |
| [COMPAT.md](COMPAT.md) | Pi/OMP/SoL-Pi 共存 | 扩展点与路径冲突 |
| [SOW-TEMPLATE.md](SOW-TEMPLATE.md) | 授权范围模板 | 开 Run 前填 Spec |
| [playbooks/SCHEMA.md](playbooks/SCHEMA.md) | Playbook YAML 规范 | 增改阶段门 |
| [old-project-painpoints.md](old-project-painpoints.md) | 旧 helm-d 痛点（历史） | 对照为何重做；**运行时不读** |
| [mature-projects-comparison.md](mature-projects-comparison.md) | 成熟项目对比（历史） | 机制选型依据；**运行时不读** |
| `../references/index.md` | Agent 领域知识总入口 | 会话按需 |
| `reference/repos/**` | 第三方克隆 | 仅人类调研；**不入发布、不进运行时** |

**删除规则摘要**（详见 methodology §5）：

- 不在 `DESIGN.md` 维护 monorepo / `packages/*/src` 实现树；  
- 不把 `reference/repos` 或 historical 长文复制进运行时知识面；  
- persona / 激活语只保留单源。

**测试包**：[tests/2026-mimo-vulncms-ab/](tests/2026-mimo-vulncms-ab/README.md)

**测试标准**：[tests/STANDARD.md](tests/STANDARD.md) · **套件导航**：[tests/README.md](tests/README.md)

**Ponytail 方案吸收**：[ponytail-absorption.md](ponytail-absorption.md)

**流程×方法论对比**：[process-methodology-comparison.md](process-methodology-comparison.md)

**最佳方案（选型+P0）**：[PLAN-best-of-breed.md](PLAN-best-of-breed.md)

**演进方案（子代理分发 ADR + 14 仓吸收波次，待批准）**：[PLAN-evolution.md](PLAN-evolution.md)

**工具记忆**：[TOOL-MEMORY.md](TOOL-MEMORY.md)

**使用手册**：[USAGE.md](USAGE.md)
