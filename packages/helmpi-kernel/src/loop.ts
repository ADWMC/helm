/** Deterministic Run loop — executor strategies + step settlement. */

import { randomUUID } from "node:crypto";
import { DEFAULT_CONFIG } from "./config.ts";
import { assertDoneHasObservation } from "./domain/completion.ts";
import { applyOutcomeRules, groundExcerpt, observationFromGrounding } from "./domain/evidence.ts";
import type { Receipt, Step } from "./domain/types.ts";
import type { Ledger, ProposeDecision } from "./ledger.ts";
import { applyProposal, parsePropose } from "./propose.ts";
import { reconcileRun } from "./recover.ts";
import { blockIfCapped, type SuperviseConfig } from "./supervise.ts";

export interface ToolExecutor {
	run(step: Step, attempt: number): Promise<Receipt> | Receipt;
}

export interface LoopOptions {
	readonly maxDecisions?: number;
	readonly maxAttemptsPerStep?: number;
	readonly sameKindLimit?: number;
	readonly proposer?: () => ProposeDecision | Promise<ProposeDecision>;
	readonly executor: ToolExecutor;
	/** Playbook gates proposals that carry newStep.phaseId */
	readonly playbook?: import("./playbook.ts").Playbook;
	/** Supervision config; defaults from HELPI config when omitted */
	readonly supervise?: SuperviseConfig;
	/** Token meter for Spec.maxTokens (I10 convergence class). Returns tokens consumed per proposal. */
	readonly estimateTokens?: () => number;
}

export interface LoopResult {
	readonly status: "open" | "completed" | "failed" | "paused" | "stopped" | "running";
	readonly decisions: number;
	readonly message: string;
}

export class FileEchoExecutor implements ToolExecutor {
	private readonly outputs: Map<string, string>;

	constructor(outputs: Map<string, string>) {
		this.outputs = outputs;
	}

	run(step: Step): Receipt {
		const out = this.outputs.get(step.id) ?? this.outputs.get("*") ?? `done_when_probe: ${step.doneWhen}\nOK\n`;
		return { seq: 1, stdout: out, stderr: "", exitCode: 0 };
	}
}

export function emergencyStop(): boolean {
	return process.env.HELPI_RUN === "0";
}

export async function runLoop(ledger: Ledger, opts: LoopOptions): Promise<LoopResult> {
	if (emergencyStop()) {
		ledger.setRunStatus("paused", "HELPI_RUN=0");
		return { status: "paused", decisions: 0, message: "HELPI_RUN=0" };
	}
	const maxDecisions = opts.maxDecisions ?? 20;
	const maxAttempts = opts.maxAttemptsPerStep ?? 2;
	const sameKindLimit = opts.sameKindLimit ?? 5;
	const superviseCfg: SuperviseConfig = opts.supervise ?? {
		enabled: DEFAULT_CONFIG.supervise.enabled,
		sameToolLimit: DEFAULT_CONFIG.supervise.sameToolLimit,
		stepToolCap: DEFAULT_CONFIG.supervise.stepToolCap,
	};
	if (ledger.runStatus() === "open") {
		ledger.setRunStatus("running");
	}
	if (ledger.runStatus() !== "running" && ledger.runStatus() !== "paused") {
		return {
			status: ledger.runStatus(),
			decisions: 0,
			message: `run is ${ledger.runStatus()}`,
		};
	}
	if (ledger.runStatus() === "paused") {
		ledger.setRunStatus("running");
	}

	// Reconcile re-entry (auditable restart) then hydrate the persisted
	// convergence budget — I10 must survive process restarts.
	reconcileRun(ledger);
	const persisted = ledger.hydrateRunState();
	const kindStreak = persisted.kindStreak;
	let decisions = persisted.decisionsUsed;
	let tokensUsed = persisted.tokensUsed;

	while (decisions < maxDecisions) {
		const status = ledger.runStatus();
		if (status !== "running") {
			return { status, decisions, message: `status=${status}` };
		}

		// Drive active step if any
		const active = ledger.steps().find((s) => s.status === "active");
		if (active) {
			const prevKindCount = kindStreak.get(active.kind) ?? 0;
			let settled = false;
			for (let attempt = 1; attempt <= maxAttempts && !settled; attempt++) {
				const receipt = await opts.executor.run(active, attempt);
				ledger.recordReceipt(receipt); // W2-T06: persist for finish grounding
				// Supervise: attempt count as step tool-call proxy (P1)
				if (blockIfCapped(ledger, superviseCfg, active.id, attempt)) {
					settled = true;
					continue;
				}
				// Grounding source: prefer doneWhen exact slice in receipt (I5).
				const grounded = groundExcerpt([receipt], active.doneWhen);
				const attemptId = randomUUID();
				const outcome = applyOutcomeRules(grounded.ok ? "done" : "progress", grounded);
				if (outcome === "done") {
					const finalObs = observationFromGrounding(
						grounded,
						active.id,
						attemptId,
						ledger.revision(),
						`obs-${active.id}-${attemptId}`,
					);
					if (!finalObs) {
						ledger.addDiagnostic("evidence", `missing obs for ${active.id}`);
						if (attempt >= maxAttempts) {
							ledger.setStepStatus(active.id, "blocked");
							settled = true;
						}
						continue;
					}
					ledger.addObservation(finalObs);
					ledger.setStepStatus(active.id, "done");
					assertDoneHasObservation(active.id, ledger.observations());
					kindStreak.set(active.kind, prevKindCount + 1);
					ledger.saveRunState(kindStreak, decisions);
					settled = true;
				} else if (attempt >= maxAttempts) {
					ledger.setStepStatus(active.id, "blocked");
					ledger.addDiagnostic("stuck", active.id);
					settled = true;
				}
			}
			continue;
		}

		// Propose
		decisions += 1;
		if (opts.estimateTokens) tokensUsed += opts.estimateTokens();
		ledger.saveRunState(kindStreak, decisions, tokensUsed);
		// I10-class budget: Spec.maxTokens exhausted → failed, never pseudo-completed.
		let specMax: number | null = null;
		try {
			specMax = ledger.spec().maxTokens ?? null;
		} catch {
			/* no spec set — budget not applicable */
		}
		if (specMax !== null && tokensUsed >= specMax) {
			ledger.addDiagnostic("convergence", `token_budget ${tokensUsed}>=${specMax}`);
			ledger.setRunStatus("failed", "token_budget");
			return {
				status: "failed",
				decisions,
				message: "token_budget_exhausted",
			};
		}
		const _view = ledger.proposeView();
		const decision = opts.proposer
			? await opts.proposer()
			: parsePropose({
					finish: false,
					summary: "auto: no proposer configured",
				});

		if (decision.finish) {
			applyProposal(ledger, decision, {
				...(opts.playbook ? { playbook: opts.playbook } : {}),
			});
			return {
				status: ledger.runStatus(),
				decisions,
				message: decision.summary,
			};
		}

		if (decision.newStep) {
			const streak = kindStreak.get(decision.newStep.kind) ?? 0;
			if (streak >= sameKindLimit) {
				ledger.addDiagnostic("convergence", `same kind ${decision.newStep.kind} hit limit ${sameKindLimit}`);
				ledger.setRunStatus("failed", "convergence");
				return {
					status: "failed",
					decisions,
					message: "convergence_exhausted",
				};
			}
		}

		try {
			applyProposal(ledger, decision, {
				...(opts.playbook ? { playbook: opts.playbook } : {}),
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			ledger.addDiagnostic("propose_rejected", msg);
			ledger.setRunStatus("failed", msg);
			return { status: "failed", decisions, message: msg };
		}

		if (!decision.nextStepId && !decision.newStep) {
			ledger.setRunStatus("failed", "idle_proposal");
			return {
				status: "failed",
				decisions,
				message: "no next step and no finish",
			};
		}
	}

	ledger.setRunStatus("failed", "decision_limit");
	return {
		status: "failed",
		decisions,
		message: `decision_limit=${maxDecisions}`,
	};
}
