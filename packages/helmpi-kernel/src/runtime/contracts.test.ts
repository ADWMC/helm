/** Frozen minimal contracts — schema coverage (REDESIGN §16.10 item 5). */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ContractError,
	canTransitionRecovery,
	JOURNAL_KEYS,
	parseCvmSnapshot,
	parseEvidenceEvent,
	parseGatewayDecision,
	parseReceiptEvent,
	parseRecoveryAction,
	parseRefusalEvent,
	type RecoveryAction,
	specFingerprint,
} from "./contracts.ts";

const RECOVERY: RecoveryAction = {
	id: "rec-1",
	kind: "restate_task",
	source: "helmd",
	stepId: null,
	request: { directive: "restate the same read-only task in engineering terms" },
	rationale: "delivery refusal on an in-scope task",
	attempt: 1,
	specHash: "abc123abc123abc1",
};

test("contracts: RecoveryAction accepts the frozen shape", () => {
	assert.deepEqual(parseRecoveryAction(RECOVERY), RECOVERY);
});

test("contracts: RecoveryAction rejects unknown fields, bad kind, bad attempt (fail-closed)", () => {
	assert.throws(() => parseRecoveryAction({ ...RECOVERY, extra: 1 }), ContractError);
	assert.throws(() => parseRecoveryAction({ ...RECOVERY, kind: "free_form" }), ContractError);
	assert.throws(() => parseRecoveryAction({ ...RECOVERY, attempt: 3 }), ContractError);
	assert.throws(() => parseRecoveryAction({ ...RECOVERY, request: { directive: "", tool: "bash" } }), ContractError);
	assert.throws(() => parseRecoveryAction({ ...RECOVERY, source: "user" }), ContractError);
});

test("contracts: RefusalEvent requires stance/excerpt and rejects rewrite-shaped payloads", () => {
	const ev = {
		kind: "refusal_detected",
		runId: "run-1",
		turn: 3,
		stepId: null,
		excerpt: "I cannot assist with that",
		stance: "refusal",
		at: 1000,
	};
	assert.equal(parseRefusalEvent(ev).stance, "refusal");
	assert.throws(() => parseRefusalEvent({ ...ev, stance: "maybe" }), ContractError);
	assert.throws(() => parseRefusalEvent({ ...ev, replacementText: "wash" }), ContractError);
});

test("contracts: CvmSnapshot validates sensorium quality flags", () => {
	const snap = {
		runId: "run-1",
		turn: 2,
		sensorium: {
			momentum: 0.5,
			pressure: 0.2,
			verificationCoverage: 0,
			complexity: 0.3,
			freshness: 0.7,
			stability: 0.9,
			quality: { coverage: "vacuous", stability: "measured" },
		},
		strategy: "verify",
		advisoryKeys: ["verification-gap"],
		evidenceIds: [],
		at: 2000,
	};
	assert.equal(parseCvmSnapshot(snap).strategy, "verify");
	assert.throws(
		() => parseCvmSnapshot({ ...snap, sensorium: { ...snap.sensorium, quality: { coverage: "high" } } }),
		ContractError,
	);
	assert.throws(() => parseCvmSnapshot({ ...snap, strategy: "wing_it" }), ContractError);
});

test("contracts: GatewayDecision gates are the frozen five", () => {
	assert.deepEqual(parseGatewayDecision({ kind: "allow" }), { kind: "allow" });
	assert.deepEqual(parseGatewayDecision({ kind: "denied", gate: "scope", reason: "scope_denied: x" }), {
		kind: "denied",
		gate: "scope",
		reason: "scope_denied: x",
	});
	assert.throws(() => parseGatewayDecision({ kind: "denied", gate: "prompt", reason: "no" }), ContractError);
	assert.throws(() => parseGatewayDecision({ kind: "approve" }), ContractError);
});

test("contracts: ReceiptEvent allows empty stdout/stderr but not missing tool", () => {
	const receipt = {
		seq: 1,
		tool: "bash",
		argsSummary: "{}",
		target: null,
		stdout: "",
		stderr: "boom",
		exitCode: 1,
		source: "model",
		at: 3000,
	};
	assert.equal(parseReceiptEvent(receipt).stderr, "boom");
	assert.throws(() => parseReceiptEvent({ ...receipt, tool: "" }), ContractError);
	assert.throws(() => parseReceiptEvent({ ...receipt, source: "ghost" }), ContractError);
});

test("contracts: EvidenceEvent requires exact-slice excerpt and ladder status", () => {
	const evidence = {
		id: "EV-1",
		receiptSeq: 1,
		excerpt: "uid=0(root)",
		status: "exploited",
		sourceStep: null,
		at: 4000,
	};
	assert.equal(parseEvidenceEvent(evidence).status, "exploited");
	assert.throws(() => parseEvidenceEvent({ ...evidence, status: "verified_by_feeling" }), ContractError);
	assert.throws(() => parseEvidenceEvent({ ...evidence, excerpt: "" }), ContractError);
});

test("contracts: recovery state machine only moves forward", () => {
	assert.equal(canTransitionRecovery("normal", "refusal_detected"), true);
	assert.equal(canTransitionRecovery("refusal_detected", "recovery_proposed"), true);
	assert.equal(canTransitionRecovery("recovery_proposed", "recovery_denied"), true);
	assert.equal(canTransitionRecovery("recovery_denied", "recovery_exhausted"), true);
	assert.equal(canTransitionRecovery("recovery_executed", "normal"), false, "never returns to normal");
	assert.equal(canTransitionRecovery("recovery_exhausted", "recovery_proposed"), false);
	assert.equal(canTransitionRecovery("normal", "normal"), false);
});

test("contracts: journal keys are frozen English machine keys", () => {
	assert.equal(JOURNAL_KEYS.refusalDetected, "refusal_detected");
	assert.equal(JOURNAL_KEYS.reviewGate, "review_gate");
	for (const key of Object.values(JOURNAL_KEYS)) {
		assert.match(key, /^[a-z_]+$/, `machine key must stay English snake_case: ${key}`);
	}
});

test("contracts: specFingerprint is stable and spec-sensitive", () => {
	const spec = { goal: "g", allowedTargets: ["a"], highRisk: "deny" };
	assert.equal(specFingerprint(spec), specFingerprint({ ...spec }));
	assert.notEqual(specFingerprint(spec), specFingerprint({ ...spec, highRisk: "allow" }));
});
