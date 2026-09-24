/**
 * W2-T03: task tool smoke (§4.1 G3: spawn/回收 + typed yield; 评分#1 four-piece MVP).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI } from "@adwmc/helm-coding-agent";
import { createTaskTool, type TaskEnvelope } from "./task.ts";

function faux(): ExtensionAPI {
	return {
		registerTool() {},
		registerCommand() {},
		setLabel() {},
		on() {},
	} as unknown as ExtensionAPI;
}
void faux;

function txt(res: unknown): string {
	const r = res as { content: Array<{ text: string }> };
	return r.content[0]?.text ?? "";
}

test("G3 smoke: spawn yields typed envelope → status alive → kill reclaims", async () => {
	const tool = createTaskTool(process.cwd());
	const spawnRes = await tool.execute("1", { action: "spawn", prompt: "scan lab", timeoutMs: 20_000 });
	const spawned = JSON.parse(txt(spawnRes)) as { id: string; pid?: number; running: boolean };
	assert.equal(spawned.running, true, "spawn reports running");
	assert.ok(spawned.pid && spawned.pid > 0, "child pid present");

	// wait for the typed `started` yield
	let yields: TaskEnvelope[] = [];
	const deadline = Date.now() + 4000;
	while (Date.now() < deadline) {
		const st = await tool.execute("2", { action: "status", id: spawned.id });
		const parsed = JSON.parse(txt(st)) as { alive: boolean; yields: TaskEnvelope[] };
		yields = parsed.yields;
		if (yields.some((y) => y.kind === "started")) break;
		await new Promise((r) => setTimeout(r, 100));
	}
	const started = yields.find((y) => y.kind === "started");
	assert.ok(started, "typed started yield received");
	assert.equal(started?.v, 1, "envelope versioned v:1");
	assert.equal(started?.id, spawned.id, "envelope carries task id");

	// kill → reclaim
	const killRes = await tool.execute("3", { action: "kill", id: spawned.id });
	const killed = JSON.parse(txt(killRes)) as { id: string; reclaimed: boolean };
	assert.equal(killed.reclaimed, true, "child reclaimed after SIGTERM");

	// unknown id → honest error
	const missing = await tool.execute("4", { action: "status", id: "nope" });
	assert.match(txt(missing), /unknown task id/);
});

test("G3 lite gate: spawn rejected in lite mode (tool-surface twin in kernel)", async () => {
	const prev = process.env.HELPI_ANALYSIS_MODE;
	process.env.HELPI_ANALYSIS_MODE = "lite";
	try {
		const tool = createTaskTool(process.cwd());
		const res = await tool.execute("1", { action: "spawn", prompt: "x" });
		assert.match(txt(res), /rejected: lite mode/);
	} finally {
		if (prev === undefined) delete process.env.HELPI_ANALYSIS_MODE;
		else process.env.HELPI_ANALYSIS_MODE = prev;
	}
});
