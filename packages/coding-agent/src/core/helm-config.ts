/**
 * Global `.helm/config.json` writer (agentDir/config.json) for the TUI
 * `/settings` helm rows: efficiency (SoL-Pi mechanisms) and defense (G4 knobs).
 *
 * Read side mirrors the kernel tier (helmpi-kernel/config-store.ts):
 * global file under project `.helm/config.json` overrides, per field.
 * Writes always land in the GLOBAL file so the project file stays the
 * deliberate override layer. Other top-level keys are preserved.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "../config.ts";

export type HelmConfigSection = "efficiency" | "defense";

function globalConfigPath(): string {
	return join(getAgentDir(), "config.json");
}

function readJson(file: string): Record<string, unknown> {
	try {
		if (!existsSync(file)) return {};
		const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
		return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function sectionOf(cfg: Record<string, unknown>, section: HelmConfigSection): Record<string, unknown> {
	const s = cfg[section];
	return s && typeof s === "object" && !Array.isArray(s) ? (s as Record<string, unknown>) : {};
}

/** Merged view (global under project overrides) — what the TUI displays. */
export function mergedHelmSection(section: HelmConfigSection, cwd: string = process.cwd()): Record<string, unknown> {
	return {
		...sectionOf(readJson(globalConfigPath()), section),
		...sectionOf(readJson(join(cwd, ".helm", "config.json")), section),
	};
}

/** Merge a patch into the GLOBAL section; preserves every other key/file content. */
export function writeGlobalHelmSection(section: HelmConfigSection, patch: Record<string, unknown>): void {
	const file = globalConfigPath();
	const cfg = readJson(file);
	cfg[section] = { ...sectionOf(cfg, section), ...patch };
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(cfg, null, "\t")}\n`, "utf8");
}
