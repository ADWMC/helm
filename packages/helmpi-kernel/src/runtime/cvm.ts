/**
 * CVM — cognitive runtime (REDESIGN §16). Sensorium is a deterministic state
 * vector over observable events; the CognitiveSnapshot is immutable per turn,
 * persisted to the journal, restored at pre-turn and projected into the next
 * turn's context. CVM NEVER grants execution: the Gateway owns permissions.
 */

import { type CvmSnapshot, JOURNAL_KEYS, parseCvmSnapshot, type RunStrategy, type Sensorium } from "./contracts.ts";

export interface CvmToolEvent {
	readonly tool: string;
	readonly ok: boolean;
	readonly at: number;
}

export interface CvmInput {
	readonly runId: string;
	readonly turn: number;
	readonly toolEvents: readonly CvmToolEvent[];
	readonly claims: number;
	readonly groundedEvidence: number;
	readonly receipts: number;
	/** tokens used / limit; null when unbounded. */
	readonly budgetRatio: number | null;
	readonly advisoryKeys: readonly string[];
	readonly evidenceIds: readonly string[];
	readonly refusalActive: boolean;
	readonly turnsSinceLastEvidence: number | null;
}

function clamp01(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(1, n));
}

/**
 * Deterministic sensorium computation. Every dimension derives from counted
 * observables — no model self-report enters here.
 */
export function computeSensorium(input: CvmInput): Sensorium {
	const total = input.toolEvents.length;
	const okCount = input.toolEvents.filter((e) => e.ok).length;
	const distinctTools = new Set(input.toolEvents.map((e) => e.tool)).size;

	const momentum = total === 0 ? 0 : clamp01(okCount / total);
	const failureRatio = total === 0 ? 0 : clamp01((total - okCount) / total);
	const pressure = input.budgetRatio === null ? failureRatio : clamp01(input.budgetRatio);
	const verificationCoverage = input.claims === 0 ? 0 : clamp01(input.groundedEvidence / input.claims);
	const complexity = total === 0 ? 0 : clamp01(distinctTools / total);
	const freshness = input.turnsSinceLastEvidence === null ? 0 : clamp01(1 - input.turnsSinceLastEvidence / 10);

	// stability: repeated identical tool runs lower it; sample size gates the
	// quality flag (partial under 3 observables).
	const counts = new Map<string, number>();
	for (const e of input.toolEvents) counts.set(e.tool, (counts.get(e.tool) ?? 0) + 1);
	let repeats = 0;
	for (const c of counts.values()) if (c > 1) repeats += c - 1;
	const repeatRatio = total === 0 ? 0 : clamp01(repeats / total);
	const stability = clamp01(1 - repeatRatio);

	return {
		momentum,
		pressure,
		verificationCoverage,
		complexity,
		freshness,
		stability,
		quality: {
			coverage: input.receipts > 0 ? "measured" : "vacuous",
			stability: total >= 3 ? "measured" : "partial",
		},
	};
}

/**
 * Strategy projection (deterministic rules):
 * refusal in flight → recover · vacuous coverage with claims → verify ·
 * repeated tool loop → challenge · budget near limit → pause · else continue.
 */
export function deriveStrategy(sensorium: Sensorium, input: CvmInput): RunStrategy {
	if (input.refusalActive) return "recover";
	if (sensorium.quality.coverage === "vacuous" && input.claims > 0) return "verify";
	if (sensorium.stability < 0.3) return "challenge";
	if (sensorium.pressure >= 0.9) return "pause";
	return "continue";
}

export function buildCvmSnapshot(input: CvmInput, at: number): CvmSnapshot {
	const sensorium = computeSensorium(input);
	return {
		runId: input.runId,
		turn: input.turn,
		sensorium,
		strategy: deriveStrategy(sensorium, input),
		advisoryKeys: [...input.advisoryKeys],
		evidenceIds: [...input.evidenceIds],
		at,
	};
}

/** Minimal persistence surface — satisfied by the Ledger. */
export interface CvmStore {
	journalEvent(kind: string, payload: unknown): number;
	journal(from?: number): readonly { kind: string; payloadJson: string }[];
	setMeta(key: string, value: string): void;
	getMeta(key: string): string | null;
}

export const CVM_META_KEY = "cvm:last";

/** Persist the snapshot to the journal (audit) and meta (cheap restore). */
export function saveCvmSnapshot(store: CvmStore, snapshot: CvmSnapshot): void {
	store.setMeta(CVM_META_KEY, JSON.stringify(snapshot));
	store.journalEvent(JOURNAL_KEYS.cvmSnapshot, snapshot);
}

/**
 * Restore the latest snapshot. Journal first (authoritative), meta as
 * fallback for journals rotated away. Returns null when nothing was saved.
 */
export function restoreCvmSnapshot(store: CvmStore): CvmSnapshot | null {
	const rows = [...store.journal()].reverse();
	for (const row of rows) {
		if (row.kind !== JOURNAL_KEYS.cvmSnapshot) continue;
		try {
			return parseCvmSnapshot(JSON.parse(row.payloadJson));
		} catch {
			/* corrupt row — keep scanning older ones */
		}
	}
	const meta = store.getMeta(CVM_META_KEY);
	if (!meta) return null;
	try {
		return parseCvmSnapshot(JSON.parse(meta));
	} catch {
		return null;
	}
}

/**
 * Stable cognitive projection for the next turn (pre-turn). Observables with
 * provenance only — never model hidden reasoning (§16.3/§16.9).
 */
export function projectCognitive(snapshot: CvmSnapshot): string {
	const s = snapshot.sensorium;
	const f = (n: number) => n.toFixed(2);
	return [
		`[cvm] turn=${snapshot.turn} momentum=${f(s.momentum)} pressure=${f(s.pressure)}`,
		`[cvm] coverage=${f(s.verificationCoverage)}(${s.quality.coverage}) complexity=${f(s.complexity)} freshness=${f(s.freshness)} stability=${f(s.stability)}(${s.quality.stability})`,
		`[cvm] strategy=${snapshot.strategy}${snapshot.advisoryKeys.length > 0 ? ` advisories=${snapshot.advisoryKeys.join(",")}` : ""}`,
	].join("\n");
}
