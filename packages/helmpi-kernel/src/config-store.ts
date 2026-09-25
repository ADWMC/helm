/**
 * Global + project tier for `.helm/config.json` (user directive 2026-09:
 * TUI-managed helm settings live next to the upstream settings.json).
 *
 * - Global file: <agentDir>/config.json, agentDir = HELM_CODING_AGENT_DIR ?? ~/.helm
 * - Project file: <cwd>/.helm/config.json
 * Merge is SECTION-level spread with FIELD-level override: project fields win,
 * everything else falls through to the global file, missing/invalid files are
 * skipped (defensive read, same posture as the previous project-only reads).
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type HelmConfigSection = "efficiency" | "defense";

/** Agent dir shared with the coding-agent settings layer (HELM_CODING_AGENT_DIR). */
export function helmAgentDir(): string {
	return process.env.HELM_CODING_AGENT_DIR ?? join(homedir(), ".helm");
}

function readSection(file: string, section: HelmConfigSection): Record<string, unknown> {
	try {
		const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
		const s = raw[section];
		return s && typeof s === "object" && !Array.isArray(s) ? (s as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/** Global section merged under project overrides (project wins per field). */
export function readMergedSection(cwd: string, section: HelmConfigSection): Record<string, unknown> {
	return {
		...readSection(join(helmAgentDir(), "config.json"), section),
		...readSection(join(cwd, ".helm", "config.json"), section),
	};
}
