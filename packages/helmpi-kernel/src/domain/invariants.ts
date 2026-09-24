/** I1–I18 check helpers for tests and runtime pre-commit asserts. */

import { CompileError, compileFinish, type FinishDecision } from "./completion.ts";
import { assertStepPlan, assertStepTarget } from "./scope.ts";
import type { Workspace } from "./types.ts";

export function assertRevisionContiguous(revisions: readonly number[], expectedStart = 0): void {
	const sorted = [...revisions].sort((a, b) => a - b);
	for (let i = 0; i < sorted.length; i++) {
		const want = expectedStart + i;
		if (sorted[i] !== want) {
			throw new CompileError("stale_revision", `expected revision ${want}, got ${sorted[i]}`);
		}
	}
}

export function assertSingleActiveStep(ws: Workspace): void {
	const active = ws.steps.filter((s) => s.status === "active");
	if (active.length > 1) {
		throw new CompileError("stale_revision", "multiple active steps");
	}
}

export function assertScopeForSteps(ws: Workspace, approvedHighRisk = false): void {
	for (const step of ws.steps) {
		if (step.status === "proposed" || step.status === "ready") {
			const d = assertStepPlan(ws.spec, step.kind, step.target, { approvedHighRisk });
			if (!d.allow) {
				throw new CompileError("target_out_of_scope", d.reason);
			}
		}
	}
}

export function assertFinish(ws: Workspace, decision: FinishDecision): void {
	compileFinish(ws, decision);
}

export { assertStepTarget, assertStepPlan };
