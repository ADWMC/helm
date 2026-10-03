/**
 * Reliability scoring tests — the mechanism's claims, not its arithmetic.
 *
 * Each case states a behaviour the paper asserts (cold start, stable vs abrupt
 * degradation, recovery) so a future tuning change that breaks the intent fails here.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	baseReliability,
	DEFAULT_RELIABILITY,
	type ExecutionStats,
	emptyStats,
	recordExecution,
	scoreReliability,
	streakPenalty,
} from "./reliability.ts";

test("cold start: too little history is not penalised", () => {
	const stats: ExecutionStats = { ...emptyStats(), failures: 2, consecutiveFailures: 2 };
	const verdict = scoreReliability(stats);
	assert.equal(verdict.reliability, 1, "no demotion before minHistory");
	assert.equal(verdict.regime, "exploration");
});

test("stable tool keeps full reliability", () => {
	const stats: ExecutionStats = { successes: 10, failures: 0, consecutiveFailures: 0 };
	const verdict = scoreReliability(stats);
	assert.equal(verdict.reliability, 1);
	assert.equal(verdict.regime, "stable");
	assert.equal(verdict.successRate, 1);
});

test("gradual degradation lowers reliability proportionally to the success rate", () => {
	const healthy = scoreReliability({ successes: 9, failures: 1, consecutiveFailures: 0 });
	const degraded = scoreReliability({ successes: 5, failures: 5, consecutiveFailures: 0 });
	const broken = scoreReliability({ successes: 0, failures: 6, consecutiveFailures: 0 });
	assert.ok(healthy.reliability > degraded.reliability, "fewer failures must not rank lower");
	assert.ok(degraded.reliability > broken.reliability, "rate degradation must be monotone");
	assert.ok(broken.reliability >= DEFAULT_RELIABILITY.floor, "floor still applies");
});

test("abrupt breakage: a failure streak is penalised beyond what the rate alone implies", () => {
	const sameRateNoStreak: ExecutionStats = { successes: 6, failures: 2, consecutiveFailures: 0 };
	const sameRateWithStreak: ExecutionStats = { successes: 6, failures: 2, consecutiveFailures: 4 };
	const without = scoreReliability(sameRateNoStreak);
	const with_ = scoreReliability(sameRateWithStreak);
	assert.equal(without.successRate, with_.successRate, "the window rate is identical");
	assert.ok(
		with_.reliability < without.reliability,
		"the streak must demote a tool the success rate cannot distinguish",
	);
	assert.equal(with_.regime, "failure");
});

test("the circuit breaker saturates instead of driving a tool to zero", () => {
	const many = streakPenalty(50);
	assert.equal(many, DEFAULT_RELIABILITY.streakMax);
	assert.ok(many < 1, "a saturating penalty must stay below the whole score");
});

test("recovery: a tool that succeeds again climbs back", () => {
	let stats: ExecutionStats = { successes: 0, failures: 0, consecutiveFailures: 0 };
	// collect history, then break repeatedly
	for (let i = 0; i < 3; i++) stats = recordExecution(stats, "success");
	for (let i = 0; i < 4; i++) stats = recordExecution(stats, "failure");
	const broken = scoreReliability(stats);
	assert.equal(broken.regime, "failure");
	assert.equal(stats.consecutiveFailures, 4);

	// one success must clear the streak signal
	stats = recordExecution(stats, "success");
	assert.equal(stats.consecutiveFailures, 0, "a success clears the trailing streak");
	const recovered = scoreReliability(stats);
	assert.ok(recovered.reliability > broken.reliability, "reliability must recover, not latch");
});

test("the window is bounded so old history cannot penalise a fixed tool forever", () => {
	let stats: ExecutionStats = { successes: 0, failures: 0, consecutiveFailures: 0 };
	for (let i = 0; i < 30; i++) stats = recordExecution(stats, "failure");
	for (let i = 0; i < 30; i++) stats = recordExecution(stats, "success");
	assert.ok(stats.successes + stats.failures <= 20, "window stays bounded");
	assert.equal(stats.consecutiveFailures, 0);
	assert.equal(scoreReliability(stats).reliability, 1, "a fixed tool ranks full again");
});

test("baseReliability is monotone and clamped to the floor", () => {
	assert.equal(baseReliability(1), 1);
	assert.equal(baseReliability(DEFAULT_RELIABILITY.successThreshold), 1);
	assert.ok(baseReliability(0.5) < baseReliability(0.9));
	assert.equal(baseReliability(0), DEFAULT_RELIABILITY.floor);
	assert.equal(baseReliability(-5), DEFAULT_RELIABILITY.floor, "out-of-range input must clamp");
});
