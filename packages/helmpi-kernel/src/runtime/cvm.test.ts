/**
 * CVM — CVM 恢复 category: sensorium determinism, snapshot save → restore →
 * projection participates in the next turn (REDESIGN §16.3, §16.7).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { Ledger } from "../ledger.ts";
import { parseCvmSnapshot } from "./contracts.ts";
import {
	buildCvmSnapshot,
	type CvmInput,
	computeSensorium,
	deriveStrategy,
	projectCognitive,
	restoreCvmSnapshot,
	saveCvmSnapshot,
} from "./cvm.ts";

function input(over: Partial<CvmInput> = {}): CvmInput {
	return {
		runId: "run-1",
		turn: 1,
		toolEvents: [],
		claims: 0,
		groundedEvidence: 0,
		receipts: 0,
		budgetRatio: null,
		advisoryKeys: [],
		evidenceIds: [],
		refusalActive: false,
		turnsSinceLastEvidence: null,
		...over,
	};
}

test("cvm: no receipts → verification coverage is vacuous, never high-confidence", () => {
	const s = computeSensorium(input({ claims: 2, groundedEvidence: 0 }));
	assert.equal(s.quality.coverage, "vacuous");
	assert.equal(s.verificationCoverage, 0);
});

test("cvm: coverage ratio comes from grounded evidence vs claims", () => {
	const s = computeSensorium(input({ claims: 4, groundedEvidence: 1, receipts: 3 }));
	assert.equal(s.verificationCoverage, 0.25);
	assert.equal(s.quality.coverage, "measured");
});

test("cvm: momentum/stability derive from counted tool events", () => {
	const s = computeSensorium(
		input({
			toolEvents: [
				{ tool: "bash", ok: true, at: 1 },
				{ tool: "bash", ok: true, at: 2 },
				{ tool: "read", ok: true, at: 3 },
				{ tool: "bash", ok: false, at: 4 },
			],
			receipts: 4,
		}),
	);
	assert.equal(s.momentum, 0.75);
	assert.equal(s.quality.stability, "measured", "≥3 observables → measured");
	assert.ok(s.stability < 1, "repeated bash runs lower stability");
});

test("cvm: strategy rules — recover / verify / pause / continue", () => {
	assert.equal(
		deriveStrategy(computeSensorium(input({ refusalActive: true })), input({ refusalActive: true })),
		"recover",
	);
	const vacuous = input({ claims: 1 });
	assert.equal(deriveStrategy(computeSensorium(vacuous), vacuous), "verify");
	const pressured = input({ budgetRatio: 0.95, receipts: 1, toolEvents: [{ tool: "a", ok: true, at: 1 }] });
	assert.equal(deriveStrategy(computeSensorium(pressured), pressured), "pause");
	const calm = input({
		receipts: 1,
		toolEvents: [
			{ tool: "a", ok: true, at: 1 },
			{ tool: "b", ok: true, at: 2 },
		],
	});
	assert.equal(deriveStrategy(computeSensorium(calm), calm), "continue");
});

test("cvm: snapshot saves to journal + meta and restores across a fresh handle (resume)", () => {
	const led = new Ledger(":memory:");
	try {
		const snap = buildCvmSnapshot(
			input({ turn: 7, claims: 2, groundedEvidence: 1, receipts: 5, advisoryKeys: ["verification-gap"] }),
			123,
		);
		saveCvmSnapshot(led, snap);
		const restored = restoreCvmSnapshot(led);
		assert.ok(restored, "snapshot must restore");
		assert.equal(restored.turn, 7);
		assert.deepEqual(parseCvmSnapshot(restored), restored);
		assert.equal(restoreCvmSnapshot(new Ledger(":memory:")), null, "fresh run has nothing to restore");
	} finally {
		led.close();
	}
});

test("cvm: projection carries observables with provenance into the next turn", () => {
	const snap = buildCvmSnapshot(input({ turn: 3, receipts: 2 }), 5);
	const projection = projectCognitive(snap);
	assert.match(projection, /\[cvm\] turn=3/);
	assert.match(projection, /coverage=/);
	assert.match(projection, /strategy=continue/);
});

test("cvm: latest snapshot wins on restore", () => {
	const led = new Ledger(":memory:");
	try {
		saveCvmSnapshot(led, buildCvmSnapshot(input({ turn: 1 }), 1));
		saveCvmSnapshot(led, buildCvmSnapshot(input({ turn: 2 }), 2));
		assert.equal(restoreCvmSnapshot(led)?.turn, 2);
	} finally {
		led.close();
	}
});
