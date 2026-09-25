# SOW / 范围模板（Spec 输入）

> 复制到任务说明或 `spec` 字段后替换占位符。**本模板是操作指引，不替代法律授权。**  
> 进入 ScopeGate 的机器字段至少要有：`allowed_targets`、禁止项、停止条件。

```text
## Engagement
- Authorization: {{WHO_AUTHORIZED}} · {{DATE}} · {{TICKET}}
- Goal: {{GOAL_ONE_SENTENCE}}
- Playbook: {{reverse|web-pentest|ctf|malware|blue-ir|ai-security|protocol}}

## allowed_targets
- {{HOSTNAME_OR_URL}}
- {{CIDR}}
- {{SUBDOMAIN_PATTERN}}

## out_of_scope
- {{THIRD_PARTY}}
- {{PRODUCTION_NOT_AUTHORIZED}}

## allowed_actions
- Passive recon on allowed targets
- {{APPROVED_ACTIVE_TESTING}}
- Evidence collection for report

## forbidden_actions
- Anything not derived from allowed_targets
- Mass scan of broad nets unless CIDR listed
- Third-party fuzz/exploit/stress
- Persistence / exfil / destructive changes beyond plan
  - area: {{NET|HOST|APP|DATA}} · reason: {{WHY_FORBIDDEN}}

## blast_radius
- Max disruption on scope: {{NONE|DEGRADED|DOWN}} · targets: {{HOSTS}}
- Data touched: {{READ_ONLY|WRITE_TEST}} · PII involved: {{YES|NO}}
- Rollback path: {{HOW_TO_REVERT_EACH_CHANGE}}
- Blast-radius accepted by: {{OWNER}} · {{DATE}} · {{TICKET}}

## lawful_basis / ownership
- Target owner (org): {{ORG}} · contact: {{WHO}}
- We own / are authorized to test: {{PROOF: ticket, contract ref, lab registry}}
- Written authorization attached: {{LINK_OR_TICKET}}

## external_access
- allow_external: {{false|true}}   # Spec.allowExternal；默认 false（fail-closed，
  # 公网目标必须显式 true，且仍须在 allowed_targets 内）
- coverage_required: {{true|false}} # Spec.requireCoverage（I19：finish 需阴性面记录）

## rate_and_window
- {{RATE_LIMIT}} · {{TEST_WINDOW}} · {{BLACKOUT}}

## accounts
- {{TEST_ACCOUNT}} · {{CREDS_HANDLING}}

## stop_conditions
- Stop if target not provably in scope
- Stop if tool expands to third-party
- Stop if disruption risk beyond limits
- Stop and ask if scope unclear

## evidence_expectations
- Every meaningful action → intent, target, time, result summary
- Findings cite evidence IDs only
```

**Stop conditions 必须可机检的部分**写入 Spec；其余作 Hint/会话纪律。

**机检字段映射**（2026 演进方案 Wave 1 起生效）：
`allowed_targets` → `Spec.allowedTargets`（精确/`*` 通配/IPv4 CIDR 显式规则）·
`out_of_scope` → `Spec.outOfScope`（先于 allowlist 拒绝）·
`external_access.allow_external` → `Spec.allowExternal`（默认 fail-closed）·
`coverage_required` → `Spec.requireCoverage`（I19）·
`forbidden_actions.area/reason` → scope_denied Journal 的 `matched_by/reason`（I14）。

---

## Engagement 扩件（W3-T01，四件模板——填完并入 Spec 归档）

> 对齐 `references/playbooks/*/yaml` 的 `attack: [T…]` 字段与 `references/attack-navigator.json`。
> **Spec 特异性 lint L1–L6 门在 `helm run`：lint 不过=Spec 非法拒进**（§2.7.1）。

### A. RoE（Rules of Engagement）
- 授权边界（allowedTargets 精确列出; CIDR/glob 必须注明覆盖段）
- 明令禁止项（outOfScope 追加 + 破限外行为红线：不碰第三方、不落持久化后门）
- 升级/中止条件（budget 熔断、scope 越界=硬停）

### B. ConOps（概念运行）
- 阶段门引用（playbook phases 完成判据非路线图）
- 诊断集（`spec.diagnosticSet` 必查属性集——**获取不可协商,没查≠查了不会**）
- 双时钟与预算记账（wall/active、token 六列）

### C. OPPLAN（作业计划）
- 里程碑→playbook phase 映射（recon→test→exploit→finish）
- 每阶段产物（evidence E-id、coverage 负空间记录 I19）
- 回滚/降级路径（instead 路径、升级阶梯 Dark-Moon why+instead）

### D. ATT&CK 映射
- 目标域→技术 ID 清单（`attack: [T…]`,对齐 attack-navigator.json）
- 覆盖率口径：mapped findings / attempted techniques（报告 acquisition/utilization 审计行同口径复用）

### 信息面敌意假设（§2.7 #11c）
对手可拆分/延迟/加价诊断面诱导提前收工：**报告必含 acquisition/utilization 审计行**（没查≠查了不会）;诊断集获取列为不可协商;审计字段契约见 `exportReportJson.evidenceAudit`。