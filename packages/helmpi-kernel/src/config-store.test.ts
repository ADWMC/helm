/**
 * config-store (user directive 2026-09: TUI-managed helm settings):
 *  1) global tier (<agentDir>/config.json) is read when the project has no file
 *  2) project wins PER FIELD, other fields fall through to the global tier
 *  3) invalid JSON in either tier never throws (defensive read)
 *  4) readDefenseConfig / readHelmEfficiency ride the same merged tier
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { readMergedSection } from "./config-store.ts";
import { readHelmEfficiency } from "./efficiency/index.ts";
import { readDefenseConfig } from "./g4-live.ts";

function writeJson(file: string, value: unknown): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(value), "utf8");
}

function withTiers(fn: (agentDir: string, project: string) => void): void {
	const agentDir = mkdtempSync(join(tmpdir(), "helm-cfg-agent-"));
	const project = mkdtempSync(join(tmpdir(), "helm-cfg-proj-"));
	const saved = process.env.HELM_CODING_AGENT_DIR;
	process.env.HELM_CODING_AGENT_DIR = agentDir;
	try {
		fn(agentDir, project);
	} finally {
		if (saved === undefined) delete process.env.HELM_CODING_AGENT_DIR;
		else process.env.HELM_CODING_AGENT_DIR = saved;
		for (const d of [agentDir, project]) {
			if (existsSync(d)) {
				try {
					rmSync(d, { recursive: true, force: true });
				} catch {
					/* ignore */
				}
			}
		}
	}
}

test("config-store: global tier applies when the project has no .helm/config.json", () => {
	withTiers((agentDir, project) => {
		writeJson(join(agentDir, "config.json"), { defense: { watcher: true, watcherEveryTurns: 7 } });
		const merged = readMergedSection(project, "defense");
		assert.equal(merged.watcher, true, "global watcher reaches the merge");
		assert.equal(merged.watcherEveryTurns, 7, "global cadence reaches the merge");
	});
});

test("config-store: project wins per field, other fields fall through to global", () => {
	withTiers((agentDir, project) => {
		writeJson(join(agentDir, "config.json"), { defense: { watcher: true, watcherEveryTurns: 7 } });
		writeJson(join(project, ".helm", "config.json"), { defense: { watcher: false } });
		const merged = readMergedSection(project, "defense");
		assert.equal(merged.watcher, false, "project overrides the global field");
		assert.equal(merged.watcherEveryTurns, 7, "untouched field falls through");
		// efficiency section is independent: project defense must not leak into it
		assert.deepEqual(readMergedSection(project, "efficiency"), {});
	});
});

test("config-store: invalid JSON in either tier never throws", () => {
	withTiers((agentDir, project) => {
		writeFileSync(join(agentDir, "config.json"), "{ not json", "utf8");
		assert.deepEqual(readMergedSection(project, "defense"), {}, "bad global file skipped");
		writeJson(join(project, ".helm", "config.json"), { defense: { watcher: true } });
		assert.equal(readMergedSection(project, "defense").watcher, true, "good project file still reads");
	});
});

test("config-store: readDefenseConfig and readHelmEfficiency ride the merged tier", () => {
	withTiers((agentDir, project) => {
		writeJson(join(agentDir, "config.json"), {
			defense: { watcher: true },
			efficiency: { actionFusion: false, reducerModel: "xiaomi/mimo-v2.6-flash" },
		});
		assert.equal(readDefenseConfig(project).watcher, true, "defense.watcher from global tier");
		const eff = readHelmEfficiency(project);
		assert.equal(eff.actionFusion, false, "efficiency switch from global tier");
		assert.equal(eff.reducerModel, "xiaomi/mimo-v2.6-flash", "efficiency string from global tier");
		// project override at the reader level
		writeJson(join(project, ".helm", "config.json"), { defense: { watcher: false } });
		assert.equal(readDefenseConfig(project).watcher, false, "project defense wins at the reader");
		assert.equal(readHelmEfficiency(project).actionFusion, false, "efficiency untouched by project defense");
	});
});
