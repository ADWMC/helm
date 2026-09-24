/** Optional supervision — I10. Does not write business completion. */

import type { Ledger } from "./ledger.ts";

export interface SuperviseConfig {
	readonly enabled: boolean;
	readonly sameToolLimit: number;
	readonly stepToolCap: number;
}

export interface SuperviseVerdict {
	readonly injectDiagnostic: boolean;
	readonly blockStep: boolean;
	readonly reason?: string;
	/** What to do instead of the blocked pattern (Dark-Moon guard shape). */
	readonly instead?: string;
}

export function checkSameTool(cfg: SuperviseConfig, sameToolCount: number): SuperviseVerdict {
	if (!cfg.enabled) return { injectDiagnostic: false, blockStep: false };
	if (sameToolCount >= cfg.sameToolLimit) {
		return {
			injectDiagnostic: true,
			blockStep: false,
			reason: `same_tool_limit:${sameToolCount}>=${cfg.sameToolLimit}`,
		};
	}
	return { injectDiagnostic: false, blockStep: false };
}

export function checkStepToolCap(cfg: SuperviseConfig, toolCalls: number): SuperviseVerdict {
	if (!cfg.enabled) return { injectDiagnostic: false, blockStep: false };
	if (toolCalls >= cfg.stepToolCap) {
		return {
			injectDiagnostic: true,
			blockStep: true,
			reason: `step_tool_cap:${toolCalls}>=${cfg.stepToolCap}`,
			instead:
				"switch approach or settle the step with grounded evidence; " +
				"repeating this tool will not advance state",
		};
	}
	return { injectDiagnostic: false, blockStep: false };
}

export function injectIfRepeated(ledger: Ledger, cfg: SuperviseConfig, fingerprint: string, count: number): void {
	const v = checkSameTool(cfg, count);
	if (v.injectDiagnostic && v.reason) {
		ledger.addDiagnostic("supervise", `${fingerprint} ${v.reason}`);
	}
}

export function blockIfCapped(ledger: Ledger, cfg: SuperviseConfig, stepId: string, toolCalls: number): boolean {
	const v = checkStepToolCap(cfg, toolCalls);
	if (v.blockStep) {
		ledger.addDiagnostic(
			"supervise",
			v.instead ? `${stepId} ${v.reason} → instead: ${v.instead}` : `${stepId} ${v.reason}`,
		);
		ledger.setStepStatus(stepId, "blocked");
		return true;
	}
	if (v.injectDiagnostic && v.reason) {
		ledger.addDiagnostic("supervise", `${stepId} ${v.reason}`);
	}
	return false;
}
