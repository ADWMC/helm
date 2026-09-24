/**
 * W1-T04: efficiency wrapper tests — default-ON + per-mechanism opt-out
 * (WG1.4: 默认开断言 + 每机制 ≥1 opt-out 负向 + 逐项可关).
 *
 * Discriminators (per mechanism's unique registration):
 *   actionFusion             → tool `edit` carrying `then_run` (fusion schema)
 *   observationPack          → tool `obs_recall`
 *   onlineContextCompact     → tool `update_plan`
 *   evidencePreservingReducer → `pi.on("tool_result")` hook (unique among the four)
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@adwmc/helm-coding-agent";
import { createEfficiencyExtension, readHelmEfficiency, resolveSolPiConfig } from "./efficiency/index.ts";

interface FauxPi {
	readonly pi: ExtensionAPI;
	readonly tools: Map<string, { name: string; description?: string; parameters?: unknown }>;
	readonly events: string[];
	readonly handlers: Map<string, ((event: unknown, ctx: unknown) => unknown)[]>;
}

function fauxPi(): FauxPi {
	const tools = new Map<string, { name: string; description?: string; parameters?: unknown }>();
	const events: string[] = [];
	const handlers = new Map<string, ((event: unknown, ctx: unknown) => unknown)[]>();
	const pi = {
		on(ev: string, h: (event: unknown, ctx: unknown) => unknown) {
			events.push(ev);
			const list = handlers.get(ev) ?? [];
			list.push(h);
			handlers.set(ev, list);
		},
		registerTool(t: { name: string; description?: string; parameters?: unknown }) {
			tools.set(t.name, t);
		},
		registerCommand() {},
		setLabel() {},
	} as unknown as ExtensionAPI;
	return { pi, tools, events, handlers };
}

function makeCtx(cwd: string): ExtensionContext {
	return {
		cwd,
		sessionManager: {} as never,
		isProjectTrusted: () => true,
	} as unknown as ExtensionContext;
}

async function boot(rec: FauxPi, cwd: string): Promise<void> {
	createEfficiencyExtension(undefined, cwd)(rec.pi);
	// Snapshot: firing the lazy registration handler makes the mechanisms
	// register THEIR OWN session handlers mid-iteration; we only want the
	// wrapper bootstrap (registration side effects), not their runtime hooks.
	const bootstrap = [...(rec.handlers.get("session_start") ?? [])];
	for (const h of bootstrap) {
		await h({ type: "session_start" }, makeCtx(cwd));
	}
}

function hasThenRunEdit(rec: FauxPi): boolean {
	const edit = rec.tools.get("edit");
	if (!edit) return false;
	return JSON.stringify({ d: edit.description, p: edit.parameters }).includes("then_run");
}

function tmpCwd(): string {
	return mkdtempSync(join(tmpdir(), "helm-eff-"));
}

test("resolveSolPiConfig: all four mechanisms default ON (§0 flip over upstream false)", () => {
	const c = resolveSolPiConfig();
	assert.equal(c.actionFusion, true);
	assert.equal(c.observationPack, true);
	assert.equal(c.evidencePreservingReducer, true);
	assert.equal(c.onlineContextCompact, true);
});

test("default-ON: all four discriminators present with no config file", async () => {
	const cwd = tmpCwd();
	try {
		const rec = fauxPi();
		await boot(rec, cwd);
		assert.ok(hasThenRunEdit(rec), "actionFusion must register edit+then_run");
		assert.ok(rec.tools.has("obs_recall"), "observationPack must register obs_recall");
		assert.ok(rec.tools.has("update_plan"), "onlineContextCompact must register update_plan");
		assert.ok(rec.events.includes("tool_result"), "reducer must hook tool_result");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

const OPT_OUT_CASES: Array<{ key: keyof ReturnType<typeof resolveSolPiConfig>; off: (rec: FauxPi) => boolean; stillOn: (rec: FauxPi) => boolean }> = [
	{ key: "actionFusion", off: (r) => !hasThenRunEdit(r), stillOn: (r) => r.tools.has("obs_recall") },
	{ key: "observationPack", off: (r) => !r.tools.has("obs_recall"), stillOn: (r) => r.tools.has("update_plan") },
	{ key: "onlineContextCompact", off: (r) => !r.tools.has("update_plan"), stillOn: (r) => r.tools.has("obs_recall") },
	{ key: "evidencePreservingReducer", off: (r) => !r.events.includes("tool_result"), stillOn: (r) => r.tools.has("obs_recall") },
];

for (const c of OPT_OUT_CASES) {
	test(`opt-out: ${String(c.key)}=false in .helm/config.json disables only that mechanism`, async () => {
		const cwd = tmpCwd();
		try {
			mkdirSync(join(cwd, ".helm"), { recursive: true });
			writeFileSync(join(cwd, ".helm", "config.json"), JSON.stringify({ efficiency: { [c.key]: false } }), "utf8");
			const sw = readHelmEfficiency(cwd);
			assert.equal(sw[c.key as keyof typeof sw], false, "switch must be read from file");
			const rec = fauxPi();
			await boot(rec, cwd);
			assert.ok(c.off(rec), `${String(c.key)} must be OFF`);
			assert.ok(c.stillOn(rec), "other mechanisms must stay ON (per-item isolation)");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
}

test("unreadable/missing config → all ON (fail-open to defaults, defensively)", async () => {
	const cwd = tmpCwd();
	try {
		assert.deepEqual(readHelmEfficiency(cwd), {});
		const rec = fauxPi();
		await boot(rec, cwd);
		assert.ok(rec.tools.has("obs_recall") && rec.tools.has("update_plan"));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
