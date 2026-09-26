/**
 * Review Gate — 证据缺失拒收 category (REDESIGN §4.5/§10.7, 验收门 3/5):
 * claims without precise receipt slices are refused; the finish gate blocks
 * completion; model self-report cannot substitute for evidence.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Receipt } from "../domain/types.ts";
import type { EvidenceEvent } from "./contracts.ts";
import { ReviewGate, type ClaimInput } from "./review-gate.ts";

function setup(opts: { receipts?: Receipt[]; evidence?: EvidenceEvent[] } = {}) {
	const journal: Array<{ kind: string; payload: Record<string, unknown> }> = [];
	const receipts = opts.receipts ?? [
		{ seq: 1, stdout: "uid=0(root)\nlogin ok", stderr: "", exitCode: 0 },
		{ seq: 2, stdout: "Server: nginx\n200 OK", stderr: "", exitCode: 0 },
	];
	const evidence = opts.evidence ?? [
		{
			id: "EV-1-1",
			receiptSeq: 1,
			excerpt: "uid=0(root)",
			status: "exploited",
			sourceStep: null,
			at: 1,
		},
	];
	const gate = new ReviewGate({
		journal: (kind, payload) => journal.push({ kind, payload }),
		receipts: () => receipts,
		evidence: () => evidence,
		clock: () => 5000,
	});
	return { gate, journal };
}

function claim(over: Partial<ClaimInput> = {}): ClaimInput {
	return {
		id: "C1",
		statement: "root shell obtained",
		target: "fixture-01",
		evidenceRefs: [],
		...over,
	};
}

test("review-gate: claim without evidence is refused (证据缺失拒收)", () => {
	const { gate, journal } = setup();
	const review = gate.reviewClaim(claim());
	assert.equal(review.status, "unverified");
	assert.equal(review.verdict, "challenge");
	assert.equal(review.reason, "evidence_missing");
	assert.deepEqual(review.missing, ["receipt_slice"]);
	assert.ok(journal.some((e) => e.kind === "review_gate" && e.payload.claimId === "C1"));
});

test("review-gate: evidence refs that do not ground are refused", () => {
	const { gate } = setup();
	const review = gate.reviewClaim(claim({ evidenceRefs: ["EV-999", "a paraphrase of some output"] }));
	assert.equal(review.status, "unverified");
	assert.equal(review.reason, "evidence_not_grounded");
});

test("review-gate: receipt-backed exact slice verifies the claim", () => {
	const { gate } = setup();
	const review = gate.reviewClaim(claim({ evidenceRefs: ["EV-1-1"] }));
	assert.equal(review.status, "verified");
	assert.equal(review.verdict, "pass");
	assert.deepEqual(review.groundedEvidenceIds, ["EV-1-1"]);
});

test("review-gate: raw exact slices of receipts ground too", () => {
	const { gate } = setup();
	const review = gate.reviewClaim(claim({ evidenceRefs: ["uid=0(root)"] }));
	assert.equal(review.status, "verified");
	assert.deepEqual(review.groundedEvidenceIds, ["slice:1"]);
});

test("review-gate: negative markers downgrade to probable (counter-example check)", () => {
	const { gate, journal } = setup();
	const review = gate.reviewClaim(
		claim({ statement: "sensitive endpoint exposed", evidenceRefs: ["Server: nginx\n200 OK"] }),
	);
	assert.equal(review.status, "probable", "bare 200 OK is a negative marker, never verified");
	assert.match(review.reason, /^counter_example:/);
	assert.ok(journal.some((e) => e.kind === "challenge_accepted"));
});

test("review-gate: blocked claims keep their gate reason", () => {
	const { gate } = setup();
	const review = gate.reviewClaim(claim({ blockedReason: "token_budget_exhausted" }));
	assert.equal(review.status, "blocked");
	assert.equal(review.reason, "token_budget_exhausted");
});

test("review-gate: finish refuses completion when claims lack evidence", () => {
	const { gate, journal } = setup();
	const res = gate.finishGate([claim(), claim({ id: "C2", evidenceRefs: ["EV-1-1"] })]);
	assert.equal(res.pass, false, "run cannot be completed with unverified claims");
	assert.deepEqual(res.unverified, ["C1"]);
	const finish = journal.filter((e) => e.kind === "review_gate" && e.payload.scope === "finish");
	assert.equal(finish.length, 1);
	assert.equal(finish[0]?.payload.pass, false);
});

test("review-gate: finish passes only with grounded claims", () => {
	const { gate } = setup();
	const res = gate.finishGate([claim({ evidenceRefs: ["EV-1-1"] })]);
	assert.equal(res.pass, true);
});

test("review-gate: repeated unverified conclusion triggers confirmation_loop", () => {
	const { gate, journal } = setup();
	gate.reviewClaim(claim());
	gate.reviewClaim(claim());
	const loops = journal.filter((e) => e.kind === "confirmation_loop");
	assert.equal(loops.length, 1, "second identical unverified claim loops");
});

test("review-gate: external E-id refs count only when their content grounds to a receipt", () => {
	const journal: Array<{ kind: string; payload: Record<string, unknown> }> = [];
	const gate = new ReviewGate({
		journal: (kind, payload) => journal.push({ kind, payload }),
		receipts: () => [{ seq: 1, stdout: "uid=0(root)", stderr: "", exitCode: 0 }],
		evidence: () => [],
		resolveExternalRef: (ref) => (ref === "E-1" ? "uid=0(root)" : "some pasted text not in receipts"),
		clock: () => 5000,
	});
	const grounded = gate.reviewClaim(claim({ evidenceRefs: ["E-1"] }));
	assert.equal(grounded.status, "verified");
	assert.deepEqual(grounded.groundedEvidenceIds, ["ref:E-1"]);
	const ungrounded = gate.reviewClaim(claim({ id: "C2", evidenceRefs: ["E-2"] }));
	assert.equal(ungrounded.status, "unverified", "resolved content must still ground (I5)");
});
