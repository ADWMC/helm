/**
 * helm-config helper (TUI `/settings` helm rows):
 *  1) merged view = global under project overrides (mirrors kernel config-store)
 *  2) write lands in the GLOBAL file and preserves every other key
 *  3) project file is never written by the TUI path (stays the override layer)
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mergedHelmSection, writeGlobalHelmSection } from "../src/core/helm-config.ts";

describe("helm-config global writer", () => {
	const root = join(process.cwd(), "test-helm-config-tmp");
	const agentDir = join(root, "agent");
	const projectDir = join(root, "project");
	const savedAgentDir = process.env.HELM_CODING_AGENT_DIR;

	beforeEach(() => {
		if (existsSync(root)) rmSync(root, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(projectDir, { recursive: true });
		process.env.HELM_CODING_AGENT_DIR = agentDir;
	});

	afterEach(() => {
		if (savedAgentDir === undefined) delete process.env.HELM_CODING_AGENT_DIR;
		else process.env.HELM_CODING_AGENT_DIR = savedAgentDir;
		if (existsSync(root)) rmSync(root, { recursive: true });
	});

	it("reads the merged view: global under project overrides", () => {
		writeFileSync(
			join(agentDir, "config.json"),
			JSON.stringify({ defense: { watcher: false, watcherEveryTurns: 9 } }),
			"utf8",
		);
		mkdirSync(join(projectDir, ".helm"), { recursive: true });
		writeFileSync(join(projectDir, ".helm", "config.json"), JSON.stringify({ defense: { watcher: true } }), "utf8");
		expect(mergedHelmSection("defense", projectDir)).toEqual({ watcher: true, watcherEveryTurns: 9 });
	});

	it("writes the GLOBAL file, merges into the section, and preserves other keys", () => {
		writeFileSync(join(agentDir, "config.json"), JSON.stringify({ locale: "en", version: 1 }), "utf8");
		writeGlobalHelmSection("defense", { watcher: true });
		const cfg = JSON.parse(readFileSync(join(agentDir, "config.json"), "utf8"));
		expect(cfg).toEqual({ locale: "en", version: 1, defense: { watcher: true } });
		writeGlobalHelmSection("efficiency", { actionFusion: false });
		const cfg2 = JSON.parse(readFileSync(join(agentDir, "config.json"), "utf8"));
		expect(cfg2.defense, "other section untouched").toEqual({ watcher: true });
		expect(cfg2.efficiency).toEqual({ actionFusion: false });
	});

	it("never writes the project file (it stays the deliberate override layer)", () => {
		writeGlobalHelmSection("defense", { watcher: true });
		expect(existsSync(join(projectDir, ".helm", "config.json"))).toBe(false);
	});
});
