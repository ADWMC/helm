/**
 * W3-T04: 拒绝附升级阶梯 (Dark-Moon 2183-2186, §1.3 阶梯第4条).
 *   - every supervise limit verdict carries why + bounded ladder (not bare stop)
 *   - journal `instead` sample rows written
 *   - negative: supervise NEVER hard-stops the session — legal hard stops remain
 *     ONLY scope-denied (hard+journal) and token_budget_exhausted (G2/G4 pinned).
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createG4Monitor, DEFAULT_WATCH } from "./g4-live.ts";
import { Ledger } from "./ledger.ts";
import { blockIfCapped, checkSameTool, checkStepToolCap, type SuperviseConfig } from "./supervise.ts";

const CFG: SuperviseConfig = { enabled: true, sameToolLimit: 3, stepToolCap: 5 };
const LADDER = /retry once bounded.*change angle.*not-exploitable/is;

test("every limit verdict carries why + the escalation ladder (no bare stop)", () => {
	const same = checkSameTool(CFG, 3);
	assert.ok(same.reason?.startsWith("same_tool_limit"), "why present");
	assert.match(same.instead ?? "", LADDER, "ladder present on same-tool limit");
	const cap = checkStepToolCap(CFG, 5);
	assert.ok(cap.reason?.startsWith("step_tool_cap"));
	assert.match(cap.instead ?? "", LADDER, "ladder present on step cap");
});

test("blockIfCapped journals an `instead` sample row (evidence collection)", () => {
	const dir = mkdtempSync(join(tmpdir(), "helm-t04-"));
	try {
		const led = new Ledger(join(dir, "ledger.db"));
		led.setSpec({ goal: "g", allowedTargets: ["http://127.0.0.1:18081"], highRisk: "deny" } as never);
		led.addStep({
			id: "s1",
			kind: "recon",
			target: "http://127.0.0.1:18081",
			objective: "recon",
			doneWhen: "x",
			basisIds: [],
			dependsOn: [],
			status: "active",
			turn: 1,
			createdRevision: 1,
		} as never);
		const blocked = blockIfCapped(led, CFG, "s1", 9);
		assert.equal(blocked, true, "step capped");
		const rows = led.journal().filter((r) => r.kind === "instead");
		assert.equal(rows.length, 1, "instead sample row journaled");
		const p = JSON.parse(rows[0]?.payloadJson ?? "{}");
		assert.match(String(p.instead ?? ""), LADDER);
		assert.equal(p.source, "step_tool_cap");
		// session NOT hard-stopped by supervise: step blocked is a step state, not terminate
		const st = led.steps().find((s) => s.id === "s1");
		assert.equal(st?.status, "blocked");
		led.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("negative: supervise never hard-stops — hard stops remain scope/budget only", () => {
	// step-cap path: blockStep is a STEP verdict; no terminate semantics anywhere
	const cap = checkStepToolCap(CFG, 99);
	assert.equal((cap as { terminate?: boolean }).terminate, undefined);
	const same = checkSameTool(CFG, 99);
	assert.equal((same as { terminate?: boolean }).terminate, undefined);
	assert.equal(same.blockStep, false, "same-tool limit is advisory, never a block");
	// G4 streak: instead path, tools still allowed after the reminder
	const journaled: Array<{ kind: string }> = [];
	const m = createG4Monitor({
		readMaxTokens: () => null,
		readDefense: () => ({ watcher: false, watcherEveryTurns: 4, stepToolCap: 3 }),
		journal: (k) => journaled.push({ kind: k }),
		pushReminder: () => {},
		review: () => ({ verdict: "pass", findings: [] }),
	});
	for (let i = 0; i < 4; i++) m.preToolCall("bash");
	assert.ok(
		journaled.some((j) => j.kind === "instead"),
		"G4 instead row",
	);
	assert.equal(m.preToolCall("bash"), null, "still passes — no hard stop (DEFAULT_WATCH unaffected)");
	assert.ok(DEFAULT_WATCH.watcher === false);
});

test("L0/negative: hard blocks live only in the Tool Gateway (scope/tripwire/capability/sandbox)", async () => {
	// structural pin: gate code paths (index.ts + runtime/gateway.ts) may only
	// hard-block for scope/tripwire/capability/sandbox reasons (budget uses the
	// plain token_budget_exhausted string from G4); supervise never hard-stops.
	// W2-T01/W3-T03 denials moved into the unified Tool Gateway (REDESIGN §10.6).
	// fileURLToPath: URL.pathname yields `/C:/...` on win32 → readFileSync("C:\C:\...") (Windows portability)
	const fs = await import("node:fs");
	const read = (rel: string) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
	const src = `${read("./index.ts")}\n${read("./runtime/gateway.ts")}`;
	const blockReasons = [...src.matchAll(/reason: `([^`]+)`/g)].map((m) => m[1] ?? "");
	const hardStop = /^(scope_denied|tripwire|capability_denied|sandbox_denied)/;
	assert.ok(
		blockReasons.some((r) => hardStop.test(r)),
		"gateway hard blocks present",
	);
	assert.ok(
		blockReasons.every((r) => hardStop.test(r)),
		`no ad-hoc hard-block reasons: ${blockReasons.join(" | ")}`,
	);
	assert.ok(!blockReasons.some((r) => r.includes("step_tool_cap")), "step cap must not hard-block");
	assert.ok(!blockReasons.some((r) => r.includes("same_tool")), "same-tool must not hard-block");
});
