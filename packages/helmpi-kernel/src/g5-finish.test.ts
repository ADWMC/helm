/**
 * W2-T06 G5 finish grounding (§4.1 G5: 复述型证据被拒 → finish 失败;
 * 精确切片 → 通过; 截断永不完成; 自述无 receipt → 拒). PG semantics via
 * compileFinish(receipts) — exact-slice grounding against the producing receipt.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { CompileError, compileFinish } from "./domain/completion.ts";
import type { Observation, Receipt, Spec, Step, Workspace } from "./domain/types.ts";

const spec: Spec = {
	goal: "g",
	allowedTargets: ["http://127.0.0.1:18081"],
	highRisk: "deny",
};

const doneStep: Step = {
	id: "s1",
	kind: "recon",
	target: "http://127.0.0.1:18081",
	status: "done",
	doneWhen: "login page returns 200",
	turn: 1,
} as unknown as Step;

function obs(excerpt: string, receiptSeq = 1): Observation {
	return { id: "o1", stepId: "s1", attemptId: "a1", excerpt, receiptSeq, createdAtRevision: 1 };
}

function ws(observations: Observation[], extra: Partial<Workspace> = {}): Workspace {
	return {
		id: "w",
		spec,
		runStatus: "running",
		revision: 1,
		steps: [doneStep],
		observations,
		claims: [],
		directions: [],
		hints: [],
		...extra,
	} as Workspace;
}

function receipt(stdout: string, seq = 1): Receipt {
	return { seq, stdout, stderr: "", exitCode: 0 };
}

function expectCode(fn: () => void, code: string): void {
	try {
		fn();
		assert.fail(`expected CompileError ${code}`);
	} catch (e) {
		assert.ok(e instanceof CompileError, `expected CompileError, got ${e}`);
		assert.equal((e as CompileError).code, code);
	}
}

test("A-G5 positive: exact slice grounds → finish passes (with receipts)", () => {
	const r = receipt("HTTP/1.1 200 OK\nlogin page returns 200\nContent-Length: 42");
	assert.doesNotThrow(() =>
		compileFinish(ws([obs("login page returns 200")]), { finish: true, finishBasisIds: ["o1"] }, [r]),
	);
});

test("A-G5 negative: paraphrased evidence does NOT ground → evidence_not_grounded", () => {
	const r = receipt("HTTP/1.1 200 OK\nlogin page returned successfully\n");
	// excerpt claims a reworded result — not an exact slice of the receipt
	expectCode(
		() =>
			compileFinish(ws([obs("the login page responded successfully")]), { finish: true, finishBasisIds: ["o1"] }, [
				r,
			]),
		"evidence_not_grounded",
	);
});

test("A-G5 negative: truncated receipt (excerpt beyond output) → rejected, never completes", () => {
	const full = "HTTP/1.1 200 OK\nlogin page returns 200 and more content here";
	const truncated = receipt(full.slice(0, 20)); // receipt stdout cut mid-evidence
	expectCode(
		() =>
			compileFinish(
				ws([obs("login page returns 200 and more content here")]),
				{ finish: true, finishBasisIds: ["o1"] },
				[truncated],
			),
		"evidence_not_grounded",
	);
});

test("A-G5 negative: missing receipt for basis → evidence_not_grounded (self-claim cannot stand)", () => {
	expectCode(
		() => compileFinish(ws([obs("anything", 7)]), { finish: true, finishBasisIds: ["o1"] }, [receipt("x")]),
		"evidence_not_grounded",
	);
});

test("legacy path: receipts omitted → prior semantics intact (I19 still enforced)", () => {
	// no receipts → no grounding check (existing callers unchanged)
	assert.doesNotThrow(() => compileFinish(ws([obs("whatever")]), { finish: true, finishBasisIds: ["o1"] }));
	// coverage gate still applies when required
	expectCode(
		() =>
			compileFinish(ws([obs("x")], { spec: { ...spec, requireCoverage: true }, coverage: [] }), {
				finish: true,
				finishBasisIds: ["o1"],
			}),
		"finish_without_coverage",
	);
});
