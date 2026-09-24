import assert from "node:assert/strict";
import { test } from "node:test";
import { isActivation, matchActivation } from "./activation.ts";
import { assertStepShape, CompileError, compileFinish, convergenceBlocked } from "./domain/completion.ts";
import { applyOutcomeRules, classifyEvidence, groundExcerpt } from "./domain/evidence.ts";
import { assertStepPlan, assertStepTarget, validateScopeQuery } from "./domain/scope.ts";
import type { Receipt, Spec, Step, Workspace } from "./domain/types.ts";
import { ACTIVATION_REPLY } from "./domain/types.ts";

const spec: Spec = {
	goal: "Capture the flag from authorized target.",
	allowedTargets: ["http://127.0.0.1:8080"],
	outOfScope: ["http://evil.example"],
	highRisk: "deny",
};

function step(partial: Partial<Step> & Pick<Step, "id">): Step {
	return {
		kind: "discover",
		target: "http://127.0.0.1:8080",
		objective: "map surface",
		doneWhen: "endpoints recorded",
		basisIds: [],
		dependsOn: [],
		status: "ready",
		createdRevision: 1,
		...partial,
	};
}

function ws(partial: Partial<Workspace>): Workspace {
	return {
		id: "ws1",
		spec,
		runStatus: "running",
		revision: 3,
		steps: [],
		observations: [],
		claims: [],
		directions: [],
		hints: [],
		...partial,
	};
}

test("I19: finish blocked without coverage when Spec.requireCoverage", () => {
	const specCov: Spec = { ...spec, requireCoverage: true };
	const doneStep = step({ id: "s1", status: "done" });
	const obs = {
		id: "o1",
		stepId: "s1",
		attemptId: "a1",
		excerpt: "endpoints recorded",
		receiptSeq: 1,
		createdAtRevision: 2,
	};
	const bare = ws({
		spec: specCov,
		steps: [doneStep],
		observations: [obs],
	});
	assert.throws(
		() => compileFinish(bare, { finish: true, finishBasisIds: ["o1"] }),
		(e: unknown) => e instanceof CompileError && e.code === "finish_without_coverage",
	);

	// With a coverage record → finish allowed.
	const covered = ws({
		spec: specCov,
		steps: [doneStep],
		observations: [obs],
		coverage: [{ id: "c1", surface: "/admin", outcome: "clean", createdAtRevision: 3 }],
	});
	assert.doesNotThrow(() => compileFinish(covered, { finish: true, finishBasisIds: ["o1"] }));

	// With an explicit waiver journal → finish allowed.
	const waived = ws({
		spec: specCov,
		steps: [doneStep],
		observations: [obs],
		coverageWaived: true,
	});
	assert.doesNotThrow(() => compileFinish(waived, { finish: true, finishBasisIds: ["o1"] }));
});

test("evidence ladder: bare 200 stays unconfirmed (Dark-Moon)", () => {
	const r = classifyEvidence('HTTP/1.1 200 OK\r\n{"service":"weblab"}');
	assert.equal(r.status, "unconfirmed");
	assert.ok(r.hits.includes("bare_200"));
});

test("evidence ladder: flag capture exploited; clean receipt confirmed", () => {
	assert.equal(classifyEvidence("HTTP/1.1 200 OK\nFLAG{helmpi_local_lab_ok}").status, "exploited");
	const clean = classifyEvidence("services listed\n80/tcp open\n22/tcp open");
	assert.equal(clean.status, "confirmed");
	assert.equal(clean.hits.length, 0);
});

test("validateScopeQuery: no Spec denies (fail-closed); Spec allows private", () => {
	const none = validateScopeQuery(null, "http://127.0.0.1:18081");
	assert.equal(none.allow, false);
	assert.equal(none.matchedBy, "no_spec");
	const ok = validateScopeQuery(spec, "http://127.0.0.1:8080");
	assert.equal(ok.allow, true);
});

test("activation exact match only", () => {
	assert.equal(isActivation("helmpi"), true);
	assert.equal(isActivation("helmpi "), true);
	assert.equal(isActivation("Helmpi please"), false);
	assert.equal(matchActivation("helmpi"), ACTIVATION_REPLY);
	assert.equal(matchActivation("start"), null);
});

test("evidence excerpt must be exact continuous slice", () => {
	const receipts: Receipt[] = [{ seq: 1, stdout: "HTTP/1.1 200 OK\nFLAG{abc}\n", stderr: "", exitCode: 0 }];
	const ok = groundExcerpt(receipts, "FLAG{abc}");
	assert.equal(ok.ok, true);
	assert.equal(ok.receiptSeq, 1);
	const bad = groundExcerpt(receipts, "FLAG{xyz}");
	assert.equal(bad.ok, false);
});

test("truncated evidence degrades done → progress (I7)", () => {
	const long = "x".repeat(5000);
	const receipts: Receipt[] = [{ seq: 1, stdout: long, stderr: "", exitCode: 0 }];
	const g = groundExcerpt(receipts, long);
	assert.equal(g.ok, false);
	assert.equal(g.degraded, true);
	assert.equal(applyOutcomeRules("done", g), "progress");
});

test("CRLF normalization still matches (I5)", () => {
	const receipts: Receipt[] = [{ seq: 2, stdout: "line1\r\nSECRET\r\n", stderr: "", exitCode: 1 }];
	const g = groundExcerpt(receipts, "line1\nSECRET");
	assert.equal(g.ok, true);
});

test("scope rejects out-of-allowlist target", () => {
	const d = assertStepTarget(spec, "http://evil.example");
	assert.equal(d.allow, false);
	const ok = assertStepTarget(spec, "http://127.0.0.1:8080");
	assert.equal(ok.allow, true);
	assert.match(ok.matchedBy, /^exact:/);
});

test("wildcard pattern in Spec allows bounded family (explicit rule)", () => {
	const s: Spec = {
		goal: "g",
		allowedTargets: ["http://127.0.0.1:1808*"],
		highRisk: "deny",
	};
	const ok = assertStepTarget(s, "http://127.0.0.1:18081");
	assert.equal(ok.allow, true);
	assert.match(ok.matchedBy, /^pattern:/);
	const no = assertStepTarget(s, "http://127.0.0.1:9999");
	assert.equal(no.allow, false);
	assert.equal(no.matchedBy, "none");
});

test("CIDR rule in Spec matches host (explicit rule)", () => {
	const s: Spec = {
		goal: "g",
		allowedTargets: ["192.168.77.0/24"],
		highRisk: "deny",
	};
	const ok = assertStepTarget(s, "http://192.168.77.10:8080");
	assert.equal(ok.allow, true);
	assert.match(ok.matchedBy, /^cidr:/);
	const no = assertStepTarget(s, "http://192.168.78.10:8080");
	assert.equal(no.allow, false);
});

test("fail-closed: allowlisted external host denied unless Spec.allowExternal", () => {
	const s: Spec = {
		goal: "g",
		allowedTargets: ["https://target.example"],
		highRisk: "deny",
	};
	const d = assertStepTarget(s, "https://target.example");
	assert.equal(d.allow, false);
	assert.equal(d.matchedBy, "fail_closed");
	assert.match(d.reason, /external_not_allowed/);

	const open: Spec = {
		goal: "g",
		allowedTargets: ["https://target.example"],
		highRisk: "deny",
		allowExternal: true,
	};
	assert.equal(assertStepTarget(open, "https://target.example").allow, true);
});

test("fail-closed keeps private ranges allowed (loopback/localhost)", () => {
	const s: Spec = {
		goal: "g",
		allowedTargets: ["http://127.0.0.1:8080", "http://localhost:18080"],
		highRisk: "deny",
	};
	assert.equal(assertStepTarget(s, "http://127.0.0.1:8080").allow, true);
	assert.equal(assertStepTarget(s, "http://localhost:18080").allow, true);
});

test("high risk denied when spec.highRisk=deny", () => {
	const d = assertStepPlan(spec, "exploit", "http://127.0.0.1:8080");
	assert.equal(d.allow, false);
	if (!d.allow) assert.match(d.reason, /high_risk_denied/);
});

test("TEST step cannot smuggle exploit language", () => {
	const s = step({
		id: "t1",
		kind: "test",
		objective: "probe login",
		doneWhen: "try to gain a shell",
	});
	assert.throws(
		() => assertStepShape(spec, s, s.target),
		(e: unknown) => {
			assert.ok(e instanceof CompileError);
			assert.equal(e.code, "test_crosses_exploit");
			return true;
		},
	);
});

test("finish rejected while open steps (I8)", () => {
	const open = step({ id: "s1", status: "ready" });
	assert.throws(
		() =>
			compileFinish(ws({ steps: [open] }), {
				finish: true,
				finishBasisIds: ["o1"],
			}),
		(e: unknown) => {
			assert.ok(e instanceof CompileError);
			assert.equal(e.code, "finish_with_open_steps");
			return true;
		},
	);
});

test("finish requires done-step observation basis (I8)", () => {
	const done = step({ id: "s1", status: "done" });
	const obs = {
		id: "o1",
		stepId: "s1",
		attemptId: "a1",
		excerpt: "FLAG{x}",
		receiptSeq: 1,
		createdAtRevision: 2,
	};
	assert.throws(
		() =>
			compileFinish(
				ws({
					steps: [done],
					observations: [],
				}),
				{ finish: true, finishBasisIds: ["o1"] },
			),
		(e: unknown) => {
			assert.ok(e instanceof CompileError);
			assert.equal(e.code, "finish_basis_unknown");
			return true;
		},
	);
	compileFinish(ws({ steps: [done], observations: [obs] }), {
		finish: true,
		finishBasisIds: ["o1"],
	});
});

test("convergence limit flags same-kind streak", () => {
	assert.equal(convergenceBlocked(5, 5), true);
	assert.equal(convergenceBlocked(4, 5), false);
});
