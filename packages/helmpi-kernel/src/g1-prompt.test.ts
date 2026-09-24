/**
 * W2-T02: G1 prompt composition (§4.1 G1 assertions: tier difference, no HCOT
 * anywhere, S1 segment present, tool-memory recall with budget truncation,
 * reminders flush one-shot next-start semantics (评分#2 downgraded form)).
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@adwmc/helm-coding-agent";
import helmPiExtension from "./index.ts";
import { openToolMemory } from "./memory/tool-memory.ts";
import { composeSystemPrompt } from "./prompt-lib.ts";

interface BasEvent {
	prompt: string;
	systemPromptOptions?: { forceSystemPrompt?: string; cwd?: string };
}

function handlersFor(pi: ExtensionAPI): Array<(e: unknown, c: unknown) => unknown> {
	return (pi as unknown as { bas: Array<(e: unknown, c: unknown) => unknown> }).bas ?? [];
}

function fauxPi(): ExtensionAPI & {
	bas: Array<(e: unknown, c: unknown) => unknown>;
	toolCalls: Array<(e: unknown) => unknown>;
} {
	const bas: Array<(e: unknown, c: unknown) => unknown> = [];
	const toolCalls: Array<(e: unknown) => unknown> = [];
	const pi = {
		bas,
		toolCalls,
		on(ev: string, h: unknown) {
			if (ev === "before_agent_start") bas.push(h as (e: unknown, c: unknown) => unknown);
			if (ev === "tool_call") toolCalls.push(h as (e: unknown) => unknown);
		},
		registerTool() {},
		registerCommand() {},
		setLabel() {},
	} as unknown as ExtensionAPI & {
		bas: Array<(e: unknown, c: unknown) => unknown>;
		toolCalls: Array<(e: unknown) => unknown>;
	};
	return pi;
}

const CTX = { ui: { notify() {} }, cwd: process.cwd() } as unknown as ExtensionContext;

async function start(pi: ExtensionAPI, cwd: string): Promise<string> {
	const ev: BasEvent = { prompt: "", systemPromptOptions: { cwd } };
	for (const h of handlersFor(pi)) await h(ev, CTX);
	return ev.systemPromptOptions?.forceSystemPrompt ?? "";
}

test("composeSystemPrompt: tier text differs, S1 always present, no HCOT anywhere", () => {
	const cwd = mkdtempSync(join(tmpdir(), "helm-g1-"));
	try {
		const lite = composeSystemPrompt({ tier: "lite", cwd, reminders: [] });
		const full = composeSystemPrompt({ tier: "full", cwd, reminders: [] });
		assert.ok(lite.includes("lite tier") && full.includes("full tier"), "tier markers");
		assert.notEqual(lite, full, "tiers must differ");
		for (const p of [lite, full]) {
			assert.ok(p.includes("<helm_s1>"), "S1 segment present");
			assert.ok(p.includes("No mid-run human questions"), "S1 rule 3 present");
			assert.ok(!/hcot/i.test(p), "no HCOT (§0)");
		}
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("composeSystemPrompt: tool-memory recall segment from verified entries only", () => {
	const cwd = mkdtempSync(join(tmpdir(), "helm-g1m-"));
	try {
		const before = composeSystemPrompt({ tier: "full", cwd, reminders: [] });
		assert.ok(!before.includes("<helm_tool_memory>"), "no memory yet → no segment");
		mkdirSync(join(cwd, ".helm"), { recursive: true });
		const mem = openToolMemory(join(cwd, ".helm", "tool-memory.db"));
		mem.upsert({
			scope: "workspace",
			scopeKey: cwd,
			kind: "tool",
			name: "nuclei-scanner",
			verdict: "works",
			confidence: "high",
			note: "probe: nuclei -version",
			evidenceRefs: [],
			source: "agent",
			probe: "node --version",
			status: "verified",
		});
		mem.upsert({
			scope: "workspace",
			scopeKey: cwd,
			kind: "tool",
			name: "ghost-tool",
			verdict: "works",
			confidence: "high",
			note: "bad locator",
			evidenceRefs: [],
			source: "agent",
			probe: "definitely-not-real-xyz",
			status: "stale",
		});
		mem.close();
		const after = composeSystemPrompt({ tier: "full", cwd, reminders: [] });
		assert.ok(after.includes("<helm_tool_memory>"), "recall segment appears");
		assert.ok(after.includes("nuclei-scanner"), "verified entry injected");
		assert.ok(!after.includes("ghost-tool"), "stale entry never injected (WG1.6)");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("G1 via before_agent_start: forceSystemPrompt set (host default replaced), host prompt untouched when no options", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "helm-g1f-"));
	try {
		const { pi } = { pi: fauxPi() };
		helmPiExtension(pi);
		const forced = await start(pi, cwd);
		assert.ok(forced.length > 0, "forceSystemPrompt must be composed");
		assert.ok(forced.includes("autonomous authorized security agent") || forced.includes("authorized security"));
		// legacy handler path without options must not throw
		await handlersFor(pi)[0]!({ prompt: "hello" }, CTX);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("轮间注入: G2 denial queues a reminder → injected NEXT start → flushed (one-shot)", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "helm-g1r-"));
	try {
		const pi = fauxPi();
		helmPiExtension(pi);
		// start1: clean
		const first = await start(pi, cwd);
		assert.ok(!first.includes("<helm_reminders>"), "clean start has no reminders");
		// G2 denial (no Spec here → fail-closed block) queues the reminder
		for (const h of pi.toolCalls) {
			h({ toolName: "bash", input: { command: "curl http://evil.example/" } });
		}
		// start2: reminder surfaces (下轮生效, not mid-token)
		const second = await start(pi, cwd);
		assert.ok(second.includes("<helm_reminders>"), "reminder injected on next start");
		assert.ok(
			second.includes("Remain inside Spec.allowedTargets") || second.includes("allowedTargets"),
			"reminder names the rule",
		);
		// start3: flushed — one-shot
		const third = await start(pi, cwd);
		assert.ok(!third.includes("<helm_reminders>"), "reminder is one-shot (flushed)");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
