/** Report export — structural completion summary from ledger. */

import { classifyEvidence } from "./domain/evidence.ts";
import type { Workspace } from "./domain/types.ts";
import type { Ledger } from "./ledger.ts";

/**
 * Findings = task-layer recorded conclusions (claims role `fact`).
 * Exit code follows strix semantics: 0 = clean/no findings · 2 = findings present.
 */
export function reportFindings(ws: Workspace): number {
	return ws.claims.filter((c) => c.role === "fact").length;
}

export function reportExitCode(findings: number): number {
	return findings > 0 ? 2 : 0;
}

/** Structured twin of the markdown report (md + json dual deliverables). */
export function exportReportJson(ledger: Ledger): Record<string, unknown> {
	const ws = ledger.workspace();
	const statuses = ws.observations.map((o) => classifyEvidence(o.excerpt));
	const count = (s: string) => statuses.filter((x) => x.status === s).length;
	return {
		schema: "helm-pi-report/1",
		generatedAt: new Date().toISOString(),
		run: {
			status: ws.runStatus,
			revision: ws.revision,
			goal: ws.spec.goal,
			allowedTargets: ws.spec.allowedTargets,
			highRisk: ws.spec.highRisk,
		},
		findings: reportFindings(ws),
		evidence_status: {
			exploited: count("exploited"),
			confirmed: count("confirmed"),
			unconfirmed: count("unconfirmed"),
		},
		steps: ws.steps.map((s) => ({
			id: s.id,
			kind: s.kind,
			status: s.status,
			target: s.target,
		})),
		observations: ws.observations.map((o) => {
			const c = classifyEvidence(o.excerpt);
			return {
				id: o.id,
				stepId: o.stepId,
				receiptSeq: o.receiptSeq,
				status: c.status,
				hits: c.hits,
			};
		}),
		coverage: {
			requireCoverage: ws.spec.requireCoverage === true,
			waived: ws.coverageWaived === true,
			entries: ws.coverage ?? [],
		},
		// Diagnostics are NOT evidence (I6) — surfaced for operators, never as basis.
		diagnostics: ledger.diagnostics(20),
		claims: ws.claims,
		directions: ws.directions,
		hints: ws.hints,
		deliverability: {
			structural_finish: ws.runStatus === "completed" ? "recorded in journal" : "not completed",
			semantic_goal: "unproven — needs GoalVerifier (L4)",
		},
	};
}

export function exportReport(ledger: Ledger): string {
	const ws = ledger.workspace();
	const findings = ws.observations.slice(0, 20);
	const statuses = ws.observations.map((o) => classifyEvidence(o.excerpt).status);
	const count = (s: string) => statuses.filter((x) => x === s).length;
	const lines: string[] = [
		"# helm-pi Run Report",
		"",
		`## Spec`,
		`- Goal: ${ws.spec.goal || "(unset)"}`,
		`- Allowed targets: ${ws.spec.allowedTargets.join(", ") || "(none)"}`,
		`- Run status: **${ws.runStatus}** (structural; semantic needs GoalVerifier)`,
		`- Revision: ${ws.revision}`,
		"",
		`## Steps`,
		...(ws.steps.length === 0
			? ["_(none)_"]
			: ws.steps.map((s) => `- [${s.status}] \`${s.id}\` (${s.kind}) target=${s.target} — ${s.objective}`)),
		"",
		`## Evidence status (Dark-Moon ladder)`,
		`- ${count("exploited")} exploited · ${count("confirmed")} confirmed · ${count("unconfirmed")} unconfirmed (of ${ws.observations.length} observations)`,
		`- UNCONFIRMED means "grounded but impact not demonstrated" — still reported, never dropped (I18/I6).`,
		"",
		`## Observations (evidence candidates)`,
		...(findings.length === 0
			? ["_(none)_"]
			: findings.map((o) => {
					const c = classifyEvidence(o.excerpt);
					const hit = c.hits.length > 0 ? ` hits=${c.hits.join("+")}` : "";
					return `- \`${o.id}\` step=\`${o.stepId}\` seq=${o.receiptSeq} **${c.status}**${hit}`;
				})),
		"",
		`## Coverage (I19)`,
		`-${ws.spec.requireCoverage ? " requireCoverage: yes" : " requireCoverage: no"}${ws.coverageWaived ? " · waived (journal)" : ""}`,
		...(ws.coverage && ws.coverage.length > 0
			? ws.coverage.map((c) => `- [${c.outcome}] \`${c.surface}\`${c.note ? ` — ${c.note}` : ""}`)
			: ["_(none recorded)_"]),
		"",
		`## Claims`,
		...(ws.claims.length === 0 ? ["_(none)_"] : ws.claims.map((c) => `- [${c.role}] ${c.id}: ${c.description}`)),
		"",
		`## Directions`,
		...(ws.directions.length === 0
			? ["_(none)_"]
			: ws.directions.map((d) => `- [${d.status}] ${d.id}: ${d.description}`)),
		"",
		`## Hints`,
		...(ws.hints.length === 0 ? ["_(none)_"] : ws.hints.map((h) => `- ${h.creator}: ${h.content}`)),
		"",
		`## Journal (last 30)`,
		...ledger
			.journal(0)
			.slice(-30)
			.map((r) => `- r${r.revision} ${r.kind}`),
		"",
		`## Deliverability prefixes`,
		`- Structured finish basis: ${ws.runStatus === "completed" ? "recorded in journal" : "not completed"}`,
		`- Semantic goal: NOT proven by this report — run GoalVerifier / approve_goal`,
		"",
		`## Diagnostics (operator view — NOT evidence, I6)`,
		...(ledger.diagnostics(10).length === 0
			? ["_(none)_"]
			: ledger.diagnostics(10).map((d) => `- [${d.kind}] ${d.message}`)),
		"",
	];
	return lines.join("\n");
}
