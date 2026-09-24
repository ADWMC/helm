/** Completion compiler — I4, I8, I10, kind boundaries. Pure. */

import { groundExcerpt } from "./evidence.ts";
import { assertStepTarget } from "./scope.ts";
import type { Observation, Receipt, Spec, Step, StepKind, Workspace } from "./types.ts";

export type CompileErrorCode =
	| "run_not_active"
	| "stale_revision"
	| "finish_with_open_steps"
	| "finish_without_basis"
	| "finish_basis_unknown"
	| "finish_basis_not_done"
	| "basis_missing_observation"
	| "basis_is_diagnostic"
	| "target_out_of_scope"
	| "test_crosses_exploit"
	| "exploit_requires_test"
	| "convergence_exhausted"
	| "finish_without_coverage"
	| "evidence_not_grounded"
	| "empty_done_when";

export class CompileError extends Error {
	readonly code: CompileErrorCode;
	constructor(code: CompileErrorCode, message: string) {
		super(message);
		this.name = "CompileError";
		this.code = code;
	}
}

const TEST_EXPLOIT_PHRASES = [
	"capture the flag",
	"gain a shell",
	"reverse shell",
	"obtain the flag",
	"read the flag",
	"exfiltrat",
] as const;

export function isHighRiskKind(kind: StepKind): boolean {
	return kind === "exploit" || kind === "respond";
}

export function assertStepShape(spec: Spec, step: Step, target: string): void {
	if (!step.doneWhen.trim()) {
		throw new CompileError("empty_done_when", `step ${step.id} has empty done_when`);
	}
	if (target !== step.target) {
		// caller supplies allowed target separately
	}
	// Single scope authority: same matcher as the proposal-time gate (I13).
	if (!assertStepTarget(spec, step.target).allow) {
		throw new CompileError("target_out_of_scope", `step ${step.id} target out of scope`);
	}
	if (step.kind === "test") {
		const scope = `${step.objective}\n${step.doneWhen}`.toLowerCase();
		for (const p of TEST_EXPLOIT_PHRASES) {
			if (scope.includes(p)) {
				throw new CompileError("test_crosses_exploit", `step ${step.id} TEST crosses exploit`);
			}
		}
	}
}

export interface FinishDecision {
	readonly finish: boolean;
	readonly finishBasisIds: readonly string[];
}

export function compileFinish(ws: Workspace, decision: FinishDecision, receipts?: readonly Receipt[]): void {
	if (ws.runStatus !== "running" && ws.runStatus !== "open" && ws.runStatus !== "paused") {
		if (ws.runStatus === "completed") {
			throw new CompileError("run_not_active", "run already completed");
		}
		throw new CompileError("run_not_active", `run status ${ws.runStatus}`);
	}
	const open = ws.steps.filter((s) => s.status === "proposed" || s.status === "ready" || s.status === "active");
	if (!decision.finish) {
		if (decision.finishBasisIds.length > 0) {
			throw new CompileError("finish_basis_unknown", "finish_basis must be empty while continuing");
		}
		return;
	}
	if (open.length > 0) {
		throw new CompileError("finish_with_open_steps", `open steps: ${open.map((s) => s.id).join(", ")}`);
	}
	if (decision.finishBasisIds.length === 0) {
		throw new CompileError("finish_without_basis", "finish requires basis observations");
	}
	const obsById = new Map(ws.observations.map((o) => [o.id, o]));
	const stepById = new Map(ws.steps.map((s) => [s.id, s]));
	const seen = new Set<string>();
	for (const id of decision.finishBasisIds) {
		if (seen.has(id)) {
			throw new CompileError("finish_basis_unknown", `duplicate basis ${id}`);
		}
		seen.add(id);
		const obs = obsById.get(id);
		if (!obs) {
			throw new CompileError("finish_basis_unknown", `unknown observation ${id}`);
		}
		const step = stepById.get(obs.stepId);
		if (!step || step.status !== "done") {
			throw new CompileError("finish_basis_not_done", `basis ${id} not from done step`);
		}
	}

	// W2-T06 G5: every basis observation must ground as an EXACT slice of its
	// own receipt — paraphrase (not found) and truncation (partial) are rejected;
	// no receipts passed → caller opted out (legacy paths), enforcement runs
	// wherever receipts flow (loop/CLI).
	if (receipts) {
		for (const id of decision.finishBasisIds) {
			const obs = obsById.get(id)!;
			const r = receipts.find((x) => x.seq === obs.receiptSeq);
			if (!r) {
				throw new CompileError("evidence_not_grounded", `basis ${id}: receipt ${obs.receiptSeq} missing`);
			}
			const g = groundExcerpt([r], obs.excerpt);
			if (!g.ok) {
				throw new CompileError("evidence_not_grounded", `basis ${id}: ${g.reason}`);
			}
		}
	}
	// I19: negative-space coverage must be on record (or explicitly waived).
	if (ws.spec.requireCoverage === true) {
		const hasCoverage = (ws.coverage ?? []).length > 0;
		if (!hasCoverage && ws.coverageWaived !== true) {
			throw new CompileError(
				"finish_without_coverage",
				"finish requires >=1 coverage record or a coverage-waived journal (I19)",
			);
		}
	}
}

export function assertDoneHasObservation(stepId: string, observations: readonly Observation[]): void {
	const mine = observations.filter((o) => o.stepId === stepId);
	if (mine.length === 0) {
		throw new CompileError("basis_missing_observation", `done step ${stepId} lacks observation`);
	}
}

export function convergenceBlocked(sameKindStreak: number, limit: number): boolean {
	return limit > 0 && sameKindStreak >= limit;
}

export function convergenceError(): CompileError {
	return new CompileError("convergence_exhausted", "same-kind step budget exhausted");
}
