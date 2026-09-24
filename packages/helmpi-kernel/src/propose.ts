/** Propose schema validation + plan compile — P2 / I3. */

import { assertStepShape, CompileError, compileFinish, type FinishDecision } from "./domain/completion.ts";
import { assertStepPlan } from "./domain/scope.ts";
import type { Receipt, Step, StepKind } from "./domain/types.ts";
import type { Ledger, ProposeDecision, ProposeView } from "./ledger.ts";
import { assertPhaseForStep } from "./phase.ts";

const KINDS: ReadonlySet<string> = new Set([
	"discover",
	"enumerate",
	"test",
	"exploit",
	"verify",
	"recover",
	"reverse",
	"harden",
	"respond",
	"report",
]);

export function parsePropose(raw: unknown): ProposeDecision {
	if (typeof raw !== "object" || raw === null) {
		throw new CompileError("stale_revision", "proposal must be object");
	}
	const o = raw as Record<string, unknown>;
	if (typeof o.summary !== "string" || !o.summary.trim()) {
		throw new CompileError("stale_revision", "summary required");
	}
	if (o.summary.length > 2000) {
		throw new CompileError("stale_revision", "summary too long");
	}
	if (o.finish === true) {
		const ids = o.finishBasisIds;
		if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
			throw new CompileError("finish_without_basis", "finishBasisIds required");
		}
		return {
			finish: true,
			summary: o.summary,
			finishBasisIds: ids as string[],
		};
	}
	if (o.finish !== false) {
		throw new CompileError("stale_revision", "finish must be boolean");
	}
	if (o.finishBasisIds !== undefined && o.finishBasisIds !== null) {
		throw new CompileError("finish_basis_unknown", "finishBasisIds only when finish");
	}
	const decision: {
		finish: false;
		summary: string;
		newStep?: ProposeDecision extends { finish: false } ? never : never;
		nextStepId?: string;
	} & Record<string, unknown> = {
		finish: false as const,
		summary: o.summary,
	};
	if (o.nextStepId !== undefined && o.nextStepId !== null) {
		if (typeof o.nextStepId !== "string") {
			throw new CompileError("stale_revision", "nextStepId must be string");
		}
		decision.nextStepId = o.nextStepId;
	}
	if (o.newStep !== undefined && o.newStep !== null) {
		const ns = o.newStep as Record<string, unknown>;
		if (typeof ns.id !== "string" || !ns.id) {
			throw new CompileError("stale_revision", "newStep.id required");
		}
		if (typeof ns.kind !== "string" || !KINDS.has(ns.kind)) {
			throw new CompileError("stale_revision", "newStep.kind invalid");
		}
		if (typeof ns.target !== "string") {
			throw new CompileError("stale_revision", "newStep.target required");
		}
		if (typeof ns.objective !== "string" || !ns.objective.trim()) {
			throw new CompileError("stale_revision", "newStep.objective required");
		}
		if (typeof ns.doneWhen !== "string" || !ns.doneWhen.trim()) {
			throw new CompileError("empty_done_when", "newStep.doneWhen required");
		}
		const basisIds = Array.isArray(ns.basisIds) ? (ns.basisIds as unknown[]).map(String) : [];
		const dependsOn = Array.isArray(ns.dependsOn) ? (ns.dependsOn as unknown[]).map(String) : [];
		const phaseId = typeof ns.phaseId === "string" && ns.phaseId ? ns.phaseId : undefined;
		decision.newStep = {
			id: ns.id,
			kind: ns.kind as StepKind,
			target: ns.target,
			objective: ns.objective,
			doneWhen: ns.doneWhen,
			basisIds,
			dependsOn,
			...(phaseId ? { phaseId } : {}),
		} as never;
		if (decision.nextStepId !== ns.id) {
			// new step must be selected immediately (one-task policy)
			decision.nextStepId = ns.id;
		}
	}
	return decision as unknown as ProposeDecision;
}

export function compileProposal(
	ws: ReturnType<Ledger["workspace"]>,
	decision: ProposeDecision,
	opts: { approvedHighRisk?: boolean; receipts?: readonly Receipt[] } = {},
): void {
	if (decision.finish) {
		const finish: FinishDecision = {
			finish: true,
			finishBasisIds: decision.finishBasisIds,
		};
		compileFinish(ws, finish, opts.receipts);
		return;
	}
	const spec = ws.spec;
	const newStep = "newStep" in decision && decision.newStep ? decision.newStep : undefined;
	const nextStepId = "nextStepId" in decision && decision.nextStepId ? decision.nextStepId : undefined;
	if (newStep) {
		const step: Step = {
			id: newStep.id,
			kind: newStep.kind,
			target: newStep.target,
			objective: newStep.objective,
			doneWhen: newStep.doneWhen,
			basisIds: newStep.basisIds ?? [],
			dependsOn: newStep.dependsOn ?? [],
			status: "ready",
			createdRevision: ws.revision,
		};
		assertStepShape(spec, step, step.target);
		const planOpts = opts.approvedHighRisk === undefined ? {} : { approvedHighRisk: opts.approvedHighRisk };
		const sc = assertStepPlan(spec, step.kind, step.target, planOpts);
		if (!sc.allow) {
			throw new CompileError("target_out_of_scope", sc.reason);
		}
		if (ws.steps.some((s) => s.id === step.id)) {
			throw new CompileError("stale_revision", `duplicate step ${step.id}`);
		}
	}
	if (nextStepId) {
		const existing = ws.steps.find((s) => s.id === nextStepId);
		const isNew = newStep?.id === nextStepId;
		if (!existing && !isNew) {
			throw new CompileError("stale_revision", `unknown next step ${nextStepId}`);
		}
		if (existing && existing.status !== "ready" && existing.status !== "proposed") {
			throw new CompileError("stale_revision", `next step not ready: ${existing.status}`);
		}
		const active = ws.steps.filter((s) => s.status === "active");
		if (active.length > 0) {
			throw new CompileError("stale_revision", "cannot lease another step while one active");
		}
	}
	if (newStep) {
		for (const dep of newStep.dependsOn ?? []) {
			const d = ws.steps.find((s) => s.id === dep);
			if (!d || d.status !== "done") {
				throw new CompileError("stale_revision", `unfinished dependency ${dep}`);
			}
		}
	}
}

export function applyProposal(
	ledger: Ledger,
	decision: ProposeDecision,
	opts: { approvedHighRisk?: boolean; playbook?: import("./playbook.ts").Playbook } = {},
): void {
	const ws = ledger.workspace();
	const newStep = "newStep" in decision && decision.newStep ? decision.newStep : undefined;
	const approved = newStep
		? ledger.isApproved("step", newStep.id) || ws.spec.highRisk !== "hitl" || newStep.kind !== "exploit"
		: true;
	try {
		compileProposal(ws, decision, { approvedHighRisk: approved === true, receipts: ledger.receipts() });
	} catch (e) {
		// I14: scope denials are first-class journal events (deny + audit trail).
		if (e instanceof CompileError && e.code === "target_out_of_scope") {
			const ns0 = "newStep" in decision && decision.newStep ? decision.newStep : undefined;
			ledger.journalEvent("scope_denied", {
				stepId: ns0?.id ?? null,
				kind: ns0?.kind ?? null,
				target: ns0?.target ?? null,
				reason: e.message,
				at: Date.now(),
			});
		}
		throw e;
	}

	if (decision.finish) {
		ledger.setRunStatus("completed", decision.summary);
		ledger.addDiagnostic("finish", decision.summary);
		return;
	}

	const ns = "newStep" in decision && decision.newStep ? decision.newStep : undefined;
	if (ns) {
		// P0-1: hard phase gate before the step is admitted
		if (ns.phaseId) {
			if (!opts.playbook) {
				throw new CompileError("stale_revision", "newStep.phaseId requires opts.playbook");
			}
			// dynamic import avoided — phase is loaded statically below
			assertPhaseForStep(ledger, opts.playbook, ns.phaseId);
		}
		ledger.addStep({
			id: ns.id,
			kind: ns.kind,
			target: ns.target,
			objective: ns.objective,
			doneWhen: ns.doneWhen,
			basisIds: ns.basisIds ?? [],
			dependsOn: ns.dependsOn ?? [],
			status: "ready",
			createdRevision: ledger.revision(),
		});
	}

	const nextId = "nextStepId" in decision && decision.nextStepId ? decision.nextStepId : undefined;
	if (nextId) {
		const steps = ledger.steps();
		const target = steps.find((s) => s.id === nextId);
		if (target && (target.status === "ready" || target.status === "proposed")) {
			ledger.setStepStatus(target.id, "active");
		}
	}
	ledger.addDiagnostic("propose", decision.summary);
}

export function proposeFromView(
	view: ProposeView,
	strategy: "first_ready" | "finish_if_no_open" = "first_ready",
): ProposeDecision {
	if (view.runStatus === "completed" || view.runStatus === "failed" || view.runStatus === "stopped") {
		throw new CompileError("run_not_active", view.runStatus);
	}
	const open = view.openSteps;
	if (open.length > 0) {
		const active = open.find((s) => s.status === "active");
		const ready = open.find((s) => s.status === "ready" || s.status === "proposed");
		const next = active ?? ready;
		if (next) {
			return {
				finish: false,
				summary: `Continue step ${next.id}`,
				...(next.status !== "active" ? { nextStepId: next.id } : {}),
			};
		}
	}
	if (strategy === "finish_if_no_open" && view.recentClosedSteps.some((s) => s.status === "done")) {
		const obs = view.observationIds;
		if (obs.length > 0) {
			return {
				finish: true,
				summary: "No open steps; citing existing observations for structural finish.",
				finishBasisIds: [obs[obs.length - 1]!],
			};
		}
	}
	return {
		finish: false,
		summary: "No open work — caller must supply newStep.",
	};
}
