# Playbook YAML Schema（阶段门数据）

> 方法论的**机器可读**部分。散文见 `docs/methodology.md`；域细节见 `references/`。  
> 版本化：`schema: 1`。旧版本迁移只向前。

## 文件位置

```text
references/playbooks/<id>.yaml
```

`id` 与文件名一致：`reverse` · `web-pentest` · `ctf` · `malware` · `blue-ir` · `ai-security` · `protocol` · `generic`

## 顶层结构

```yaml
schema: 1
id: reverse
title: 逆向分析
description: 样本逆向与漏洞研判阶段门
attack: [T1059, T1027]     # 可选：MITRE ATT&CK 技术 ID（T####/.### 精确格式，
                            #   宁缺勿猜；供 tools/attack-coverage.mjs 生成 navigator）
# 可选：Step kind 建议顺序（Run 用作车道提示，不是唯一路径）
lanes: [discover, enumerate, test, exploit, verify, recover]
budgets:            # 可选收敛提示，最终以 config/Ledger 为准
  maxSameKind: 5
phases:
  - id: scope
    ...
```

## Phase 对象

| 字段 | 类型 | 必填 | 含义 |
|------|------|------|------|
| `id` | string | ✓ | 阶段 id，playbook 内唯一 |
| `title` | string | ✓ | 显示名 |
| `gate_in` | string[] | | 进入谓词名（Domain 已实现才可用） |
| `deliverables` | Deliverable[] | ✓ | 出口必须满足的交付 |
| `gate_out` | string | ✓ | 出口策略，默认 `all_deliverables_have_evidence` |
| `next` | string[] | ✓ | 允许的下一阶段 id 列表 |
| `on_fail` | string | | `stay` \| `blocked`（默认 stay） |
| `refs` | string[] | | 相对 `references/` 的按需阅读路径 |
| `hint_menu` | string[] | | 会话层 3–6 项下一步菜单文案 |

### Deliverable

```yaml
- key: entropy_or_packer_note   # 唯一键
  description: 熵/壳结论一句
  evidence: required            # required | optional
  # 可选：绑定可机检检查名
  check: has_artifact_note
```

`gate_out: all_deliverables_have_evidence` 要求所有 `evidence: required` 的 key 至少一条 evidence_ref / Observation 链接到本阶段工作项。

## 完成关系（与 DESIGN 不变量 11–15 对齐）

- Phase gate **只**管阶段推进（L2）。  
- `Run.finish` 仍要求无 open Step + finish_basis（L3）。  
- 语义 goal 仍走 GoalVerifier（L4）。  
- **禁止**用「阶段全绿」单独代替 L3/L4。

## 校验

- 加载时未知字段 → 拒绝（防漂移）。  
- `next` 悬空 id → 拒绝。  
- 无 phases 的 playbook → 拒绝。  
- schema 版本不支持 → 拒绝并提示升级。
- `attack` 元素必须匹配 `T`+3–4 位数字（可带 `.###` 子技术），否则拒绝（宁缺勿猜；校验基准=本地 ATT&CK 映射库）。

## 示例（骨架）

```yaml
schema: 1
id: reverse
title: 逆向分析
phases:
  - id: scope
    title: 范围
    deliverables:
      - key: goal_and_sample
        description: 目标与样本已陈述
        evidence: required
    gate_out: all_deliverables_have_evidence
    next: [intake]
  - id: intake
    title: 入库
    deliverables:
      - key: artifact_hash
        description: SHA-256 等清单
        evidence: required
    gate_out: all_deliverables_have_evidence
    next: [triage]
    refs: [toolbox/decision-tree.md]
  - id: triage
    title: 分诊
    deliverables:
      - key: file_type_and_risk
        description: 类型与风险面
        evidence: required
      - key: primary_route
        description: PRIMARY 领域路由
        evidence: required
    gate_out: all_deliverables_have_evidence
    next: [initial_report, deep_reverse]
    hint_menu:
      - 继续静态逆向最高风险函数
      - 隔离环境做动态跟踪
      - 数据流/信任边界图
      - 漏洞根因审查
      - 输出简报
      - 停止并总结
```

## 与散文方法论的边界

| 放 YAML | 放 methodology.md / references 散文 |
|---------|-------------------------------------|
| 阶段 id、gate、deliverable key、next 图 | 工具选择长文、反理性化表、案例、话术 |
| 机器可拒的出口 | 教人思考的叙述 |
