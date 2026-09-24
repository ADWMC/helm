/** Evidence grounding — P4 / I5 / I7. Pure functions. */

import type { EvidenceStatus, Observation, Receipt, StepOutcome } from "./types.ts";

export interface EvidenceClassification {
	readonly status: EvidenceStatus;
	/** Negative-marker ids that fired (why this is not confirmed yet). */
	readonly hits: readonly string[];
	readonly because: string;
}

export interface EvidenceMarker {
	readonly id: string;
	readonly pattern: RegExp;
	readonly why: string;
}

/**
 * Adversarial status ladder (Dark-Moon conf/agents/pentest.md:13-36):
 * keep evidence UNCONFIRMED while it is "only" one of these shapes.
 * Heuristic over the grounded excerpt — a report-layer HINT, never a
 * substitute for I5 grounding or the finish compiler (P2).
 */
export const EVIDENCE_NEGATIVE_MARKERS: readonly EvidenceMarker[] = [
	{
		id: "bare_200",
		pattern: /\b200\s+OK\b/i,
		why: "a bare HTTP 200 / reachable route (SPA routes 200 on any path)",
	},
	{
		id: "differential_only",
		pattern: /\b(?:length|etag|status)\b[^.]{0,60}\bvar(?:y|ies|ied)\b|\bdiffers?\b with input/i,
		why: "a differential response alone (length/ETag/status vary with input)",
	},
	{
		id: "echoed_json",
		pattern: /\becho(?:ed)?\b[^.]{0,40}\bjson\b|\bstored (?:back )?in json\b/i,
		why: "a payload stored or echoed in JSON (XSS needs a rendered sink)",
	},
	{
		id: "served_not_executed",
		pattern: /\bserved but not executed\b|\bno rce\b/i,
		why: "a file served but not executed (no RCE)",
	},
	{
		id: "key_presence_only",
		pattern:
			/\b(?:api[_-]?key|secret|credential|private[_-]?key)\b[^.]{0,40}\b(?:present|found|detected|embedded)\b/i,
		why: "mere presence of a key/secret or client-side code (client trust != server trust)",
	},
	{
		id: "public_by_design",
		pattern: /\bpk_live_|\bpk_test_|NEXT_PUBLIC_|\bdsn\s*[:=]/i,
		why: "a public-by-design secret (Stripe pk_, Sentry DSN, NEXT_PUBLIC_ keys)",
	},
	{
		id: "by_design_disclaimer",
		pattern: /\b(?:demo|example|sample|placeholder|intentionally public|public config)\b/i,
		why: "secret shipped with an in-band disclaimer that it is intentional",
	},
];

/** Impact demonstrated end-to-end → EXPLOITED (Dark-Moon line 14). */
const IMPACT_PATTERN = /\bFLAG\{[^}]{1,120}\}|\buid=\d+|\bgid=\d+\b|\broot@\b/;

/**
 * Receipt-level evidence status for report layering.
 * - exploited:   impact executed end-to-end (flag captured / shell ids)
 * - unconfirmed: grounded but only negative-marker shapes — still reported
 * - confirmed:   grounded receipt (I5) with no negative markers
 */
export function classifyEvidence(excerpt: string): EvidenceClassification {
	const hits = EVIDENCE_NEGATIVE_MARKERS.filter((m) => m.pattern.test(excerpt)).map((m) => m.id);
	if (IMPACT_PATTERN.test(excerpt)) {
		return {
			status: "exploited",
			hits,
			because: "impact demonstrated in grounded excerpt",
		};
	}
	if (hits.length > 0) {
		return {
			status: "unconfirmed",
			hits,
			because: hits.join(", "),
		};
	}
	return {
		status: "confirmed",
		hits: [],
		because: "grounded receipt without negative markers",
	};
}

export interface GroundingResult {
	readonly ok: boolean;
	readonly receiptSeq: number | null;
	readonly normalizedExcerpt: string | null;
	readonly reason?: string;
	readonly degraded?: boolean;
}

const MAX_EXCERPT = 4000;

/** Only CRLF→LF normalization is allowed when resolving quotes (I5). */
function normalizeNewlines(s: string): string {
	return s.replace(/\r\n/g, "\n");
}

export function findExactSlice(output: string, excerpt: string): { start: number; end: number } | null {
	if (!excerpt) return null;
	const direct = output.indexOf(excerpt);
	if (direct >= 0) {
		return { start: direct, end: direct + excerpt.length };
	}
	const normOut = normalizeNewlines(output);
	const normEx = normalizeNewlines(excerpt);
	const start = normOut.indexOf(normEx);
	if (start < 0) return null;
	// Map normalized index back approximately: only CRLF collapses, so scan.
	let orig = 0;
	let seen = 0;
	while (orig < output.length && seen < start) {
		if (output[orig] === "\r" && output[orig + 1] === "\n") {
			orig += 2;
			seen += 1;
		} else {
			orig += 1;
			seen += 1;
		}
	}
	const length = normEx.length;
	return { start: orig, end: Math.min(output.length, orig + length) };
}

export function groundExcerpt(receipts: readonly Receipt[], excerpt: string): GroundingResult {
	if (!excerpt.trim()) {
		return { ok: false, receiptSeq: null, normalizedExcerpt: null, reason: "empty_excerpt" };
	}
	for (const r of receipts) {
		const output = r.stdout + (r.stderr ? `\n${r.stderr}` : "");
		const slice = findExactSlice(output, excerpt);
		if (slice) {
			const raw = output.slice(slice.start, slice.end);
			if (raw.length > MAX_EXCERPT) {
				// Truncation can never complete (I7) — caller must degrade outcome.
				return {
					ok: false,
					receiptSeq: r.seq,
					normalizedExcerpt: raw.slice(-MAX_EXCERPT),
					reason: "excerpt_truncated",
					degraded: true,
				};
			}
			return { ok: true, receiptSeq: r.seq, normalizedExcerpt: raw };
		}
	}
	return { ok: false, receiptSeq: null, normalizedExcerpt: null, reason: "not_in_receipts" };
}

export function applyOutcomeRules(proposed: StepOutcome, grounding: GroundingResult): StepOutcome {
	if (proposed !== "done") return proposed;
	if (grounding.degraded || grounding.reason === "excerpt_truncated") return "progress";
	if (!grounding.ok) return "progress";
	return "done";
}

export function observationFromGrounding(
	grounding: GroundingResult,
	stepId: string,
	attemptId: string,
	revision: number,
	id: string,
): Observation | null {
	if (!grounding.ok || grounding.receiptSeq == null || !grounding.normalizedExcerpt) {
		return null;
	}
	return {
		id,
		stepId,
		attemptId,
		excerpt: grounding.normalizedExcerpt,
		receiptSeq: grounding.receiptSeq,
		createdAtRevision: revision,
	};
}
