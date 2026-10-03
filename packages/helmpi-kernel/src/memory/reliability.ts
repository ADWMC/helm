/**
 * Tool reliability scoring — a continuous gate over the tool-memory verdicts.
 *
 * Ported from the AnyAct action-reliability mechanism (arXiv:2609.37025 §3.1.2):
 * a per-action score r in [r_min, 1] is multiplied into the retrieval utility, so a
 * tool that keeps failing is demoted while a tool that recovers climbs back. The
 * score is derived from two runtime statistics — a sliding-window success rate and
 * a trailing consecutive-failure count — because the paper's point is that stable
 * degradation (low success rate) and abrupt breakage (a failure streak) are
 * different signals and one number cannot express both.
 *
 * Why this exists here: tool-memory already records verdict/status/lastVerified,
 * but that is a state, not a trend. A tool that failed three times in a row this
 * session looks identical to one that failed once a month ago. This module turns
 * the recorded history into a rank signal.
 *
 * Differences from the paper, deliberate:
 *   - The paper gates a retrieval score inside its own retriever. We have no such
 *     retriever, so the score is exposed for whoever ranks candidates (the G1
 *     tool-memory recall serializer) and is advisory, never a block.
 *   - No embedding-based reranking: our tool surface is small, so lexical
 *     filtering is enough and an embedding dependency is not justified.
 *
 * Machine surface = frozen English (WG1.7); CJK only in comments.
 */

/** Tunables. Defaults follow the paper's shape, not its exact numbers (it does not publish them). */
export interface ReliabilityConfig {
	/** Floor for r: a demoted tool can still be selected, just last. */
	readonly floor: number;
	/** Success rate at or above which a tool keeps full reliability. */
	readonly successThreshold: number;
	/** Consecutive failures tolerated before the streak penalty starts. */
	readonly patience: number;
	/** Reliability subtracted per failure beyond patience. */
	readonly streakStep: number;
	/** Cap on the streak penalty. */
	readonly streakMax: number;
	/** Invocations needed before failures start to count (cold-start protection). */
	readonly minHistory: number;
}

export const DEFAULT_RELIABILITY: ReliabilityConfig = Object.freeze({
	floor: 0.2,
	successThreshold: 0.8,
	patience: 2,
	streakStep: 0.15,
	streakMax: 0.6,
	minHistory: 3,
});

/** Runtime statistics for one tool, derived from its recorded executions. */
export interface ExecutionStats {
	/** Successful invocations in the sliding window. */
	readonly successes: number;
	/** Failed invocations in the sliding window. */
	readonly failures: number;
	/** Trailing consecutive failures, counted from the most recent execution backwards. */
	readonly consecutiveFailures: number;
}

export type ReliabilityRegime = "exploration" | "stable" | "failure";

export interface ReliabilityVerdict {
	/** Multiplicative gate in [floor, 1]; multiply into whatever ranks candidates. */
	readonly reliability: number;
	/** Which regime the tool is in — the paper's three regimes, reported for observability. */
	readonly regime: ReliabilityRegime;
	/** Success rate over the window, or null when there is no history. */
	readonly successRate: number | null;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Base reliability from the sliding-window success rate: full above the threshold,
 * then linearly down to the floor as the rate approaches zero.
 */
export function baseReliability(successRate: number, config: ReliabilityConfig = DEFAULT_RELIABILITY): number {
	if (successRate >= config.successThreshold) return 1;
	const span = config.successThreshold;
	const deficit = (config.successThreshold - successRate) / span;
	return clamp(1 - (1 - config.floor) * deficit, config.floor, 1);
}

/**
 * Streak penalty: a circuit breaker for abrupt breakage. Zero while failures stay
 * within patience, then steps up and saturates at streakMax.
 */
export function streakPenalty(consecutiveFailures: number, config: ReliabilityConfig = DEFAULT_RELIABILITY): number {
	const excess = Math.max(0, consecutiveFailures - config.patience);
	return Math.min(config.streakMax, config.streakStep * excess);
}

/**
 * Score one tool from its execution statistics.
 *
 * Cold start returns 1: with too little history we have no evidence, and the paper's
 * point is that premature demotion is as costly as premature promotion.
 */
export function scoreReliability(
	stats: ExecutionStats,
	config: ReliabilityConfig = DEFAULT_RELIABILITY,
): ReliabilityVerdict {
	const total = stats.successes + stats.failures;
	if (total < config.minHistory) {
		return {
			reliability: 1,
			regime: "exploration",
			successRate: total === 0 ? null : stats.successes / total,
		};
	}

	const successRate = stats.successes / total;
	const reliability = clamp(
		baseReliability(successRate, config) - streakPenalty(stats.consecutiveFailures, config),
		config.floor,
		1,
	);

	const regime: ReliabilityRegime =
		stats.consecutiveFailures > config.patience || successRate < config.successThreshold ? "failure" : "stable";
	return { reliability, regime, successRate };
}

/**
 * Fold a recorded execution into the statistics.
 *
 * Kept windowed by maxWindow so a tool that was broken months ago is not permanently
 * penalised by history the operator has already fixed (the paper refreshes the
 * specification assessment while retaining execution history — same intent).
 */
export function recordExecution(stats: ExecutionStats, outcome: "success" | "failure", maxWindow = 20): ExecutionStats {
	const successes = stats.successes + (outcome === "success" ? 1 : 0);
	const failures = stats.failures + (outcome === "failure" ? 1 : 0);
	const total = successes + failures;
	const trim = Math.max(0, total - maxWindow);
	// Trim oldest from the window: approximate by removing from the majority side,
	// keeping the trailing-failure signal intact.
	let keptSuccesses = successes;
	let keptFailures = failures;
	if (trim > 0) {
		const fromFailures = Math.min(trim, Math.max(0, failures - stats.consecutiveFailures));
		keptFailures = failures - fromFailures;
		keptSuccesses = successes - (trim - fromFailures);
	}
	return {
		successes: Math.max(0, keptSuccesses),
		failures: Math.max(0, keptFailures),
		consecutiveFailures: outcome === "failure" ? stats.consecutiveFailures + 1 : 0,
	};
}

/** Empty statistics, for a tool with no recorded executions yet. */
export function emptyStats(): ExecutionStats {
	return { successes: 0, failures: 0, consecutiveFailures: 0 };
}
