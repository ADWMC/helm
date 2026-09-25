/**
 * Helm default-ON wrapper around the vendored SoL-Pi mechanisms (W1-T04).
 *
 * Decision (PLAN §0): built-in SoL-Pi ships DEFAULT ON — this flips the
 * upstream opt-in default (their DEFAULT_CONFIG is all-false) at OUR layer
 * only; the vendored code stays byte-faithful so their suite stays green.
 * Per-mechanism opt-out lives in `.helm/config.json` → `efficiency.*`
 * (config separation: their sol-pi.json is not read by the builtin path).
 */

import type { ExtensionFactory } from "@adwmc/helm-coding-agent";
import { readMergedSection } from "../config-store.ts";
import { DEFAULT_CONFIG, type SolPiConfig } from "./sol-pi/config.ts";
import { createSolPiExtension } from "./sol-pi/index.ts";

export interface EfficiencySwitches {
	readonly actionFusion?: boolean;
	readonly observationPack?: boolean;
	readonly evidencePreservingReducer?: boolean;
	readonly onlineContextCompact?: boolean;
	readonly reducerModel?: string;
	readonly reducerProvider?: string;
	readonly cacheWriteReadRatio?: number;
}

/** Defensive read: missing/invalid files → {} → all defaults (ON). Global tier under project override. */
export function readHelmEfficiency(cwd: string): EfficiencySwitches {
	return readMergedSection(cwd, "efficiency") as EfficiencySwitches;
}

/** Upstream defaults (false) overridden by helm decision: each key defaults ON. */
export function resolveSolPiConfig(sw: EfficiencySwitches = {}): SolPiConfig {
	return {
		...DEFAULT_CONFIG,
		actionFusion: sw.actionFusion ?? true,
		observationPack: sw.observationPack ?? true,
		evidencePreservingReducer: sw.evidencePreservingReducer ?? true,
		onlineContextCompact: sw.onlineContextCompact ?? true,
		...(sw.reducerModel ? { evidencePreservingReducerModel: sw.reducerModel } : {}),
		...(sw.reducerProvider ? { evidencePreservingReducerProvider: sw.reducerProvider } : {}),
		...(sw.cacheWriteReadRatio !== undefined ? { cacheWriteReadRatio: sw.cacheWriteReadRatio } : {}),
	};
}

export function createEfficiencyExtension(sw?: EfficiencySwitches, cwd?: string): ExtensionFactory {
	return createSolPiExtension(() => resolveSolPiConfig(sw ?? readHelmEfficiency(cwd ?? process.cwd())));
}
