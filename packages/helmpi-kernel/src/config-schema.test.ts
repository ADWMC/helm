/**
 * W1-T05: config separation schema tests (WG1.5③: unknown keys rejected;
 * spec structural validation wired into the CLI).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { validateHelmConfig, validateHelmSpec } from "./config-schema.ts";

test("helm config: valid minimal and full configs pass", () => {
	assert.equal(validateHelmConfig({}).ok, true);
	assert.equal(validateHelmConfig({ version: 1, locale: "zh-CN" }).ok, true);
	assert.equal(
		validateHelmConfig({ efficiency: { actionFusion: false, observationPack: true, cacheWriteReadRatio: 12.5 } }).ok,
		true,
	);
	assert.equal(validateHelmConfig({ defense: { watcher: false, watcherEveryTurns: 5 } }).ok, true);
});

test("helm config: unknown top-level key rejected (strict)", () => {
	const r = validateHelmConfig({ goal: "nope" });
	assert.equal(r.ok, false);
	if (!r.ok) {
		assert.ok(r.failures.some((f) => f.path === "goal" && f.message === "unknown key"));
	}
});

test("helm config: unknown nested efficiency key rejected", () => {
	const r = validateHelmConfig({ efficiency: { actionFuson: true } });
	assert.equal(r.ok, false);
	if (!r.ok) assert.ok(r.failures.some((f) => f.path === "efficiency.actionFuson"));
});

test("helm config: unknown defense key rejected + type errors reported", () => {
	const bad = validateHelmConfig({ defense: { alwaysOnJudge: true } });
	assert.equal(bad.ok, false);
	const typed = validateHelmConfig({ efficiency: { actionFusion: "yes" } });
	assert.equal(typed.ok, false);
	if (!typed.ok) assert.ok(typed.failures.some((f) => f.path === "efficiency.actionFusion"));
});

test("helm spec: scaffold shape passes (spec init output is valid)", () => {
	const scaffold = { goal: "", allowedTargets: [] as string[], outOfScope: [] as string[], highRisk: "deny", maxTokens: 500_000 };
	assert.equal(validateHelmSpec(scaffold).ok, true);
});

test("helm spec: missing/typed-wrong fields and unknown keys rejected", () => {
	assert.equal(validateHelmSpec({}).ok, false); // no goal/allowedTargets/highRisk
	assert.equal(validateHelmSpec({ goal: "g", allowedTargets: ["x"], highRisk: "smash" }).ok, false); // enum
	assert.equal(validateHelmSpec({ goal: 42, allowedTargets: [], highRisk: "deny" }).ok, false); // type
	assert.equal(validateHelmSpec({ goal: "g", allowedTargets: [], highRisk: "deny", tokenBudget: 1 }).ok, false); // unknown key
	const r = validateHelmSpec({ goal: "g", allowedTargets: ["x"], highRisk: "deny" });
	assert.equal(r.ok, true);
});
