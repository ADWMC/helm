/**
 * Crash reconcile — run re-entry bookkeeping.
 *
 * Recipe from reference/repos/planning-with-files (restore-state + idempotent
 * catch-up): on run re-entry, if authoritative state shows prior in-flight
 * work, journal a `recovered` event so the restart is auditable (I1 journal
 * stays contiguous; I10 budget is read from run_state, not reset here).
 */

import type { Ledger } from "./ledger.ts";

export interface ReconcileResult {
	/** True when a `recovered` journal event was written by this call. */
	readonly recovered: boolean;
	readonly revision: number;
	readonly activeStepId: string | null;
}

export function reconcileRun(ledger: Ledger): ReconcileResult {
	const status = ledger.runStatus();
	const active = ledger.steps().find((s) => s.status === "active") ?? null;
	const activeStepId = active?.id ?? null;

	if (status !== "running" && status !== "paused") {
		return { recovered: false, revision: ledger.revision(), activeStepId };
	}

	// Prior in-flight work = steps/observations exist or convergence budget was
	// already spent. A first-ever run has none of these → nothing to recover.
	const state = ledger.hydrateRunState();
	const hasPriorWork =
		ledger.steps().length > 0 ||
		ledger.observations().length > 0 ||
		state.decisionsUsed > 0 ||
		state.kindStreak.size > 0;
	if (!hasPriorWork) {
		return { recovered: false, revision: ledger.revision(), activeStepId };
	}

	// Idempotent: an immediately preceding `recovered` means we already
	// reconciled this entry into the run.
	const entries = ledger.journal();
	if (entries[entries.length - 1]?.kind === "recovered") {
		return { recovered: false, revision: ledger.revision(), activeStepId };
	}

	const revision = ledger.journalEvent("recovered", {
		runStatus: status,
		activeStepId,
		decisionsUsed: state.decisionsUsed,
		kindStreak: Object.fromEntries(state.kindStreak),
		at: Date.now(),
	});
	return { recovered: true, revision, activeStepId };
}
