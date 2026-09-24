/**
 * Parent tool-face slimming (B-path, PLAN §4 step 3).
 *
 * The host has no dynamic tool visibility API (registerTool grep = 0 hits),
 * so narrowing happens at registration time: mode and route-domain filters
 * narrow the face at registration. HCOT gates removed per §0 decision
 * (HCOT 不做进 fork); GATED_TOOLS stays as the mechanism for W2 (task tool).
 * Pure — the adapter decides what to pass in.
 */

import type { AnalysisMode } from "./config.ts";

/** Session core — always registered. */
export const CORE_TOOLS = [
	"helmpi_validate_scope",
	"helmpi_status",
	"helmpi_mode",
	"tool_memory",
	"route_task",
	"normalize_input",
	"begin_case",
	"case_status",
	"save_evidence",
	"record_finding",
	"read_reference",
	"skill_index",
	"helmpi_phase",
] as const;

export interface ToolGate {
	/** Modes in which this tool may appear. */
	readonly modes: readonly AnalysisMode[];
	/** Restrict to these route domains; absent = all domains. */
	readonly domains?: readonly string[];
}

/** Mode/env/domain-gated tools (schema reduction target). Empty after HCOT removal; W2 adds task gate. */
export const GATED_TOOLS: Readonly<Record<string, ToolGate>> = {};

export interface ToolSurfaceOpts {
	readonly mode: AnalysisMode;
	/** Route domain (route_task hit); omit for the full mode face. */
	readonly domain?: string | null;
}

export function selectToolSurface(opts: ToolSurfaceOpts): Set<string> {
	const face = new Set<string>(CORE_TOOLS);
	for (const [name, gate] of Object.entries(GATED_TOOLS)) {
		if (!gate.modes.includes(opts.mode)) continue;
		if (
			opts.domain !== undefined &&
			opts.domain !== null &&
			gate.domains !== undefined &&
			!gate.domains.includes(opts.domain)
		) {
			continue;
		}
		face.add(name);
	}
	return face;
}
