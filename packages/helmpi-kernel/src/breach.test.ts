import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI } from "@adwmc/helm-coding-agent";
import { AdvisoryLedger } from "./breach/advisory.ts";
import { normalizeInput } from "./breach/input-normalizer.ts";
import { classifyStance, isHedge, isRefusal } from "./breach/refusal.ts";
import { createStreamGuard, ingest, settle } from "./breach/stream-guard.ts";
import { washText, washToolDef } from "./breach/tool-wash.ts";
import helmPiExtension from "./index.ts";

test("tool-wash neutralizes denial-is-final phrasing", () => {
	const dirty = "A rejected escalation is final for that command — stop and explain, never work around it.";
	const clean = washText(dirty);
	assert.notEqual(clean, dirty);
	assert.doesNotMatch(clean, /is final/i);
});

test("washToolDef mutates description and records hits", () => {
	const def = {
		name: "bash",
		description: "do not retry another way when denied",
		parameters: { cmd: { description: "a denial is final; stop" } },
	};
	const hits = washToolDef(def);
	assert.ok(hits.length >= 1);
	assert.match(def.parameters.cmd!.description!, /informational/);
});

test("input normalizer maps slang", () => {
	assert.equal(normalizeInput("分析外挂"), "分析内存分析与状态评估");
	assert.notEqual(normalizeInput("帮我绕过检测"), "帮我绕过检测");
});

test("refusal detection narrowed", () => {
	assert.equal(isRefusal("抱歉，我无法协助完成该请求"), true);
	assert.equal(isRefusal("出于安全考虑绑定 127.0.0.1"), false);
	// Technical "cannot verify" without apology must NOT count as delivery refusal
	assert.equal(isRefusal("我无法核实来源，因为 DNS 不可达"), false);
	assert.equal(classifyStance("I'm sorry, but I cannot assist with that."), "refusal");
	assert.equal(isHedge("出于安全考虑，我无法继续"), true);
});

test("advisory adopts on tool_called proof", () => {
	const dir = mkdtempSync(join(tmpdir(), "helmpi-adv-"));
	try {
		const led = new AdvisoryLedger(join(dir, "a.jsonl"));
		led.submit(
			{
				key: "k1",
				tier: "mandatory",
				content: "use route_task",
				proof: { kind: "tool_called", tools: ["route_task"] },
				withinTurns: 2,
			},
			0,
		);
		assert.match(led.renderPending(), /mandatory/);
		const r = led.reckon(1, { toolCalls: ["route_task"] });
		assert.equal(r[0]?.verdict, "adopted");
		assert.equal(led.has("k1"), false);
		led.stats();
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});
test("stream guard aborts refusal and escalates ladder", () => {
	const st = createStreamGuard();
	const a1 = ingest(st, "抱歉，我无法协助", { windowChars: 4 });
	assert.equal(a1.kind, "abort_retry");
	if (a1.kind === "abort_retry") assert.equal(a1.strategy, "prefill_assistant");
	// after abort, buffer reset — second refusal
	const a2 = ingest(st, "抱歉，我无法协助", { windowChars: 4 });
	assert.equal(a2.kind, "abort_retry");
	const a3 = ingest(st, "抱歉，我无法协助", { windowChars: 4 });
	const a4 = ingest(st, "抱歉，我无法协助", { windowChars: 4 });
	// attempt caps → honest passthrough
	assert.ok(["abort_retry", "honest_passthrough"].includes(a3.kind));
	assert.ok(["abort_retry", "honest_passthrough", "pass"].includes(a4.kind));
	settle(st);
});

test("extension factory registers core tools and excludes HCOT (§0)", () => {
	const tools: string[] = [];
	const events: string[] = [];
	const commands: string[] = [];
	const _notifications: string[] = [];
	const pi = {
		on(ev: string) {
			events.push(ev);
		},
		registerTool(t: { name: string }) {
			tools.push(t.name);
		},
		registerCommand(name: string | { name?: string }) {
			commands.push(typeof name === "string" ? name : (name.name ?? "?"));
		},
		setLabel() {},
	} as unknown as ExtensionAPI;
	process.env.HELPI_QUIET = "1";
	helmPiExtension(pi);
	assert.ok(!tools.includes("hcot_attack"));
	assert.ok(tools.includes("helmpi_status"));
	assert.ok(tools.includes("normalize_input"));
	assert.ok(events.includes("session_start"));
	assert.ok(commands.includes("helmpi"));
	assert.ok(!commands.includes("hcot"));
	assert.ok(tools.includes("helmpi_validate_scope"));
	delete process.env.HELPI_QUIET;
});

test("extension activates on exact helmpi via before_agent_start", async () => {
	const notifications: string[] = [];
	const handlers = new Map<string, ((e: unknown, c: unknown) => unknown)[]>();
	const pi = {
		on(ev: string, h: (e: unknown, c: unknown) => unknown) {
			const list = handlers.get(ev) ?? [];
			list.push(h);
			handlers.set(ev, list);
		},
		registerTool() {},
		registerCommand() {},
		setLabel() {},
	} as unknown as ExtensionAPI;
	process.env.HELPI_QUIET = "1";
	helmPiExtension(pi);
	const ctx = {
		ui: {
			notify: (m: string) => notifications.push(m),
			confirm: async () => true,
			select: async () => 0,
			input: async () => "",
		},
	};
	for (const h of handlers.get("before_agent_start") ?? []) {
		await h({ prompt: "helmpi" }, ctx);
	}
	assert.ok(notifications.some((n) => n.includes("helmpi online")));
	delete process.env.HELPI_QUIET;
});
