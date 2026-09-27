# Changelog

## [Unreleased]

### Added

- Added `src/runtime`: the frozen minimal contracts (`RecoveryAction`/`RefusalEvent`/`CvmSnapshot`/`GatewayDecision`/`ReceiptEvent`/`EvidenceEvent`), `ToolGateway` as the single tool-execution entry (scope → capability → budget → tripwire → sandbox → execute → receipt), `RecoveryOrchestrator` (helmd/helmx candidate recovery with a per-step 1+1 persisted budget that never refills across restarts), `ReviewGate` (no-evidence refusal + `confirmation_loop` detection), and the CVM Sensorium/snapshot/`<helm_cvm>` projection.
- Added five-position agent-loop wiring in the kernel adapter (pre-turn CVM restore, after-stream refusal events, before-tool Gateway decisions + bounded alternatives, after-tool Receipt/Evidence/CVM updates, finish Review Gate) with structured journal events for every denial, recovery, receipt, evidence and review outcome.
- Added the helmx fixed test cases HX-01…HX-06 as `scripts/hx-fixture.mjs` (`--case`, `--dry-run`, `--mock-sse --repeat N` with ledger replay) plus `fixtures/` and the `src/runtime/hx-cases.test.ts` regression suite.
- Added report/status readouts for receipts, evidence events, refusal recovery and review-gate rows; added the `claims.run_id` column so a finish gate only reviews its own run.
