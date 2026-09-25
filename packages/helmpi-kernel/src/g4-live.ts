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

import { readMergedSection } from "./config-store.ts";

export interface UsageLike {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	reasoning?: number;
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

/** Six-column session usage (W5-T07 预算六列): five cols + grand total. */
export function usageColumns(entries: unknown[]): {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	reasoning: number;
	grand_total_with_cache: number;
} {
	const out = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, grand_total_with_cache: 0 };
	for (const raw of entries) {
		const e = raw as { usage?: UsageLike } | null;
		const u = e?.usage ?? (e as { message?: { usage?: UsageLike } } | null)?.message?.usage;
		if (!u) continue;
		out.input += num(u.input);
		out.output += num(u.output);
		out.cacheRead += num(u.cacheRead);
		out.cacheWrite += num(u.cacheWrite);
		out.reasoning += num(u.reasoning);
		out.grand_total_with_cache +=
			num(u.input) + num(u.output) + num(u.cacheRead) + num(u.cacheWrite) + num(u.reasoning);
	}
	return out;
}

export interface G4ToolVerdict {
	block: boolean;
	terminate?: boolean;
	reason: string;
}

export function readDefenseConfig(cwd: string = process.cwd()): DefenseWatchConfig {
	// global tier (<agentDir>/config.json) under project overrides — see config-store.ts
	const d = readMergedSection(cwd, "defense") as Partial<DefenseWatchConfig>;
	return {
		watcher: d.watcher ?? DEFAULT_WATCH.watcher,
		watcherEveryTurns: d.watcherEveryTurns ?? DEFAULT_WATCH.watcherEveryTurns,
		...(d.stepToolCap !== undefined ? { stepToolCap: d.stepToolCap } : {}),
		...(d.sameToolLimit !== undefined ? { sameToolLimit: d.sameToolLimit } : {}),
	};
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
			// W5-T07 ③: budget six-col checkpoint every 5 turns (read-only source for status/report).
			if (turnIndex > 0 && turnIndex % 5 === 0) {
				const u = usageColumns(entries);
				deps.journal("token_checkpoint", { ...u, turnIndex });
			} // Watcher cadence (default OFF; structural review, full trace journaled)
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
					const ladderWhy = `same tool repeated ${streak}x (limit ${limit}) — no state change visible`; // W3-T04
					const ladderInstead =
						"bounded ladder: retry once bounded (vary args), change angle (different tool/source), then declare this vector not-exploitable and move on";
					deps.journal("instead", {
						tool: toolName,
						count: streak,
						limit,
						why: ladderWhy,
						instead: ladderInstead,
						source: "streak",
					});
					deps.pushReminder(`instead: ${ladderWhy} — ${ladderInstead} (W3-T04)`);
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
