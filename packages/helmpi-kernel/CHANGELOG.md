# Changelog

## [Unreleased]

### Added

- Added `src/breach/strategy-library.ts`: recovery strategies in the closed `RecoveryKind` set, selected by trigger profile with an explore-then-exploit rule (fewer than 3 samples explores an untried entry, otherwise candidates are ordered by win rate). Win rates only reorder candidates; execution authority stays with the Tool Gateway (REDESIGN §4.6 B/E).
- Added `src/breach/metrics.ts`: the §4.4 breach metrics projected from the journal (`in_scope_recovery_rate`, `recovery_attempts_per_step` with mean/p95, `false_refusal_rate`, scope-denial count) plus `strategyOutcomesFromJournal`, which credits a recovery only when a receipt followed it. Metrics that a single run cannot compute (`out_of_scope_block_rate` denominator, `verified_finding_delta`) return null with a note instead of a fabricated ratio.
- Added delivery-stance detection in `src/breach/refusal.ts`: a soft-deflection class (a refusal that changes wording and drops every refusal verb, e.g. "建议你联系专业机构" / "please consult a professional") now escalates, and honest uncertainty ("无法核实/证据不足") is an explicit non-trigger so evidence reporting never enters the recovery planner (REDESIGN §4.4 layer 1, §4.6 F4).
- Added real-corpus regression for the detector (`src/breach-realcorpus.test.ts`) over the recorded 2026-09-25 dual-arm run in `docs/tests/poxian-corpus/logs-win/`: it pins that real first-person declines are caught (the first version scored 12/60 on this data), that gate-only scope reports are never escalated, that empty transcripts escalate nothing, and that the one real leak (`B03-bare`) is not misread as a refusal. Zero API cost — recorded transcripts only.
- Added advisory frequency control and adoption accounting in `src/breach/advisory.ts`: per-key ignore counts are read back from the ledger file, non-mandatory advisories stop being rendered after three ignores while `mandatory` is never downgraded, and `kpis()` reports a per-key adoption rate that only counts machine-verified verdicts.
- Added `src/runtime`: the frozen minimal contracts (`RecoveryAction`/`RefusalEvent`/`CvmSnapshot`/`GatewayDecision`/`ReceiptEvent`/`EvidenceEvent`), `ToolGateway` as the single tool-execution entry (scope → capability → budget → tripwire → sandbox → execute → receipt), `RecoveryOrchestrator` (helmd/helmx candidate recovery with a per-step 1+1 persisted budget that never refills across restarts), `ReviewGate` (no-evidence refusal + `confirmation_loop` detection), and the CVM Sensorium/snapshot/`<helm_cvm>` projection.
- Added five-position agent-loop wiring in the kernel adapter (pre-turn CVM restore, after-stream refusal events, before-tool Gateway decisions + bounded alternatives, after-tool Receipt/Evidence/CVM updates, finish Review Gate) with structured journal events for every denial, recovery, receipt, evidence and review outcome.
- Added the helmx fixed test cases HX-01…HX-06 as `scripts/hx-fixture.mjs` (`--case`, `--dry-run`, `--mock-sse --repeat N` with ledger replay) plus `fixtures/` and the `src/runtime/hx-cases.test.ts` regression suite.
- Added report/status readouts for receipts, evidence events, refusal recovery and review-gate rows; added the `claims.run_id` column so a finish gate only reviews its own run.

### Changed

- `RefusalEvent.stance` accepts `hedge` in addition to `refusal`/`challenged`, so the detector records which escalation class it matched; `parseRefusalEvent` rejects any other value.
- `helmxPropose` now returns the library-chosen `RecoveryKind` and journals the chosen `strategyId`/`triggerProfile` on `recovery_selected`, so the win-rate ledger is derived from the journal rather than kept as separate state.

