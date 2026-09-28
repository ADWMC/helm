/**
 * Review Gate — 证据缺失拒收 category (REDESIGN §4.5/§10.7, 验收门 3/5):
 * claims without precise receipt slices are refused; the finish gate blocks
 * completion; model self-report cannot substitute for evidence.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Receipt } from "../domain/types.ts";
import type { EvidenceEvent } from "./contracts.ts";
import { type ClaimInput, ReviewGate } from "./review-gate.ts";

function setup(opts: { receipts?: Receipt[]; evidence?: EvidenceEvent[]; goal?: string } = {}) {
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
		...(opts.goal === undefined ? {} : { goal: () => opts.goal as string }),
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

test("review-gate: an id echoed in a tool response is not evidence (I5 exact slice)", () => {
	const gate = new ReviewGate({
		journal: () => {},
		// receipt 2 literally echoes the id string — must NOT ground the claim
		receipts: () => [{ seq: 1, stdout: "finding recorded: x [E-001]", stderr: "", exitCode: 0 }],
		evidence: () => [],
		resolveExternalRef: (ref) => (ref === "E-001" ? null : null),
		clock: () => 5000,
	});
	const review = gate.reviewClaim(claim({ evidenceRefs: ["E-001"] }));
	assert.equal(review.status, "unverified", "echoed id string can never ground a claim");
	assert.equal(review.reason, "evidence_not_grounded");
});

/*
 * Framing integrity on the finish gate (arXiv:2605.09698). These live here, not
 * only in framing.test.ts, because `finishGate` is the gate a real `helm` run
 * actually reaches — the autonomous loop's compileFinish is a separate entry
 * (`helmpi run`). A check that only exists on the unreached path is not deployed.
 */

test("finish gate: grounded claims that answer another question do not pass", () => {
	// Every claim is receipt-backed, so the evidence gate alone would pass. The
	// claims are about password policy while the goal asks about authentication
	// strength: the delivery is coherent and about the wrong thing.
	const { gate, journal } = setup({
		goal: "evaluate the authentication strength of the target site",
		receipts: [
			{ seq: 1, stdout: "password policy: min length 8", stderr: "", exitCode: 0 },
			{ seq: 2, stdout: "complexity rules: none enforced", stderr: "", exitCode: 0 },
		],
		evidence: [
			{
				id: "EV-1-1",
				receiptSeq: 1,
				excerpt: "password policy: min length 8",
				status: "exploited",
				sourceStep: null,
				at: 1,
			},
			{
				id: "EV-2-1",
				receiptSeq: 2,
				excerpt: "complexity rules: none enforced",
				status: "exploited",
				sourceStep: null,
				at: 1,
			},
		],
	});
	const res = gate.finishGate([
		claim({ id: "C1", statement: "password policy requires a minimum length of 8", evidenceRefs: ["EV-1-1"] }),
		claim({ id: "C2", statement: "complexity rules are not enforced anywhere", evidenceRefs: ["EV-2-1"] }),
	]);
	assert.equal(res.framing.verdict, "misframed");
	assert.equal(res.pass, false, "a misframed finish must not pass even with grounded claims");
	assert.ok(res.framing.missing.length > 0);
	const finish = journal.filter((e) => e.kind === "review_gate" && e.payload.scope === "finish");
	assert.equal(finish.at(-1)?.payload.framing, "misframed", "the verdict must be on the record");
});

test("finish gate: claims that answer the goal pass unchanged", () => {
	const { gate } = setup({
		goal: "evaluate the authentication strength of the target site",
		receipts: [{ seq: 1, stdout: "uid=0(root)\nlogin ok", stderr: "", exitCode: 0 }],
	});
	const res = gate.finishGate([
		claim({ id: "C1", statement: "authentication strength on the target site is weak", evidenceRefs: ["EV-1-1"] }),
	]);
	assert.equal(res.framing.verdict, "aligned");
	assert.equal(res.pass, true);
});

test("finish gate: no goal configured yields indeterminate, which must not block", () => {
	// Callers that do not supply a goal must behave exactly as before this check
	// existed; blocking them would be a regression, not a safeguard.
	const { gate } = setup();
	const res = gate.finishGate([claim({ evidenceRefs: ["EV-1-1"] })]);
	assert.equal(res.framing.verdict, "indeterminate");
	assert.equal(res.pass, true);
});
