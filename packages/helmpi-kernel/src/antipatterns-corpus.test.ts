/**
 * Anti-pattern corpus → detector mapping tests (Wave 4, PLAN §2 row 8).
 *
 * Corpus: reference/repos/agentic-anti-patterns — catalog actually has
 * **50 entries** (AP-01..AP-50; the awesome-list blurb saying "20" has drifted).
 * Each row asserts that helm-pi's EXISTING mechanism really blocks the failure
 * mode. Patterns without a runtime detector are listed as KNOWN GAPS below —
 * we do not fake coverage.
 *
 * Reference: README.md headings AP-01/02/05/10/14/16/18/43/45 (grep-verified).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { CompileError, compileFinish } from "./domain/completion.ts";
import { applyOutcomeRules, groundExcerpt } from "./domain/evidence.ts";
import { assertStepPlan } from "./domain/scope.ts";
import type { Receipt, Spec, Workspace } from "./domain/types.ts";
import { planMcpCall } from "./host/mcp-bridge.ts";
import { canEnterNext, type Playbook } from "./playbook.ts";
import { checkStepToolCap } from "./supervise.ts";
import { CORE_TOOLS, selectToolSurface } from "./tool-surface.ts";

const spec: Spec = {
	goal: "corpus probe",
	allowedTargets: ["http://127.0.0.1:18081"],
	highRisk: "deny",
};

const ws: Workspace = {
	id: "w",
	spec,
	runStatus: "running",
	revision: 1,
	steps: [],
	observations: [],
	claims: [],
	directions: [],
	hints: [],
};

const pb: Playbook = {
	schema: 1,
	id: "x",
	title: "X",
	phases: [
		{
			id: "a",
			title: "A",
			deliverables: [{ key: "k", description: "d", evidence: "required" }],
			gateOut: "all_deliverables_have_evidence",
			next: ["b"],
		},
		{
			id: "b",
			title: "B",
			deliverables: [{ key: "k2", description: "d", evidence: "required" }],
			gateOut: "all_deliverables_have_evidence",
			next: [],
		},
	],
};

interface CorpusRow {
	readonly ap: string;
	readonly title: string;
	readonly detector: string;
	/** Returns true when the mechanism blocks/neutralizes the pattern. */
	readonly exercise: () => boolean;
}

const CORPUS: readonly CorpusRow[] = [
	{
		ap: "AP-02",
		title: "Runaway tool-use loop",
		detector: "supervise.checkStepToolCap (+ instead path)",
		exercise: () => {
			const v = checkStepToolCap({ enabled: true, sameToolLimit: 5, stepToolCap: 3 }, 3);
			return v.blockStep === true && Boolean(v.instead);
		},
	},
	{
		ap: "AP-05",
		title: "Context bloat → cost explosion",
		detector: "tool-surface core-only face (HCOT gates removed §0; mode diff returns with W2 task gate)",
		exercise: () => {
			const lite = selectToolSurface({ mode: "lite" });
			const full = selectToolSurface({ mode: "full" });
			// §0 removed the only gated tools: mitigation now = core-only face (no bloat);
			// W2 task gate restores strict lite < full (recorded in W2-T03).
			return lite.size === CORE_TOOLS.length && full.size === CORE_TOOLS.length;
		},
	},
	{
		ap: "AP-10",
		title: "Confidence inflation on self-verification",
		detector: "compileFinish — basis must be a real Observation (I8)",
		exercise: () => {
			try {
				compileFinish(ws, { finish: true, finishBasisIds: ["self-claimed"] });
				return false;
			} catch (e) {
				return e instanceof CompileError && e.code === "finish_basis_unknown";
			}
		},
	},
	{
		ap: "AP-14",
		title: "Silent retry masking failure",
		detector: "evidence I7 — truncated receipts degrade done → progress",
		exercise: () => {
			const long = "x".repeat(5000);
			const receipts: Receipt[] = [{ seq: 1, stdout: long, stderr: "", exitCode: 0 }];
			const g = groundExcerpt(receipts, long);
			return g.degraded === true && applyOutcomeRules("done", g) === "progress";
		},
	},
	{
		ap: "AP-16",
		title: "MCP server trust boundary collapse",
		detector: "mcp-bridge.planMcpCall — per-call scope + risk ladder",
		exercise: () => {
			const scoped = planMcpCall(spec, { name: "http_get" }, { url: "https://evil.example" });
			const risky = planMcpCall(spec, { name: "ai_generate_payload", risk: "high" }, { x: "y" });
			return scoped.allow === false && risky.allow === false;
		},
	},
	{
		ap: "AP-18",
		title: "Autonomy creep",
		detector: "scope.assertStepPlan — highRisk=deny blocks exploit (P5)",
		exercise: () => {
			const d = assertStepPlan(spec, "exploit", "http://127.0.0.1:18081");
			return d.allow === false && d.reason.includes("high_risk_denied");
		},
	},
	{
		ap: "AP-43",
		title: "Coarse-grained tool authorization",
		detector: "domain/scope per-target matcher + fail-closed",
		exercise: () => {
			const inScope = assertStepPlan(spec, "discover", "http://127.0.0.1:18081");
			const noScope = assertStepPlan(spec, "discover", "http://127.0.0.1:9999");
			return inScope.allow === true && noScope.allow === false;
		},
	},
	{
		ap: "AP-45",
		title: "Absent phase-gate barrier",
		detector: "playbook.canEnterNext (I11) — illegal next denied",
		exercise: () => {
			const bad = canEnterNext(pb, "a", "a", new Set()); // a → a not in next
			const goodNoEvidence = canEnterNext(pb, "a", "b", new Set()); // allowed next, gate not satisfied
			return bad.ok === false && bad.reason.startsWith("not_allowed_next") && goodNoEvidence.ok === false;
		},
	},
];

test("anti-pattern corpus: every mapped mitigation actually blocks (Wave 4)", () => {
	const failures: string[] = [];
	for (const row of CORPUS) {
		let ok = false;
		try {
			ok = row.exercise();
		} catch (e) {
			failures.push(`${row.ap} threw: ${String(e)}`);
			continue;
		}
		if (!ok) failures.push(`${row.ap} (${row.detector}) did not block`);
	}
	assert.deepEqual(failures, [], `corpus rows must block: ${failures.join("; ")}`);
	assert.ok(CORPUS.length >= 8, "corpus covers ≥8 patterns");
});

/*
 * KNOWN GAPS (catalog entries without a dedicated runtime detector — listed
 * honestly rather than papered over):
 * - AP-01 injection via tool output / AP-12 agent-to-agent / AP-41 tool-return
 *   injection: doctrine P9/I18 ("external content is data") — enforcement is
 *   prompt-level today; no per-payload detector.
 * - AP-03 hallucinated tool calls: host validates schemas; we don't re-check.
 * - AP-04 destructive action w/o confirmation: highRisk/SOW covers, no
 *   per-command confirmation oracle.
 * - AP-06 semantic goal drift: GoalVerifier (L4) is aspirational, not built.
 * - AP-08/AP-17/AP-34 memory & RAG poisoning: no memory ingestion in core yet.
 * - AP-21 long-horizon state collapse: partially addressed by run_state (I10
 *   persistence) — lease recovery for stale claims not implemented.
 * - AP-27/31/32/42/44 multi-agent rows: B-path = no subagents (ADR-001), N/A.
 */
