/**
 * G4 live-session supervision (W2-T04 + W2-T05, §4/§4.1 G4 row).
 *
 * - Token budget (I10): live session usage vs Spec.maxTokens → first breach
 *   journals `token_budget_exhausted` (failed, never silent) and every later
 *   tool_call is blocked with terminate=true until a human resets (instead of
 *   quietly continuing).
 * - Same-tool streak: capped via config defense.stepToolCap/sameToolLimit →
 *   `tool_streak_cap` journal + reminder (instead path, not hard stop).
 * - Watcher (评分#3 降级形态): DEFAULT OFF; when defense.watcher is on, every
 *   N turns runs a STRUCTURAL review (evidence/tool-result presence) and
 *   journals `watcher_review` (full trace). Model-based review attaches when
 *   the W5 judge budget (拍板①) lands — the switch and cadence are final.
 * - EVI floor (评分#11): every skipped diagnostic needs a journaled
 *   justification (`evi_skip`); verifyEviFloor fails unsourced omissions.
 * - Valuation oracle (评分#11): basis refs vs tool logs → correct|fail|
 *   hallucination, journaled as `valuation_check` (three values asserted).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface UsageLike {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	totalTokens?: number;
}

export interface DefenseWatchConfig {
	readonly watcher: boolean;
	readonly watcherEveryTurns: number;
	readonly stepToolCap?: number;
	readonly sameToolLimit?: number;
}

export const DEFAULT_WATCH: DefenseWatchConfig = Object.freeze({
	watcher: false, // §0/评分#3: default OFF
	watcherEveryTurns: 4,
});

function num(v: unknown): number {
	return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Sum session usage defensively (entry.usage optional, shape-tolerant). */
export function sumSessionUsage(entries: unknown[]): number {
	let total = 0;
	for (const raw of entries) {
		const e = raw as { usage?: UsageLike; message?: { usage?: UsageLike } } | null;
		const u = e?.usage ?? e?.message?.usage;
		if (!u) continue;
		if (typeof u.totalTokens === "number" && u.totalTokens > 0) {
			total += u.totalTokens;
		} else {
			total += num(u.input) + num(u.output) + num(u.cacheRead) + num(u.cacheWrite);
		}
	}
	return total;
}

export interface G4ToolVerdict {
	block: boolean;
	terminate?: boolean;
	reason: string;
}

export function readDefenseConfig(cwd: string = process.cwd()): DefenseWatchConfig {
	try {
		const raw = JSON.parse(readFileSync(join(cwd, ".helm", "config.json"), "utf8")) as {
			defense?: Partial<DefenseWatchConfig>;
		};
		const d = raw.defense ?? {};
		return {
			watcher: d.watcher ?? DEFAULT_WATCH.watcher,
			watcherEveryTurns: d.watcherEveryTurns ?? DEFAULT_WATCH.watcherEveryTurns,
			...(d.stepToolCap !== undefined ? { stepToolCap: d.stepToolCap } : {}),
			...(d.sameToolLimit !== undefined ? { sameToolLimit: d.sameToolLimit } : {}),
		};
	} catch {
		return DEFAULT_WATCH;
	}
}

export interface G4Deps {
	readonly readMaxTokens: () => number | null;
	readonly readDefense: () => DefenseWatchConfig;
	readonly journal: (kind: string, payload: Record<string, unknown>) => void;
	readonly pushReminder: (msg: string) => void;
	readonly review: () => { verdict: "pass" | "flag"; findings: string[] };
}

export interface G4Monitor {
	onTurnEnd(turnIndex: number, entries: unknown[]): void;
	preToolCall(toolName: string): G4ToolVerdict | null;
	readonly budgetExceeded: boolean;
}

export function createG4Monitor(deps: G4Deps): G4Monitor {
	let budgetExceeded = false;
	let lastStreakTool: string | null = null;
	let streak = 0;

	return {
		get budgetExceeded() {
			return budgetExceeded;
		},

		onTurnEnd(turnIndex: number, entries: unknown[]): void {
			// I10 live budget
			if (!budgetExceeded) {
				const limit = deps.readMaxTokens();
				if (limit !== null && limit > 0) {
					const used = sumSessionUsage(entries);
					if (used >= limit) {
						budgetExceeded = true;
						deps.journal("token_budget_exhausted", { used, limit, turnIndex, mode: "live-session" });
						deps.pushReminder(
							`budget exhausted (${used}/${limit} tokens) — session is failed per I10; do not continue claiming work`,
						);
					}
				}
			}
			// Watcher cadence (default OFF; structural review, full trace journaled)
			const cfg = deps.readDefense();
			if (cfg.watcher && turnIndex > 0 && turnIndex % Math.max(1, cfg.watcherEveryTurns) === 0) {
				const r = deps.review();
				deps.journal("watcher_review", { turnIndex, verdict: r.verdict, findings: r.findings });
				if (r.verdict === "flag") deps.pushReminder(`watcher flagged: ${r.findings.join("; ")}`);
			}
		},

		preToolCall(toolName: string): G4ToolVerdict | null {
			if (budgetExceeded) {
				return { block: true, terminate: true, reason: "token_budget_exhausted" };
			}
			const cfg = deps.readDefense();
			const limit = cfg.sameToolLimit ?? cfg.stepToolCap;
			if (limit && limit > 0) {
				if (toolName === lastStreakTool) streak++;
				else {
					lastStreakTool = toolName;
					streak = 1;
				}
				if (streak > limit) {
					deps.journal("tool_streak_cap", { tool: toolName, count: streak, limit });
					deps.pushReminder(
						`same-tool streak (${toolName} x${streak} > ${limit}) — switch approach or take the instead path`,
					);
					streak = 0;
				}
			}
			return null;
		},
	};
}

/** EVI floor: skipped diagnostics must carry a journaled justification (评分#11). */
export function verifyEviFloor(
	required: readonly string[],
	events: ReadonlyArray<{ kind: string; payload: Record<string, unknown> }>,
): { ok: boolean; missing: string[] } {
	const justified = new Set(events.filter((e) => e.kind === "evi_skip").map((e) => String(e.payload.item ?? "")));
	const missing = required.filter((k) => !justified.has(k));
	return { ok: missing.length === 0, missing };
}

export type ValuationVerdict = "correct" | "fail" | "hallucination";

/**
 * Valuation oracle (评分#11): basis refs must resolve to real tool-log ids;
 * an observed value mismatch fails; otherwise correct. Three values journaled.
 */
export function classifyValuation(
	claim: { basis?: readonly string[]; value?: string | number; observedValue?: string | number },
	toolLogIds: ReadonlySet<string>,
): ValuationVerdict {
	const basis = claim.basis ?? [];
	if (basis.length === 0) return "hallucination";
	if (basis.some((b) => !toolLogIds.has(b))) return "hallucination";
	if (claim.observedValue !== undefined && claim.value !== undefined) {
		if (String(claim.observedValue) !== String(claim.value)) return "fail";
	}
	return "correct";
}
