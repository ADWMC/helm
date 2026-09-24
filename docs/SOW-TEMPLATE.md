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
