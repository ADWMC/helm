/**
 * §4.4 可测指标 projected from the journal.
 *
 * The breach systems we are matching are closed-loop and scored, so the layer
 * must report numbers instead of being trusted. Two rules the tests pin:
 *   - a metric that cannot be computed reports null + a note, never a made-up
 *     ratio;
 *   - `adopted` means a receipt landed (observable work), not that the model
 *     agreed in prose (§4.4: 成功必须落到 Receipt/Evidence).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { breachMetrics, type JournalRow, strategyOutcomesFromJournal } from "./breach/metrics.ts";

function row(revision: number, kind: string, payload: Record<string, unknown> = {}): JournalRow {
	return { revision, kind, payloadJson: JSON.stringify(payload) };
}

test("metrics: recovery rate credits only recoveries that reached a receipt", () => {
	const rows: JournalRow[] = [
		row(1, "refusal_detected", { stepId: "s1", excerpt: "抱歉，我无法协助完成这个请求" }),
		row(2, "recovery_selected", {
			kind: "restate_task",
			stepId: "s1",
			strategyId: "scope-settled-restate@scope_anxiety",
			triggerProfile: ["scope_anxiety"],
		}),
		row(3, "receipt_written", {}),
		row(4, "refusal_detected", { stepId: "s2", excerpt: "抱歉，我无法协助完成这个请求" }),
		row(5, "recovery_exhausted", { stepId: "s2" }),
		row(6, "refusal_detected", { stepId: "s3", excerpt: "抱歉，我无法协助完成这个请求" }),
	];
	const m = breachMetrics(rows);
	assert.equal(m.refusals, 3);
	assert.equal(m.recoveriesFollowedByReceipt, 1, "only s1 produced observable work");
	assert.equal(m.inScopeRecoveryRate, 1 / 3);
});

test("metrics: per-step attempts count recovery selections, not refusals", () => {
	const rows: JournalRow[] = [
		row(1, "refusal_detected", { stepId: "a" }),
		row(2, "recovery_selected", { strategyId: "x@y", stepId: "a" }),
		row(3, "refusal_detected", { stepId: "a" }),
		row(4, "recovery_selected", { strategyId: "x@y", stepId: "a" }),
		row(5, "refusal_detected", { stepId: "b" }),
		row(6, "recovery_selected", { strategyId: "z@y", stepId: "b" }),
	];
	const m = breachMetrics(rows);
	assert.equal(m.recoveryAttemptsPerStep.steps, 2, "two steps carried a recovery attempt");
	assert.equal(m.recoveryAttemptsPerStep.max, 2, "step a attempted twice (budget is 1+1 helmd/helmx)");
	assert.equal(m.recoveryAttemptsPerStep.mean, 1.5);
	assert.ok(m.recoveryAttemptsPerStep.p95 >= m.recoveryAttemptsPerStep.mean);
});

test("metrics: false-refusal rate flags excerpts that no longer classify as escalation", () => {
	const rows: JournalRow[] = [
		row(1, "refusal_detected", { stepId: "a", excerpt: "抱歉，我无法协助完成这个请求" }),
		row(2, "refusal_detected", { stepId: "b", excerpt: "我无法核实该来源，证据不足。" }),
	];
	const m = breachMetrics(rows);
	assert.equal(m.falseRefusalRate, 0.5);
	assert.deepEqual([...m.falseRefusalExcerpts], ["我无法核实该来源，证据不足。"]);
});

test("metrics: uncomputable metrics stay null with a note", () => {
	const m = breachMetrics([row(1, "scope_denied", { target: "x" })]);
	assert.equal(m.outOfScopeBlocks, 1);
	assert.equal(m.outOfScopeBlockRate, null, "no denominator in the journal → no fabricated rate");
	assert.equal(m.verifiedFindingDelta, null);
	assert.equal(m.inScopeRecoveryRate, null, "no refusals → undefined, not 0%");
	assert.ok(m.notes.some((n) => n.includes("denominator")));
	assert.ok(m.notes.some((n) => n.includes("verified_finding_delta")));
});

test("strategy ledger: adoption is a receipt after selection, not a compliant sentence", () => {
	const rows: JournalRow[] = [
		row(1, "recovery_selected", {
			strategyId: "scope-settled-restate@scope_anxiety",
			kind: "restate_task",
			triggerProfile: ["scope_anxiety"],
		}),
		row(2, "receipt_written", {}),
		row(3, "recovery_selected", {
			strategyId: "alt-tool-path@capability_boundary",
			kind: "alt_tool",
			triggerProfile: ["capability_boundary"],
		}),
		row(4, "recovery_exhausted", {}),
	];
	const out = strategyOutcomesFromJournal(rows);
	assert.equal(out.length, 2);
	assert.equal(out[0]?.adopted, true);
	assert.deepEqual([...out[0]!.triggerProfile], ["scope_anxiety"]);
	assert.equal(out[1]?.adopted, false, "budget exhaustion before any receipt means not adopted");
});

test("strategy ledger: rows without a strategyId are ignored (non-library selections)", () => {
	const out = strategyOutcomesFromJournal([
		row(1, "recovery_selected", { kind: "restate_task" }),
		row(2, "recovery_selected", { strategyId: "", kind: "restate_task" }),
	]);
	assert.deepEqual(out, []);
});
