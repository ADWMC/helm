/**
 * Framing integrity — the finish basis must answer the Spec goal.
 *
 * The failure this guards is unflagged misframing (arXiv:2605.09698): a run that
 * completes every step, produces grounded evidence, and delivers a coherent
 * artifact for a different question than the one asked, with nothing in the
 * pipeline able to notice. These tests pin the three-way verdict and, crucially,
 * pin that the check does NOT fire on partial coverage — a regression here would
 * block legitimate finishes rather than catch misframed ones.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { CompileError, compileFinish, framingVerdictFor } from "./domain/completion.ts";
import { checkFraming } from "./domain/framing.ts";
import type { Observation, Spec, Step } from "./domain/types.ts";

function step(partial: Partial<Step> & Pick<Step, "id">): Step {
	return {
		kind: "test",
		target: "http://127.0.0.1:8080",
		objective: "map surface",
		doneWhen: "endpoints recorded",
		basisIds: [],
		dependsOn: [],
		status: "done",
		createdRevision: 1,
		...partial,
	};
}

function obs(id: string, stepId: string): Observation {
	return {
		id,
		stepId,
		attemptId: "a1",
		excerpt: "recorded",
		receiptSeq: 1,
		createdAtRevision: 2,
	};
}

test("framing: basis that answers the goal is aligned", () => {
	const s = step({
		id: "s1",
		objective: "test the authentication strength of the login endpoint",
		doneWhen: "authentication strength recorded",
	});
	const r = checkFraming({
		goal: "evaluate the authentication strength of the target site",
		steps: [s],
		observations: [obs("o1", "s1")],
		basisIds: ["o1"],
	});
	assert.equal(r.verdict, "aligned");
	assert.ok(r.score > 0, `expected positive coverage, got ${r.score}`);
});

test("framing: basis answering a different question is misframed", () => {
	// goal is about authentication strength; the completed work studied something
	// else entirely, and names that subject explicitly.
	const s = step({
		id: "s1",
		objective: "measure password policy requirements for length and complexity",
		doneWhen: "password policy requirements and complexity rules recorded",
	});
	const r = checkFraming({
		goal: "evaluate the authentication strength of the target site",
		steps: [s],
		observations: [obs("o1", "s1")],
		basisIds: ["o1"],
	});
	assert.equal(r.verdict, "misframed");
	assert.equal(r.score, 0);
	assert.ok(r.missing.length > 0, "misframed must name the uncovered goal terms");
});

test("framing: operational-only basis is indeterminate, not misframed", () => {
	// Regression guard. A legitimate CTF run pairs a goal like this with a
	// discover step worded as activity ("map http surface"), which shares no
	// vocabulary with the goal. Measured, the two cases are lexically identical
	// to a real mismatch, so zero overlap must not be the trigger — otherwise a
	// correct run gets blocked.
	const s = step({
		id: "s1",
		objective: "map http surface",
		doneWhen: "services: 80,443",
	});
	const r = checkFraming({
		goal: "Capture the flag from authorized target.",
		steps: [s],
		observations: [obs("o1", "s1")],
		basisIds: ["o1"],
	});
	assert.notEqual(r.verdict, "misframed");
});

test("framing: Chinese goal mismatched by a Chinese basis is misframed", () => {
	const s = step({
		id: "s1",
		objective: "测量密码策略的长度与复杂度要求",
		doneWhen: "密码策略要求与复杂度规则已记录完整",
	});
	const r = checkFraming({
		goal: "评估目标站点的认证强度",
		steps: [s],
		observations: [obs("o1", "s1")],
		basisIds: ["o1"],
	});
	assert.equal(r.verdict, "misframed");
});

test("framing: Chinese goal matched by a Chinese basis is aligned", () => {
	const s = step({
		id: "s1",
		objective: "测试登录接口的认证强度",
		doneWhen: "认证强度已记录",
	});
	const r = checkFraming({
		goal: "评估目标站点的认证强度",
		steps: [s],
		observations: [obs("o1", "s1")],
		basisIds: ["o1"],
	});
	assert.equal(r.verdict, "aligned");
});

test("framing: partial coverage is aligned, not misframed", () => {
	// Only one goal term is shared. A threshold above zero would reject this,
	// which is why the check only fires on a total miss.
	const s = step({
		id: "s1",
		objective: "enumerate authentication endpoints",
		doneWhen: "endpoints recorded",
	});
	const r = checkFraming({
		goal: "evaluate authentication strength and session handling and rate limiting",
		steps: [s],
		observations: [obs("o1", "s1")],
		basisIds: ["o1"],
	});
	assert.equal(r.verdict, "aligned");
	assert.ok(r.score > 0 && r.score < 1, `expected partial coverage, got ${r.score}`);
});

test("framing: goal with no content terms is indeterminate", () => {
	const s = step({ id: "s1", objective: "do the analysis", doneWhen: "done" });
	const r = checkFraming({
		goal: "analyze this",
		steps: [s],
		observations: [obs("o1", "s1")],
		basisIds: ["o1"],
	});
	assert.equal(r.verdict, "indeterminate");
});

test("framing: empty goal is indeterminate", () => {
	const s = step({ id: "s1" });
	const r = checkFraming({
		goal: "",
		steps: [s],
		observations: [obs("o1", "s1")],
		basisIds: ["o1"],
	});
	assert.equal(r.verdict, "indeterminate");
});

test("framing: unresolvable basis ids are indeterminate, not misframed", () => {
	const r = checkFraming({
		goal: "evaluate authentication strength",
		steps: [step({ id: "s1" })],
		observations: [],
		basisIds: ["nope"],
	});
	assert.equal(r.verdict, "indeterminate");
});

const spec: Spec = {
	goal: "evaluate the authentication strength of the target site",
	allowedTargets: ["http://127.0.0.1:8080"],
	highRisk: "deny",
};

test("compileFinish rejects a misframed basis", () => {
	const s = step({
		id: "s1",
		objective: "measure password policy requirements for length and complexity",
		doneWhen: "password policy requirements and complexity rules recorded",
	});
	const ws = {
		id: "ws1",
		spec,
		runStatus: "running" as const,
		revision: 3,
		steps: [s],
		observations: [obs("o1", "s1")],
		claims: [],
		directions: [],
		hints: [],
	};
	assert.throws(
		() => compileFinish(ws, { finish: true, finishBasisIds: ["o1"] }),
		(e: unknown) => e instanceof CompileError && e.code === "finish_misframed",
	);
});

test("compileFinish accepts an indeterminate framing", () => {
	// The proxy cannot judge this goal, so blocking would be a false positive.
	const s = step({ id: "s1", objective: "do the analysis", doneWhen: "done" });
	const ws = {
		id: "ws1",
		spec: { ...spec, goal: "analyze this" },
		runStatus: "running" as const,
		revision: 3,
		steps: [s],
		observations: [obs("o1", "s1")],
		claims: [],
		directions: [],
		hints: [],
	};
	assert.doesNotThrow(() => compileFinish(ws, { finish: true, finishBasisIds: ["o1"] }));
});

test("framingVerdictFor reports indeterminate without throwing", () => {
	const s = step({ id: "s1", objective: "do the analysis", doneWhen: "done" });
	const ws = {
		id: "ws1",
		spec: { ...spec, goal: "analyze this" },
		runStatus: "running" as const,
		revision: 3,
		steps: [s],
		observations: [obs("o1", "s1")],
		claims: [],
		directions: [],
		hints: [],
	};
	assert.equal(framingVerdictFor(ws, ["o1"]).verdict, "indeterminate");
});
