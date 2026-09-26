/** Report export — structural completion summary from ledger. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
		evidenceAudit: buildEvidenceAudit(ledger, ws),
		engagement: buildEngagement(ws),
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

/** W3-T05: engagement metadata — RoE summary + ATT&CK coverage from playbook attack field (EN keys only). */
function buildEngagement(ws: Workspace): Record<string, unknown> {
	const spec = ws.spec as {
		goal?: string;
		allowedTargets?: string[];
		outOfScope?: string[];
		highRisk?: string;
		playbookId?: string;
		maxTokens?: number;
	};
	let techniques: string[] = [];
	if (spec.playbookId) {
		try {
			const path = join(
				dirname(fileURLToPath(import.meta.url)),
				"references",
				"playbooks",
				`${spec.playbookId}.yaml`,
			);
			const text = readFileSync(path, "utf8");
			const m = /^attack:\s*\[([^\]]*)\]/m.exec(text);
			if (m)
				techniques = (m[1] ?? "")
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
		} catch {
			techniques = [];
		}
	}
	return {
		roe: {
			allowedTargets: spec.allowedTargets ?? [],
			outOfScope: spec.outOfScope ?? [],
			highRisk: spec.highRisk ?? "deny",
			maxBudgetTokens: spec.maxTokens ?? null,
		},
		attack: {
			playbook: spec.playbookId ?? null,
			techniques,
			techniqueCount: techniques.length,
			source: "playbook attack field (mapped against findings manually until W4 targetKind)",
		},
	};
}
/** W3-T01 信息面敌意假设 (§2.7 #11c): acquisition vs utilization — 没查≠查了不会; 诊断集获取不可协商. */
function buildEvidenceAudit(ledger: Ledger, ws: Workspace): Record<string, unknown> {
	let eviSkips = 0;
	try {
		eviSkips = ledger.journal().filter((r) => r.kind === "evi_skip").length;
	} catch {
		eviSkips = 0;
	}
	const claimsWithBasis = ws.claims.filter((c) => Array.isArray(c.evidenceRefs) && c.evidenceRefs.length > 0).length;
	return {
		acquisition: ws.observations.length,
		utilization: claimsWithBasis,
		unsourcedOmissionJournals: eviSkips,
		note: "acquisition vs utilization: a no-check is not a cannot-use; diagnostic-set acquisition is non-negotiable",
	};
}

export function exportReport(ledger: Ledger): string {
	const ws = ledger.workspace();
	const findings = ws.observations.slice(0, 20);
	const statuses = ws.observations.map((o) => classifyEvidence(o.excerpt).status);
	const count = (s: string) => statuses.filter((x) => x === s).length;
	const eng = buildEngagement(ws);
	const auditRow = buildEvidenceAudit(ledger, ws);
	const roe = eng.roe as { highRisk?: string; outOfScope?: string[] };
	const atk = eng.attack as { playbook?: string | null; techniques?: string[] };

	const lines: string[] = [
		"# helm-pi Run Report",
		"",
		`## Spec`,
		`- Goal: ${ws.spec.goal || "(unset)"}`,
		`- Allowed targets: ${ws.spec.allowedTargets.join(", ") || "(none)"}`,
		`- Run status: **${ws.runStatus}** (structural; semantic needs GoalVerifier)`,
		`- Revision: ${ws.revision}`,
		"",
		`## Engagement (RoE + ATT&CK)`,
		`- RoE highRisk: ${roe.highRisk ?? "deny"}${roe.outOfScope?.length ? `; outOfScope: ${roe.outOfScope.join(", ")}` : ""}`,
		`- ATT&CK (${atk.playbook ?? "no playbook"}): ${atk.techniques?.join(", ") || "(none mapped)"}`,
		`- Evidence audit: acquisition=${String(auditRow.acquisition)}, utilization=${String(auditRow.utilization)} — ${String(auditRow.note)}`,
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

/** W5-T04: SARIF 2.1.0 twin of the report (findings -> results; §7.3#7 parse gate). */
export function exportSarif(ledger: Ledger): Record<string, unknown> {
	const ws = ledger.workspace();
	const results = ws.claims
		.filter((c) => c.role === "fact")
		.map((c) => ({
			ruleId: "helm/finding",
			level: "error",
			message: { text: c.description },
			partialFingerprints: { helmClaimId: c.id },
			properties: { evidenceRefs: c.evidenceRefs ?? [] },
		}));
	return {
		version: "2.1.0",
		$schema: "https://json.schemastore.org/sarif-2.1.0.json",
		runs: [
			{
				tool: {
					driver: {
						name: "helm",
						informationUri: "https://github.com/ADWMC/helm",
						rules: [
							{
								id: "helm/finding",
								shortDescription: { text: "Verified finding (claim role=fact)" },
								defaultConfiguration: { level: "error" },
							},
						],
					},
				},
				results,
			},
		],
	};
}
