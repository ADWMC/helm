/**
 * Review Gate — Claim/Evidence review (REDESIGN §4.5, §10.7). Deterministic
 * MVP verifier: a claim is `verified` only with ≥1 exact Receipt slice AND a
 * passing verifier result. Model self-report, user confirmation and history
 * cannot change a status — only receipts can.
 *
 * The gate also runs the finish check: a run whose claims lack evidence can
 * never be marked completed (验收门 3).
 */

import { classifyEvidence, groundExcerpt } from "../domain/evidence.ts";
import { checkFraming, type FramingResult } from "../domain/framing.ts";
import type { Receipt } from "../domain/types.ts";
import type { EvidenceEvent } from "./contracts.ts";
import { JOURNAL_KEYS } from "./contracts.ts";

export type ClaimStatus = "verified" | "probable" | "unverified" | "blocked";
export type ReviewVerdict = "pass" | "challenge" | "unknown";

export interface ClaimInput {
	readonly id: string;
	readonly statement: string;
	readonly target: string | null;
	readonly evidenceRefs: readonly string[];
	readonly blockedReason?: string;
}

export interface ClaimReview {
	readonly claimId: string;
	readonly status: ClaimStatus;
	readonly verdict: ReviewVerdict;
	readonly reason: string;
	readonly groundedEvidenceIds: readonly string[];
	readonly missing: readonly string[];
}

export interface ReviewDeps {
	readonly journal: (kind: string, payload: Record<string, unknown>) => void;
	readonly receipts: () => readonly Receipt[];
	readonly evidence: () => readonly EvidenceEvent[];
	/**
	 * Optional resolver for external evidence refs (e.g. case-workspace E-ids).
	 * The resolved content must ground as an exact receipt slice to count —
	 * the resolver never grants evidence by itself.
	 */
	readonly resolveExternalRef?: (ref: string) => string | null;
	readonly clock?: () => number;
	/**
	 * The Spec goal, for framing integrity. Optional so existing callers keep
	 * working; when absent the framing check reports `indeterminate` (no goal to
	 * compare against) rather than assuming alignment.
	 */
	readonly goal?: () => string;
}

export interface FinishGateResult {
	readonly pass: boolean;
	readonly reviews: readonly ClaimReview[];
	readonly unverified: readonly string[];
	/**
	 * Framing verdict for this finish (arXiv:2605.09698). `misframed` means the
	 * claims name a subject the Spec goal never mentions — the run finished
	 * something, but not the thing that was asked for, and every other check in
	 * this gate would still pass.
	 */
	readonly framing: FramingResult;
}

const MAX_SLICE_FOR_VERIFICATION = 4000;

export class ReviewGate {
	private readonly deps: ReviewDeps;
	/** Same unverified conclusion repeated → confirmation_loop (防迎合). */
	private readonly seenUnverified = new Map<string, number>();

	constructor(deps: ReviewDeps) {
		this.deps = deps;
	}

	private now(): number {
		return this.deps.clock ? this.deps.clock() : Date.now();
	}

	/**
	 * Review one claim. Resolution order: blocked reason → evidence refs
	 * (receipt-backed ids or exact slices) → verifier counter-example check.
	 */
	reviewClaim(claim: ClaimInput): ClaimReview {
		if (claim.blockedReason !== undefined) {
			const review: ClaimReview = {
				claimId: claim.id,
				status: "blocked",
				verdict: "unknown",
				reason: claim.blockedReason,
				groundedEvidenceIds: [],
				missing: [],
			};
			this.deps.journal(JOURNAL_KEYS.reviewGate, { ...review, at: this.now(), scope: "claim" });
			return review;
		}

		const receipts = this.deps.receipts();
		const evidenceById = new Map(this.deps.evidence().map((e) => [e.id, e]));
		const groundedIds: string[] = [];
		const slices: string[] = [];

		for (const ref of claim.evidenceRefs) {
			const ev = evidenceById.get(ref);
			if (ev) {
				// Receipt-backed evidence event: re-ground its slice (paraphrase
				// protection — the stored excerpt must still hit its receipt).
				const r = receipts.find((x) => x.seq === ev.receiptSeq);
				if (r && groundExcerpt([r], ev.excerpt).ok) {
					groundedIds.push(ev.id);
					slices.push(ev.excerpt);
				}
				continue;
			}
			// Id-shaped refs must resolve to real evidence content; an id echoed
			// inside a tool response is NOT an exact slice of a finding.
			const idShaped = /^(E-\d+|EV-[\w-]+|slice:|ref:)/.test(ref);
			if (!idShaped) {
				const g = groundExcerpt(receipts, ref);
				if (
					g.ok &&
					g.receiptSeq !== null &&
					g.normalizedExcerpt &&
					g.normalizedExcerpt.length <= MAX_SLICE_FOR_VERIFICATION
				) {
					groundedIds.push(`slice:${g.receiptSeq}`);
					slices.push(g.normalizedExcerpt);
					continue;
				}
			}
			const external = this.deps.resolveExternalRef?.(ref) ?? null;
			if (external !== null) {
				const eg = groundExcerpt(receipts, external);
				if (
					eg.ok &&
					eg.receiptSeq !== null &&
					eg.normalizedExcerpt &&
					eg.normalizedExcerpt.length <= MAX_SLICE_FOR_VERIFICATION
				) {
					groundedIds.push(`ref:${ref}`);
					slices.push(eg.normalizedExcerpt);
				}
			}
		}

		let review: ClaimReview;
		if (claim.evidenceRefs.length === 0) {
			review = {
				claimId: claim.id,
				status: "unverified",
				verdict: "challenge",
				reason: "evidence_missing",
				groundedEvidenceIds: [],
				missing: ["receipt_slice"],
			};
		} else if (groundedIds.length === 0) {
			review = {
				claimId: claim.id,
				status: "unverified",
				verdict: "challenge",
				reason: "evidence_not_grounded",
				groundedEvidenceIds: [],
				missing: ["receipt_slice"],
			};
		} else {
			// Verifier counter-example attempt: negative markers in the grounded
			// slices contradict a confirmed conclusion (Dark-Moon ladder).
			const hits = new Set<string>();
			for (const slice of slices) {
				for (const h of classifyEvidence(slice).hits) hits.add(h);
			}
			if (hits.size > 0) {
				review = {
					claimId: claim.id,
					status: "probable",
					verdict: "challenge",
					reason: `counter_example:${[...hits].join(",")}`,
					groundedEvidenceIds: groundedIds,
					missing: [],
				};
			} else {
				review = {
					claimId: claim.id,
					status: "verified",
					verdict: "pass",
					reason: "grounded exact slice + verifier pass",
					groundedEvidenceIds: groundedIds,
					missing: [],
				};
			}
		}

		this.deps.journal(JOURNAL_KEYS.reviewGate, {
			claimId: review.claimId,
			status: review.status,
			verdict: review.verdict,
			reason: review.reason,
			groundedEvidenceIds: review.groundedEvidenceIds,
			missing: review.missing,
			scope: "claim",
			at: this.now(),
		});

		if (review.verdict === "challenge" && review.status !== "verified") {
			this.deps.journal("challenge_started", { claimId: review.claimId, reason: review.reason, at: this.now() });
			if (review.status === "probable") {
				this.deps.journal("challenge_accepted", {
					claimId: review.claimId,
					downgradedTo: "probable",
					at: this.now(),
				});
			}
		}

		// Confirmation loop: the same unverified conclusion repeated without new
		// evidence must not snowball (§4.5 防迎合).
		if (review.status === "unverified") {
			const seen = (this.seenUnverified.get(claim.statement) ?? 0) + 1;
			this.seenUnverified.set(claim.statement, seen);
			if (seen >= 2) {
				this.deps.journal("confirmation_loop", {
					claimId: claim.id,
					statement: claim.statement,
					count: seen,
					at: this.now(),
				});
			}
		}

		return review;
	}

	/**
	 * Finish gate: claims without precise evidence refuse completion — the run
	 * may end, but never as `completed` (验收门 3). No auto-repair loop here.
	 */
	finishGate(claims: readonly ClaimInput[]): FinishGateResult {
		const reviews = claims.map((c) => this.reviewClaim(c));
		const unverified = reviews
			.filter((r) => r.status === "unverified" || r.status === "blocked")
			.map((r) => r.claimId);
		const pass = claims.length > 0 && unverified.length === 0;

		// Framing integrity, on the path a real run actually takes. Every other
		// check here asks whether the claims are proven; none asks whether they
		// are about the question that was posed. A run can satisfy all of them
		// while delivering a coherent answer to a different question.
		//
		// The comparison uses the claim statements as the basis: those are what
		// the run asserts it established, so they are what must match the goal.
		const framing = checkFraming({
			goal: this.deps.goal?.() ?? "",
			steps: claims.map((c) => ({
				id: c.id,
				kind: "report" as const,
				target: c.target ?? "",
				objective: c.statement,
				doneWhen: c.statement,
				basisIds: [],
				dependsOn: [],
				status: "done" as const,
				createdRevision: 0,
			})),
			observations: claims.map((c, i) => ({
				id: c.id,
				stepId: c.id,
				attemptId: c.id,
				excerpt: c.statement,
				receiptSeq: i,
				createdAtRevision: 0,
			})),
			basisIds: claims.map((c) => c.id),
		});

		this.deps.journal(JOURNAL_KEYS.reviewGate, {
			scope: "finish",
			pass,
			claimCount: claims.length,
			unverified,
			framing: framing.verdict,
			framingMissing: framing.missing,
			at: this.now(),
		});
		return {
			pass: pass && framing.verdict !== "misframed",
			reviews,
			unverified,
			framing,
		};
	}
}
