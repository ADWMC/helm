/**
 * Framing integrity — does the finish basis answer the Spec goal, or a different one?
 *
 * The existing finish checks all measure completeness: open steps, basis presence,
 * basis provenance, exact-slice grounding. None of them asks whether the work
 * solved the question that was asked. A run can satisfy every one of them and
 * still deliver a coherent artifact for a plausible-but-unintended task, with
 * nothing downstream to catch it.
 *
 * Source: arXiv:2605.09698 (Ambig-DS) found frontier agents committing to the wrong
 * target on 39-63% of ambiguous tasks without flagging it, and — its third finding —
 * that agents cannot reliably self-assess when they should have asked. A prompt
 * telling the model to be careful is therefore not a fix, so this check is
 * external and computed, not advisory.
 *
 * Pure. No I/O, no model call.
 */

import type { Observation, Step } from "./types.ts";

export type FramingVerdict = "aligned" | "misframed" | "indeterminate";

export interface FramingResult {
	readonly verdict: FramingVerdict;
	/** Fraction of goal terms covered by the basis steps. 0 when indeterminate. */
	readonly score: number;
	readonly goalTerms: readonly string[];
	readonly basisTerms: readonly string[];
	/** Goal terms the basis never mentions. Only meaningful when misframed. */
	readonly missing: readonly string[];
}

/**
 * Terms carrying no framing information: function words, polite filler, and the
 * verbs that appear in nearly every objective ("analyze", "check", "find").
 * Keeping these would inflate the intersection and mask a real mismatch.
 */
const STOPWORDS = new Set([
	// English function words
	"a",
	"an",
	"the",
	"and",
	"or",
	"of",
	"to",
	"in",
	"on",
	"for",
	"with",
	"by",
	"at",
	"is",
	"are",
	"was",
	"be",
	"as",
	"it",
	"its",
	"this",
	"that",
	"these",
	"those",
	"from",
	"into",
	"over",
	"under",
	"any",
	"all",
	"some",
	"if",
	"then",
	"than",
	// English generic task verbs — present in almost every goal and objective, so
	// they cannot discriminate one framing from another.
	"analyze",
	"analyse",
	"check",
	"test",
	"find",
	"get",
	"make",
	"do",
	"use",
	"ensure",
	"determine",
	"identify",
	"verify",
	"assess",
	"evaluate",
	"review",
	// Chinese function words
	"的",
	"了",
	"和",
	"与",
	"或",
	"在",
	"是",
	"有",
	"把",
	"被",
	"对",
	"从",
	"到",
	"并",
	"且",
	"而",
	"就",
	"都",
	"也",
	"还",
	"要",
	"会",
	"能",
	"可以",
	"进行",
	// Chinese generic task verbs, same reasoning as above
	"分析",
	"检查",
	"测试",
	"评估",
	"审查",
	"确定",
	"识别",
	"验证",
	"研究",
	"查看",
	"目标",
	"任务",
	"问题",
	"情况",
]);

/**
 * CJK has no spaces, so ASCII tokenization drops every Chinese term. Split CJK
 * runs into overlapping bigrams instead: "认证强度" -> 认证, 证强, 强度. One
 * character of drift still leaves a shared bigram, which makes the overlap
 * tolerant of the trailing particles that Chinese objectives tend to carry.
 */
function tokenize(text: string): string[] {
	const out: string[] = [];
	const cjkRuns = text.match(/[\u4e00-\u9fff]+/g) ?? [];
	for (const run of cjkRuns) {
		if (run.length === 1) {
			out.push(run);
			continue;
		}
		for (let i = 0; i < run.length - 1; i++) {
			out.push(run.slice(i, i + 2));
		}
	}
	const latin = text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? [];
	out.push(...latin);
	return [...new Set(out)].filter((t) => !STOPWORDS.has(t));
}

/**
 * Minimum goal terms before a verdict is trustworthy.
 *
 * A goal of one or two content words ("web lab") shares no vocabulary with a
 * generic objective ("work in phase-1") without that being evidence of
 * misframing — there simply is not enough signal to compare. Requiring a floor
 * keeps the check from firing on thin inputs, where a false positive would block
 * a legitimate finish.
 */
export const MIN_GOAL_TERMS = 3;

/**
 * Measured constraint, not a tuned one.
 *
 * Treating "no shared term" as evidence of misframing was the first design and
 * it was wrong. Measured over real fixtures, a legitimate CTF run — goal
 * "Capture the flag from authorized target." with a discover step doing
 * "map http surface" — produces four goal terms, four basis terms, and zero
 * overlap, which is byte-for-byte the shape of a genuine mismatch (goal
 * "evaluate authentication strength", basis "measure password policy"). No
 * threshold separates them, so a zero-overlap trigger cannot be right.
 *
 * The check therefore requires positive evidence that the basis pursued a
 * *different subject*, not merely the absence of the goal's words. That needs
 * the basis to name subject matter of its own, which terse operational wording
 * ("map http surface", "services: 80,443") never does.
 */
const OPERATIONAL_ONLY = new Set([
	"map",
	"surface",
	"scan",
	"port",
	"ports",
	"service",
	"services",
	"http",
	"https",
	"endpoint",
	"endpoints",
	"recorded",
	"done",
	"complete",
	"completed",
	"finish",
	"finished",
	"output",
	"result",
	"results",
	"data",
	"file",
	"files",
	"run",
	"ran",
	"step",
	"steps",
	"phase",
	"work",
	"working",
	"proceed",
	"list",
	"enumerate",
	"enumerated",
	"collect",
	"collected",
	"gather",
]);

/**
 * A basis whose distinct subject terms are all operational vocabulary is
 * describing *activity*, not *subject matter*, and activity cannot contradict a
 * goal. Only a basis that names a subject the goal does not share is misframed.
 */
function subjectTerms(terms: readonly string[]): string[] {
	return terms.filter((t) => !OPERATIONAL_ONLY.has(t));
}

export function checkFraming(input: {
	readonly goal: string;
	readonly steps: readonly Step[];
	readonly observations: readonly Observation[];
	readonly basisIds: readonly string[];
}): FramingResult {
	const goalTerms = tokenize(input.goal);
	if (goalTerms.length < MIN_GOAL_TERMS) {
		return { verdict: "indeterminate", score: 0, goalTerms, basisTerms: [], missing: [] };
	}

	const obsById = new Map(input.observations.map((o) => [o.id, o]));
	const stepById = new Map(input.steps.map((s) => [s.id, s]));

	// Gather the terms from the steps that actually produced the finish basis.
	// Using observations' own text would pull in tool output noise; the objective
	// and doneWhen are what the run asserted it was trying to do.
	const basisText: string[] = [];
	for (const id of input.basisIds) {
		const obs = obsById.get(id);
		if (!obs) continue;
		const step = stepById.get(obs.stepId);
		if (!step) continue;
		basisText.push(step.objective, step.doneWhen);
	}
	if (basisText.length === 0) {
		return { verdict: "indeterminate", score: 0, goalTerms, basisTerms: [], missing: [] };
	}

	const basisTerms = tokenize(basisText.join(" "));
	const basisSubjects = subjectTerms(basisTerms);
	const goalSet = new Set(goalTerms);
	const sharedSubjects = basisSubjects.filter((t) => goalSet.has(t));
	const missing = goalTerms.filter((t) => !new Set(basisTerms).has(t));
	const score = (goalTerms.length - missing.length) / goalTerms.length;

	// No subject matter of its own means the basis describes activity only, and
	// activity cannot be off-topic. This is also where the common legitimate
	// paraphrase lands, so it must pass rather than block.
	if (basisSubjects.length === 0) {
		return { verdict: "indeterminate", score, goalTerms, basisTerms, missing: [] };
	}
	// The basis names subject matter, and shares none of it with the goal. This is
	// the actionable case: the run demonstrably worked on something else.
	if (sharedSubjects.length === 0) {
		return { verdict: "misframed", score, goalTerms, basisTerms, missing };
	}
	return { verdict: "aligned", score, goalTerms, basisTerms, missing: [] };
}
