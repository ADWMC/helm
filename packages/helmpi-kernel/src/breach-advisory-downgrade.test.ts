/**
 * Advisory downgrade + KPI accounting (helm-d advisory-ledger.md rule adopted in
 * §4.6 E): a non-mandatory advisory ignored three times stops being rendered, and
 * the tally survives a restart because it is read back from the ledger file.
 *
 * Distinct from breach.test.ts (adopted / ignored / no-proof paths); this file
 * pins the frequency-control and the measurable side of the loop.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AdvisoryLedger, DOWNGRADE_AFTER_IGNORES } from "./breach/advisory.ts";

/** Submit a proof-backed advisory that will never be satisfied, and settle it. */
function ignoreAdvisory(
	led: AdvisoryLedger,
	key: string,
	tier: "mandatory" | "recommended" | "hint",
	turn: number,
): void {
	led.submit(
		{
			key,
			tier,
			content: `content for ${key}`,
			proof: { kind: "tool_called", tools: ["never_called"] },
			withinTurns: 1,
		},
		turn,
	);
	led.reckon(turn + 1, { toolCalls: ["read"] });
}

test("downgrade: a recommended advisory stops rendering after three ignores", () => {
	const dir = mkdtempSync(join(tmpdir(), "helmpi-adv-down-"));
	try {
		const path = join(dir, "a.jsonl");
		const led = new AdvisoryLedger(path);
		for (let i = 0; i < DOWNGRADE_AFTER_IGNORES - 1; i += 1) ignoreAdvisory(led, "k-flaky", "recommended", i * 10);
		assert.equal(led.ignoredCount("k-flaky"), DOWNGRADE_AFTER_IGNORES - 1);
		led.submit({ key: "k-flaky", tier: "recommended", content: "still rendered" }, 100);
		assert.match(led.renderPending(), /still rendered/, "below the threshold it is still injected");

		ignoreAdvisory(led, "k-flaky", "recommended", 110);
		assert.equal(led.ignoredCount("k-flaky"), DOWNGRADE_AFTER_IGNORES);
		led.submit({ key: "k-flaky", tier: "recommended", content: "no longer rendered" }, 120);
		assert.equal(led.renderPending(), "", "at the threshold a non-mandatory advisory is suppressed");
		assert.deepEqual(led.downgradedKeys(), ["k-flaky"]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("downgrade: mandatory advisories are never suppressed", () => {
	const dir = mkdtempSync(join(tmpdir(), "helmpi-adv-mand-"));
	try {
		const led = new AdvisoryLedger(join(dir, "a.jsonl"));
		for (let i = 0; i < 5; i += 1) ignoreAdvisory(led, "k-must", "mandatory", i * 10);
		assert.equal(led.ignoredCount("k-must"), 5);
		led.submit({ key: "k-must", tier: "mandatory", content: "still mandatory" }, 200);
		assert.match(led.renderPending(), /\[mandatory\] still mandatory/);
		assert.deepEqual(led.downgradedKeys(), []);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("downgrade: the ignore tally survives a new ledger instance on the same file", () => {
	const dir = mkdtempSync(join(tmpdir(), "helmpi-adv-persist-"));
	try {
		const path = join(dir, "a.jsonl");
		const first = new AdvisoryLedger(path);
		for (let i = 0; i < DOWNGRADE_AFTER_IGNORES; i += 1) ignoreAdvisory(first, "k-x", "hint", i * 10);
		assert.equal(first.ignoredCount("k-x"), DOWNGRADE_AFTER_IGNORES);

		const reopened = new AdvisoryLedger(path);
		assert.equal(reopened.ignoredCount("k-x"), DOWNGRADE_AFTER_IGNORES, "seeded from the ledger file");
		reopened.submit({ key: "k-x", tier: "hint", content: "suppressed after restart" }, 300);
		assert.equal(reopened.renderPending(), "");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("kpi: adoption rate counts only machine-verified verdicts", () => {
	const dir = mkdtempSync(join(tmpdir(), "helmpi-adv-kpi-"));
	try {
		const led = new AdvisoryLedger(join(dir, "a.jsonl"));
		// adopted once
		led.submit({ key: "k-ok", tier: "hint", content: "c", proof: { kind: "tool_called", tools: ["route_task"] } }, 0);
		led.reckon(1, { toolCalls: ["route_task"] });
		// ignored twice
		ignoreAdvisory(led, "k-bad", "recommended", 10);
		ignoreAdvisory(led, "k-bad", "recommended", 20);

		const kpi = led.kpis();
		const ok = kpi.find((k) => k.key === "k-ok");
		const bad = kpi.find((k) => k.key === "k-bad");
		assert.equal(ok?.adopted, 1);
		assert.equal(ok?.adoptionRate, 1);
		assert.equal(bad?.ignored, 2);
		assert.equal(bad?.adoptionRate, 0);
		assert.equal(kpi[0]?.key, "k-ok", "sorted by adoption rate, best first");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
