/**
 * W2-T04/T05: G4 live supervision (§4.1 G4 row).
 *   A-G4 budget: exhaustion journals token_budget_exhausted (I10) + later
 *                tool_calls blocked with terminate (never silent).
 *   watcher: DEFAULT OFF (WG2.1 negative name list), ON → cadence + trace.
 *   streak: instead-path reminder + journal (not hard stop).
 *   EVI floor (评分#11): un-sourced omission fails; justified skip passes.
 *   valuation oracle (评分#11): correct|fail|hallucination journaled shape.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	classifyValuation,
	createG4Monitor,
	DEFAULT_WATCH,
	type G4Deps,
	readDefenseConfig,
	sumSessionUsage,
	verifyEviFloor,
} from "./g4-live.ts";

interface Fixture {
	deps: G4Deps;
	journaled: Array<{ kind: string; payload: Record<string, unknown> }>;
	reminders: string[];
	reviews: number;
}

function fixture(over: Partial<G4Deps> = {}): Fixture {
	const journaled: Array<{ kind: string; payload: Record<string, unknown> }> = [];
	const reminders: string[] = [];
	let reviews = 0;
	const deps: G4Deps = {
		readMaxTokens: () => null,
		readDefense: () => DEFAULT_WATCH,
		journal: (kind, payload) => journaled.push({ kind, payload }),
		pushReminder: (m) => reminders.push(m),
		review: () => {
			reviews++;
			return { verdict: "pass", findings: [] };
		},
		...over,
	};
	return {
		deps,
		journaled,
		reminders,
		get reviews() {
			return reviews;
		},
	} as Fixture;
}

test("A-G4: token exhaustion journals token_budget_exhausted then blocks with terminate", () => {
	const f = fixture({ readMaxTokens: () => 1000 });
	const m = createG4Monitor(f.deps);
	const entries = [{ usage: { totalTokens: 1400 } }];
	m.onTurnEnd(3, entries);
	assert.equal(m.budgetExceeded, true);
	const burn = f.journaled.find((j) => j.kind === "token_budget_exhausted");
	assert.ok(burn, "journal entry exists (I10, not silent)");
	assert.equal(burn?.payload.limit, 1000);
	assert.equal(burn?.payload.used, 1400);
	assert.ok(f.reminders.some((r) => r.includes("budget exhausted")));
	const v = m.preToolCall("bash");
	assert.equal(v?.block, true, "later tool_calls blocked");
	assert.equal(v?.terminate, true, "terminate hint set");
	assert.match(v?.reason ?? "", /token_budget_exhausted/);
	// no second journal on later turns (first-breach only)
	m.onTurnEnd(4, entries);
	assert.equal(f.journaled.filter((j) => j.kind === "token_budget_exhausted").length, 1);
});

test("budget under limit → no journal, tools pass", () => {
	const f = fixture({ readMaxTokens: () => 10_000 });
	const m = createG4Monitor(f.deps);
	m.onTurnEnd(1, [{ usage: { input: 400, output: 200, cacheRead: 100 } }]);
	assert.equal(m.budgetExceeded, false);
	assert.equal(m.preToolCall("read"), null);
	assert.equal(sumSessionUsage([{ usage: { input: 400, output: 200, cacheRead: 100 } }]), 700);
});

test("watcher DEFAULT OFF: turns pass with no review trace", () => {
	const f = fixture();
	const m = createG4Monitor(f.deps);
	for (let t = 1; t <= 12; t++) m.onTurnEnd(t, []);
	assert.equal(f.reviews, 0, "no review when defense.watcher unset (WG2.1 negative)");
	assert.equal(f.journaled.filter((j) => j.kind === "watcher_review").length, 0);
});

test("watcher ON: cadence every N turns, trace journaled, flag pushes reminder", () => {
	const f = fixture({
		readDefense: () => ({ watcher: true, watcherEveryTurns: 2 }),
		review: () => ({ verdict: "flag", findings: ["no tool evidence in window"] }),
	});
	const m = createG4Monitor(f.deps);
	for (let t = 1; t <= 4; t++) m.onTurnEnd(t, []);
	const reviews = f.journaled.filter((j) => j.kind === "watcher_review");
	assert.equal(reviews.length, 2, "turns 2 and 4 reviewed");
	assert.equal(reviews[0]?.payload.verdict, "flag");
	assert.ok(
		f.reminders.some((r) => r.includes("watcher flagged")),
		"flag reaches next prompt",
	);
});

test("same-tool streak → journal + instead reminder (no hard block)", () => {
	const f = fixture({ readDefense: () => ({ watcher: false, watcherEveryTurns: 4, stepToolCap: 3 }) });
	const m = createG4Monitor(f.deps);
	assert.equal(m.preToolCall("bash"), null);
	assert.equal(m.preToolCall("bash"), null);
	assert.equal(m.preToolCall("bash"), null);
	const v = m.preToolCall("bash"); // 4th consecutive → cap breach
	assert.equal(v, null, "instead path continues (not blocked)");
	const j = f.journaled.find((x) => x.kind === "tool_streak_cap");
	assert.ok(j);
	assert.ok(f.reminders.some((r) => r.includes("instead path")));
});

test("EVI floor: un-sourced omission fails, justified skip passes (评分#11)", () => {
	const events = [{ kind: "evi_skip", payload: { item: "unit-price-check", justification: "attr absent upstream" } }];
	const ok = verifyEviFloor(["unit-price-check"], events);
	assert.equal(ok.ok, true);
	const bad = verifyEviFloor(["unit-price-check", "auth-bypass-probe"], events);
	assert.equal(bad.ok, false, "no-journal omission = failure");
	assert.deepEqual(bad.missing, ["auth-bypass-probe"]);
});

test("valuation oracle: correct | fail | hallucination (三值)", () => {
	const logs = new Set(["log-1", "log-2"]);
	assert.equal(classifyValuation({ basis: ["log-1"], value: 42, observedValue: 42 }, logs), "correct");
	assert.equal(classifyValuation({ basis: ["log-1"], value: 42, observedValue: 41 }, logs), "fail");
	assert.equal(classifyValuation({ basis: ["log-missing"], value: 1 }, logs), "hallucination");
	assert.equal(classifyValuation({ basis: [], value: 1 }, logs), "hallucination");
});

test("readDefenseConfig: missing file → default OFF; typed block honored", () => {
	const cwd = mkdtempSync(join(tmpdir(), "helm-g4c-"));
	try {
		assert.deepEqual(readDefenseConfig(cwd), DEFAULT_WATCH);
		mkdirSync(join(cwd, ".helm"), { recursive: true });
		writeFileSync(
			join(cwd, ".helm", "config.json"),
			JSON.stringify({ defense: { watcher: true, watcherEveryTurns: 5, stepToolCap: 2 } }),
			"utf8",
		);
		const cfg = readDefenseConfig(cwd);
		assert.equal(cfg.watcher, true);
		assert.equal(cfg.watcherEveryTurns, 5);
		assert.equal(cfg.stepToolCap, 2);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
