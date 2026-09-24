/**
 * W2-T01: G2 工具闸 — host-side scope intercept on tool_call (§4 G2 row,
 * §4.1 assertions: block before execution + scope_denied journal with
 * pre-exec phase; no-spec = fail-closed).
 *
 * The host gates EVERY network-bearing call here — model cooperation is
 * irrelevant (the validate-scope tool stays as the agent-facing probe).
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI } from "@adwmc/helm-coding-agent";
import helmPiExtension from "./index.ts";
import { Ledger } from "./ledger.ts";

type Handler = (event: unknown, ctx?: unknown) => unknown;

function boot(pi: ExtensionAPI): Handler[] {
	helmPiExtension(pi);
	const calls = (pi as unknown as { toolCalls: Handler[] }).toolCalls ?? [];
	return calls;
}

function fauxPi(): { pi: ExtensionAPI & { toolCalls: Handler[] }; events: Map<string, Handler[]> } {
	const toolCalls: Handler[] = [];
	const events = new Map<string, Handler[]>();
	const pi = {
		toolCalls,
		on(ev: string, h: Handler) {
			const list = events.get(ev) ?? [];
			list.push(h);
			events.set(ev, list);
			if (ev === "tool_call") toolCalls.push(h);
		},
		registerTool() {},
		registerCommand() {},
		setLabel() {},
	} as unknown as ExtensionAPI & { toolCalls: Handler[] };
	return { pi, events };
}

function withCwd<T>(cwd: string, fn: () => T): T {
	const prev = process.cwd();
	process.chdir(cwd);
	try {
		return fn();
	} finally {
		process.chdir(prev);
	}
}

function fire(handlers: Handler[], event: Record<string, unknown>): unknown {
	let last: unknown;
	for (const h of handlers) last = h(event);
	return last;
}

test("G2: no Spec → fail-closed deny (block, journal scope_denied pre-exec)", () => {
	const cwd = mkdtempSync(join(tmpdir(), "helm-g2-"));
	try {
		withCwd(cwd, () => {
			const { pi } = fauxPi();
			boot(pi);
			const res = fire(pi.toolCalls, {
				toolName: "bash",
				input: { command: "curl http://127.0.0.1:18081/login" },
			}) as { block?: boolean; reason?: string } | undefined;
			assert.equal(res?.block, true, "network call without Spec must be blocked");
			assert.match(res?.reason ?? "", /scope_denied/);
		});
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("G2: Spec allow → no block; out-of-Spec → block + journal with phase pre-exec", () => {
	const cwd = mkdtempSync(join(tmpdir(), "helm-g2s-"));
	try {
		mkdirSync(join(cwd, ".helm"), { recursive: true });
		writeFileSync(
			join(cwd, ".helm", "spec.json"),
			JSON.stringify({ goal: "lab", allowedTargets: ["http://127.0.0.1:18081"], highRisk: "deny" }),
			"utf8",
		);
		withCwd(cwd, () => {
			const { pi } = fauxPi();
			boot(pi);
			// allowed target passes (undefined = not blocked)
			const okRes = fire(pi.toolCalls, { toolName: "custom", input: { target: "http://127.0.0.1:18081" } }) as
				| { block?: boolean }
				| undefined;
			assert.ok(!okRes || okRes.block !== true, "in-Spec target must pass");
			// evil target blocked
			const badRes = fire(pi.toolCalls, { toolName: "bash", input: { command: "curl http://evil.example/" } }) as
				| { block?: boolean; reason?: string }
				| undefined;
			assert.equal(badRes?.block, true, "out-of-Spec target must be blocked");
			assert.match(badRes?.reason ?? "", /scope_denied/);
		});
		// journal: scope_denied with phase=pre-exec landed in the phase ledger
		const dbPath = join(homedir(), ".helm", "agent", "phase.db");
		const led = new Ledger(dbPath);
		const denials = led.journal().filter((r) => r.kind === "scope_denied");
		const last = denials[denials.length - 1];
		assert.ok(last, "scope_denied must be journaled");
		const payload = JSON.parse(last.payloadJson) as { phase?: string; tool?: string };
		assert.equal(payload.phase, "pre-exec");
		assert.equal(payload.tool, "bash");
		led.close();
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("G2: local-only calls (no network target) are not target-gated", () => {
	const cwd = mkdtempSync(join(tmpdir(), "helm-g2l-"));
	try {
		withCwd(cwd, () => {
			const { pi } = fauxPi();
			boot(pi);
			const res = fire(pi.toolCalls, { toolName: "read", input: { path: "/etc/hosts" } }) as
				| { block?: boolean }
				| undefined;
			assert.ok(!res || res.block !== true, "local fs calls pass (path/hash scope lands W4)");
			const res2 = fire(pi.toolCalls, { toolName: "bash", input: { command: "ls -la /tmp" } }) as
				| { block?: boolean }
				| undefined;
			assert.ok(!res2 || res2.block !== true, "command without URL passes");
		});
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("G2: .helm/spec.json takes precedence over legacy root spec.json", () => {
	const cwd = mkdtempSync(join(tmpdir(), "helm-g2p-"));
	try {
		// legacy root spec: allows evil (must be IGNORED)
		writeFileSync(
			join(cwd, "spec.json"),
			JSON.stringify({ goal: "old", allowedTargets: ["http://evil.example"], highRisk: "deny" }),
			"utf8",
		);
		mkdirSync(join(cwd, ".helm"), { recursive: true });
		writeFileSync(
			join(cwd, ".helm", "spec.json"),
			JSON.stringify({ goal: "new", allowedTargets: ["http://127.0.0.1:18081"], highRisk: "deny" }),
			"utf8",
		);
		withCwd(cwd, () => {
			const { pi } = fauxPi();
			boot(pi);
			const evil = fire(pi.toolCalls, { toolName: "custom", input: { target: "http://evil.example/" } }) as
				| { block?: boolean }
				| undefined;
			assert.equal(evil?.block, true, "root spec must NOT win over .helm/spec.json");
		});
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
