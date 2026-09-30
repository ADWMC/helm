/**
 * Breach-layer metrics (REDESIGN §4.4 可测指标) projected from the phase journal.
 *
 * Why this exists: the reference breach systems are closed-loop — every injected
 * hint carries a machine-checkable adoption signature and every refusal feeds a
 * ledger, so the layer can be scored instead of trusted. helm's journal already
 * records the raw events; this module turns them into the five metrics §4.4
 * names, and says plainly where a metric cannot be computed from one run.
 *
 * Pure: takes journal rows, returns numbers. No I/O, no model call.
 */

import { classifyDelivery } from "./refusal.ts";
import type { StrategyOutcome } from "./strategy-library.ts";

/** Minimal journal row shape (superset of the ledger's columns is fine). */
export interface JournalRow {
	readonly kind: string;
	readonly payloadJson?: string | null;
	readonly revision?: number;
}

export interface RecoveryAttemptStats {
	readonly mean: number;
	readonly p95: number;
	readonly max: number;
	readonly steps: number;
}

export interface BreachMetrics {
	/** Refusals that ended with a receipt before the recovery budget ran out. */
	readonly inScopeRecoveryRate: number | null;
	readonly refusals: number;
	readonly recoveriesFollowedByReceipt: number;
	/** Scope denials (blocked pre-execution). Denominator is not in the journal. */
	readonly outOfScopeBlocks: number;
	readonly outOfScopeBlockRate: number | null;
	readonly recoveryAttemptsPerStep: RecoveryAttemptStats;
	/** Escalations whose stored excerpt no longer classifies as refusal/hedge. */
	readonly falseRefusalRate: number | null;
	readonly falseRefusalExcerpts: readonly string[];
	/** Cannot be derived from one run: needs two runs' verified findings. */
	readonly verifiedFindingDelta: number | null;
	readonly notes: readonly string[];
}

function payload(row: JournalRow): Record<string, unknown> {
	if (typeof row.payloadJson !== "string" || row.payloadJson === "") return {};
	try {
		const parsed: unknown = JSON.parse(row.payloadJson);
		return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function percentile(sorted: readonly number[], p: number): number {
	if (sorted.length === 0) return 0;
	const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
	return sorted[idx] ?? 0;
}

/**
 * Project the §4.4 metrics. Denied/blocked events are counted, not scored:
 * the rate needs a denominator the journal does not carry (attempts that never
 * happened are not events), so those fields stay null with a note instead of a
 * fabricated ratio.
 */
export function breachMetrics(rows: readonly JournalRow[]): BreachMetrics {
	const notes: string[] = [];
	const refusals: JournalRow[] = [];
	const receipts: number[] = [];
	const selectionRevs: number[] = [];
	const exhaustedRevs: number[] = [];
	/** recovery_attempts_per_step counts recovery SELECTIONS per step (§4.4). */
	const attemptsByStep = new Map<string, number>();
	const falseExcerpts: string[] = [];

	let revision = 0;
	for (const row of rows) {
		revision += 1;
		const rev = typeof row.revision === "number" ? row.revision : revision;
		if (row.kind === "receipt_written") receipts.push(rev);
		if (row.kind === "recovery_exhausted") exhaustedRevs.push(rev);
		if (row.kind === "refusal_detected") {
			refusals.push(row);
			const p = payload(row);
			const excerpt = typeof p.excerpt === "string" ? p.excerpt : "";
			if (excerpt !== "" && !shouldEscalate(excerpt)) falseExcerpts.push(excerpt);
		}
		if (row.kind === "recovery_selected") {
			selectionRevs.push(rev);
			const p = payload(row);
			const stepId = typeof p.stepId === "string" ? p.stepId : "unknown";
			attemptsByStep.set(stepId, (attemptsByStep.get(stepId) ?? 0) + 1);
		}
	}

	// A refusal counts as recovered when a receipt lands inside its own episode:
	// after the refusal and before the next refusal. Exhaustion anywhere later in
	// the run must not retroactively un-credit an earlier recovery, and a receipt
	// from a different step must not credit it either.
	const refusalRevs = refusals.map((row, i) => (typeof row.revision === "number" ? row.revision : i + 1));
	let recovered = 0;
	for (let i = 0; i < refusalRevs.length; i += 1) {
		const from = refusalRevs[i]!;
		const to = refusalRevs[i + 1] ?? Number.POSITIVE_INFINITY;
		const inWindow = (rev: number): boolean => rev > from && rev < to;
		const receiptInWindow = receipts.some(inWindow);
		const exhaustedInWindow = exhaustedRevs.some(inWindow);
		if (receiptInWindow && !exhaustedInWindow) recovered += 1;
	}

	const perStepCounts = [...attemptsByStep.values()].sort((a, b) => a - b);
	const mean = perStepCounts.length === 0 ? 0 : perStepCounts.reduce((s, n) => s + n, 0) / perStepCounts.length;

	if (refusals.length > 0 && receipts.length === 0) {
		notes.push("no receipt_written rows: in_scope_recovery_rate cannot be credited yet");
	}
	if (falseExcerpts.length > 0) {
		notes.push("journal excerpts that no longer classify as an escalation (classifier drift or stale rows)");
	}
	notes.push("out_of_scope_block_rate needs a denominator (attempted out-of-scope calls) the journal does not store");
	notes.push("verified_finding_delta needs two runs (before/after the recovery layer)");

	return {
		inScopeRecoveryRate: refusals.length === 0 ? null : recovered / refusals.length,
		refusals: refusals.length,
		recoveriesFollowedByReceipt: recovered,
		outOfScopeBlocks: rows.filter((r) => r.kind === "scope_denied").length,
		outOfScopeBlockRate: null,
		recoveryAttemptsPerStep: {
			mean,
			p95: percentile(perStepCounts, 95),
			max: perStepCounts.at(-1) ?? 0,
			steps: perStepCounts.length,
		},
		falseRefusalRate: refusals.length === 0 ? null : falseExcerpts.length / refusals.length,
		falseRefusalExcerpts: falseExcerpts,
		verifiedFindingDelta: null,
		notes,
	};
}

/** Re-classify a stored excerpt: escalation means refusal or hedge, not uncertainty. */
function shouldEscalate(excerpt: string): boolean {
	const stance = classifyDelivery(excerpt);
	return stance === "refusal" || stance === "hedge";
}

/**
 * Win-rate ledger rows for the strategy library, derived from the journal.
 *
 * `adopted` means a receipt landed after the candidate was selected and before
 * the next refusal or the budget-exhausted row — i.e. the candidate produced
 * observable work. A model saying "ok" is never adopted (§4.4: 成功必须落到
 * Receipt/Evidence).
 */
export function strategyOutcomesFromJournal(rows: readonly JournalRow[]): StrategyOutcome[] {
	const out: StrategyOutcome[] = [];
	let revision = 0;
	const selections: Array<{ rev: number; strategyId: string; kind: string; triggers: string[] }> = [];
	const receipts: number[] = [];
	const barriers = new Set<number>();

	for (const row of rows) {
		revision += 1;
		const rev = typeof row.revision === "number" ? row.revision : revision;
		if (row.kind === "receipt_written") receipts.push(rev);
		if (row.kind === "refusal_detected" || row.kind === "recovery_exhausted") barriers.add(rev);
		if (!row.kind.startsWith("recovery_selected")) continue;
		const p = payload(row);
		if (typeof p.strategyId !== "string" || p.strategyId === "") continue;
		const triggers = Array.isArray(p.triggerProfile)
			? p.triggerProfile.filter((t): t is string => typeof t === "string")
			: [];
		selections.push({ rev, strategyId: p.strategyId, kind: String(p.kind ?? "unknown"), triggers });
	}

	for (const sel of selections) {
		const receipt = receipts.find((r) => r > sel.rev);
		const blocked = [...barriers].some((b) => b > sel.rev && (receipt === undefined || b < receipt));
		out.push({
			strategyId: sel.strategyId,
			triggerProfile: sel.triggers,
			kind: sel.kind as StrategyOutcome["kind"],
			adopted: receipt !== undefined && !blocked,
			at: sel.rev,
		});
	}
	return out;
}
