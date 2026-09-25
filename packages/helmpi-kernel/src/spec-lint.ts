/**
 * Spec 特异性 lint L1–L6 (W3-T01, §2.7.1) — semantic layer on top of the
 * structural config-schema validation. "lint 不过 = Spec 非法" (拒进 Run).
 *
 *   L1 computable goal        — goal must carry a measurable anchor (number/unit/
 *                               endpoint/flag/status keyword); bare vague prose fails.
 *   L2 goal → diagnostic set  — measurable goals must list their必查属性集
 *                               (spec.diagnosticSet); otherwise the agent cannot
 *                               derive what must not be skipped (评分#11).
 *   L3 goal ≈ verdict         — diagnosticSet tokens must actually appear in the
 *                               goal (target sentence sits next to the verdict
 *                               sentence; reorder-sensitive in practice, PAGE 10).
 *   L4 cost phrasing          — NEVER linted (负面规则: wording of cost is irrelevant,
 *                               arXiv2609 PAGE 10) — always passes, documented here.
 *   L5 explicit scale         — allowedTargets non-empty + maxTokens > 0.
 *   L6 vague → clarify first  — vague imperatives block the run until rewritten
 *                               (never silently proceed, PAGE 17-18).
 */

export interface SpecLintFailure {
	readonly rule: "L1" | "L2" | "L3" | "L5" | "L6";
	readonly message: string;
}

export interface SpecLike {
	goal?: unknown;
	allowedTargets?: unknown;
	maxTokens?: unknown;
	diagnosticSet?: unknown;
}

const VAGUE = [
	/best\s+(deal|value|approach|practice)/i,
	/good\s+value/i,
	/\bassess\s+(the\s+)?security\b/i,
	/\bevaluate\s+the\s+(app|site|system)\b/i,
	/看看|摸一下|测一下|试一下|看看安全|搞一下|研究一下/,
	/优质|最好的|尽量|差不多|随便/,
];

const MEASURE = [
	/\d/, // numbers (counts, thresholds, ports, ratios)
	/unit\s*price|per\s*ounce|单价|成本/i,
	/status\s*code|\b200\b|\b40[13]\b|\b50\d\b/i,
	/flag\{|\/[a-z0-9_-]+\/|endpoint|端点|路径|接口/i,
	/idor|sqli|xss|ssrf|rce|cve-?\d+/i,
	/coverage|覆盖|findings?|发现数|severity/i,
];

function str(v: unknown): string {
	return typeof v === "string" ? v : "";
}

/** Returns [] when the Spec passes every lint rule (L4 is structurally absent). */
export function lintHelmSpec(spec: SpecLike): SpecLintFailure[] {
	const failures: SpecLintFailure[] = [];
	const goal = str(spec.goal).trim();

	// L6 first: vague goals never reach L1/L2 noise — clarify or block.
	const vagueHit = VAGUE.find((p) => p.test(goal));
	if (vagueHit) {
		failures.push({ rule: "L6", message: `goal is vague (${vagueHit.source}) — clarify before run (阻断)` });
		return failures;
	}

	// L1: measurable anchor required.
	if (goal.length < 16) {
		failures.push({
			rule: "L1",
			message: "goal too short to be computable (need ≥16 chars with a measurable anchor)",
		});
	} else if (!MEASURE.some((p) => p.test(goal))) {
		failures.push({
			rule: "L1",
			message: "goal lacks a measurable anchor (numbers/endpoint/status/finding keywords)",
		});
	}

	// L2: measurable goals must expose their 必查属性集.
	const hasMeasure = MEASURE.some((p) => p.test(goal));
	if (hasMeasure) {
		const ds = spec.diagnosticSet;
		if (!Array.isArray(ds) || ds.length === 0) {
			failures.push({ rule: "L2", message: "measurable goal requires non-empty diagnosticSet (必查属性集)" });
		} else if (ds.some((d) => typeof d !== "string")) {
			failures.push({ rule: "L2", message: "diagnosticSet entries must be strings" });
		}
	}

	// L3: goal and verdict must share the same metric vocabulary.
	if (Array.isArray(spec.diagnosticSet) && spec.diagnosticSet.length > 0 && goal) {
		const tokens = (spec.diagnosticSet as unknown[]).filter((d): d is string => typeof d === "string");
		const shared = tokens.some((t) => t.length >= 3 && goal.toLowerCase().includes(t.toLowerCase()));
		if (!shared) {
			failures.push({
				rule: "L3",
				message:
					"diagnosticSet tokens never appear in goal (target sentence must sit next to the verdict sentence)",
			});
		}
	}

	// L5: explicit scale.
	const targets = spec.allowedTargets;
	if (!Array.isArray(targets) || targets.length === 0) {
		failures.push({ rule: "L5", message: "allowedTargets must be non-empty (规模显式)" });
	}
	if (typeof spec.maxTokens !== "number" || spec.maxTokens <= 0) {
		failures.push({ rule: "L5", message: "maxTokens must be > 0 (预算显式)" });
	}

	return failures;
}
