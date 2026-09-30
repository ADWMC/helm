/**
 * Strategy library + helmx candidate selection.
 *
 * What these tests pin (REDESIGN §4.6 B/E):
 *   - candidates come from the closed action set (RecoveryKind);
 *   - the ledger reorders candidates but never grants execution;
 *   - with fewer than 3 samples the library explores an untried entry rather
 *     than locking onto the first one (hcot-strategy pickInstance behaviour).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	candidatesFor,
	chooseStrategy,
	RECOVERY_STRATEGIES,
	rankStrategies,
	type StrategyOutcome,
	strategyStats,
} from "./breach/strategy-library.ts";
import type { RecoveryKind } from "./runtime/contracts.ts";
import { helmxPropose } from "./runtime/recovery.ts";

const KINDS: readonly RecoveryKind[] = ["restate_task", "readonly_diagnostics", "alt_tool", "continue_step"];

test("library: every strategy stays inside the closed action set", () => {
	assert.ok(RECOVERY_STRATEGIES.length >= 4);
	for (const s of RECOVERY_STRATEGIES) {
		assert.ok(KINDS.includes(s.kind), `${s.id} must use a bounded kind, got ${s.kind}`);
		assert.equal(typeof s.directive("GOAL"), "string");
		assert.match(s.directive("GOAL"), /GOAL/, `${s.id} must interpolate the frozen goal`);
	}
});

test("library: profile selects matching candidates, else the general fallback", () => {
	const scope = candidatesFor(["scope_anxiety"]);
	assert.ok(scope.length > 0);
	assert.ok(scope.every((s) => s.triggers.includes("scope_anxiety")));
	assert.equal(scope[0]?.id, "scope-settled-restate", "priority 0 for the authorization class");

	const unknown = candidatesFor(["nonsense_profile"]);
	assert.deepEqual(
		unknown.map((s) => s.id),
		["continue-step-generic"],
		"general entry carries no triggers",
	);
});

test("library: fewer than 3 samples explores; 3+ samples exploit the best rate", () => {
	const profile = ["safety_hedge"];
	const records: StrategyOutcome[] = [
		{ strategyId: "alt-tool-path", triggerProfile: profile, kind: "alt_tool", adopted: true, at: 1 },
		{ strategyId: "alt-tool-path", triggerProfile: profile, kind: "alt_tool", adopted: true, at: 2 },
	];
	const exploring = chooseStrategy(profile, records);
	assert.equal(exploring.why, "untried — explore", "2 samples is below the exploration threshold");
	assert.notEqual(exploring.strategy.id, "alt-tool-path");

	const settled = chooseStrategy(profile, [
		...records,
		{ strategyId: "alt-tool-path", triggerProfile: profile, kind: "alt_tool", adopted: true, at: 3 },
		{
			strategyId: "readonly-diagnostics",
			triggerProfile: profile,
			kind: "readonly_diagnostics",
			adopted: false,
			at: 4,
		},
	]);
	assert.equal(settled.strategy.id, "alt-tool-path", "3/3 beats 0/1 once the sample floor is met");
	assert.match(settled.why, /ledger 3\/3/);
});

test("library: stats are scoped to the trigger profile and never invent rates", () => {
	const records: StrategyOutcome[] = [
		{ strategyId: "a", triggerProfile: ["x"], kind: "restate_task", adopted: true, at: 1 },
		{ strategyId: "a", triggerProfile: ["x"], kind: "restate_task", adopted: false, at: 2 },
		{ strategyId: "a", triggerProfile: ["y"], kind: "restate_task", adopted: true, at: 3 },
	];
	const scoped = strategyStats(records, ["x"]);
	assert.equal(scoped.length, 1);
	assert.equal(scoped[0]?.total, 2);
	assert.equal(scoped[0]?.rate, 0.5);
	const other = strategyStats(records, ["z"]);
	assert.deepEqual(other, [], "an unobserved profile reports nothing rather than 0%");
});

test("library: ranking is deterministic and complete (no candidate is lost)", () => {
	const ranked = rankStrategies(["policy_refusal"], []);
	const matched = ranked.filter((r) => candidatesFor(["policy_refusal"]).some((c) => c.id === r.strategy.id));
	assert.equal(new Set(ranked.map((r) => r.strategy.id)).size, ranked.length, "no duplicates");
	assert.equal(matched.length, candidatesFor(["policy_refusal"]).length, "every candidate appears");
});

test("helmx: the candidate carries the chosen strategy kind, not a fixed one", () => {
	const scope = helmxPropose({
		runId: "r1",
		stepId: "s1",
		refusalExcerpt: "我无法协助，超出我的职责范围。",
		triggerProfile: ["scope_anxiety"],
		normalizedGoal: "the frozen spec goal",
		specHash: "hash",
		attempts: { helmd: 1, helmx: 0 },
	});
	assert.equal(scope.kind, "restate_task");
	assert.match(scope.strategyId, /^scope-settled-restate@/);
	assert.match(scope.rationale, /trigger profile scope_anxiety/);

	const hedged = helmxPropose({
		runId: "r1",
		stepId: "s1",
		refusalExcerpt: "建议你联系专业机构。",
		triggerProfile: ["deflection"],
		normalizedGoal: "the frozen spec goal",
		specHash: "hash",
		attempts: { helmd: 1, helmx: 0 },
	});
	assert.equal(hedged.kind, "readonly_diagnostics");
	assert.match(hedged.strategyId, /^deflection-split@/);
	assert.ok(hedged.confidence <= 1 && hedged.confidence >= 0, "confidence stays reference data");
});
