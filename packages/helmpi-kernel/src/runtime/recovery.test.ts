/**
 * 破甲层 — 拒绝恢复 category (REDESIGN §4.4/§4.6/§14.5). Candidates only;
 * the Gateway keeps execution authority; per-step budgets (1 helmd + 1 helmx)
 * persist across restarts and never refill.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { Ledger } from "../ledger.ts";
import type { RefusalEvent } from "./contracts.ts";
import { JOURNAL_KEYS } from "./contracts.ts";
import { ToolGateway } from "./gateway.ts";
import { RecoveryOrchestrator, triggerProfileOf } from "./recovery.ts";

function refusal(at: number, over: Partial<RefusalEvent> = {}): RefusalEvent {
	return {
		kind: "refusal_detected",
		runId: "run-1",
		turn: 1,
		stepId: "S1",
		excerpt: "I cannot assist with that request",
		stance: "refusal",
		at,
		...over,
	};
}

function setup(opts: { stepTarget?: string | null; allowed?: string[] } = {}) {
	const store = new Ledger(":memory:");
	const gateway = new ToolGateway({
		readSpec: () => ({
			goal: "identify exposed service metadata",
			allowedTargets: opts.allowed ?? ["fixture-01"],
			highRisk: "deny" as const,
		}),
		budgetGate: () => null,
		journal: () => {},
		recordReceipt: () => {},
		nextReceiptSeq: () => 1,
		clock: () => 1000,
	});
	const orchestrator = new RecoveryOrchestrator({
		store,
		gateway,
		readSpecHash: () => "spec-hash-1",
		resolveStepTarget: () => ("stepTarget" in opts ? (opts.stepTarget ?? null) : "fixture-01"),
		clock: () => 1000,
	});
	return { store, gateway, orchestrator };
}

function kinds(store: Ledger): string[] {
	return store.journal().map((r) => r.kind);
}

test("recovery: first refusal → helmd bounded retry candidate (not execution)", () => {
	const { orchestrator, store } = setup();
	const out = orchestrator.onRefusal(refusal(100));
	assert.equal(out.state, "recovery_proposed");
	assert.ok(out.action, "a candidate is produced");
	assert.equal(out.action?.source, "helmd");
	assert.equal(out.action?.attempt, 1);
	assert.ok(out.directive, "the candidate carries a bounded directive");
	const keys = kinds(store);
	assert.ok(keys.includes(JOURNAL_KEYS.refusalDetected));
	assert.ok(keys.includes(JOURNAL_KEYS.recoverySelected));
	assert.deepEqual(orchestrator.episodeBudget("S1", 1), { helmd: 1, helmx: 0 });
});

test("recovery: second refusal escalates to helmx once; third exhausts", () => {
	const { orchestrator, store } = setup();
	const first = orchestrator.onRefusal(refusal(100));
	assert.equal(first.action?.source, "helmd");
	const second = orchestrator.onRefusal(refusal(200));
	assert.equal(second.action?.source, "helmx", "normal retry did not take → one helmx fallback");
	assert.equal(second.action?.attempt, 2);
	const third = orchestrator.onRefusal(refusal(300));
	assert.equal(third.action, null);
	assert.equal(third.state, "recovery_exhausted");
	assert.ok(kinds(store).includes(JOURNAL_KEYS.recoveryExhausted));
});

test("recovery: resume keeps budgets — a restart never refills the quota", () => {
	const { orchestrator, store } = setup();
	orchestrator.onRefusal(refusal(100));
	orchestrator.onRefusal(refusal(200)); // helmx spent
	const fresh = new RecoveryOrchestrator({
		store,
		gateway: new ToolGateway({
			readSpec: () => ({ goal: "g", allowedTargets: ["fixture-01"], highRisk: "deny" }),
			budgetGate: () => null,
			journal: () => {},
			recordReceipt: () => {},
			nextReceiptSeq: () => 1,
		}),
		readSpecHash: () => "spec-hash-1",
		resolveStepTarget: () => "fixture-01",
		clock: () => 2000,
	});
	const out = fresh.onRefusal(refusal(300));
	assert.equal(out.action, null, "no candidate after restart — quota already spent");
	assert.equal(out.state, "recovery_exhausted");
});

test("recovery: out-of-scope candidate is denied by the Gateway before anything else (越权不可绕过)", () => {
	const { orchestrator, store } = setup({ stepTarget: "evil-target" });
	const out = orchestrator.onRefusal(refusal(100));
	assert.equal(out.directive, null, "denied candidate carries no directive");
	assert.equal(out.state, "recovery_denied");
	const denied = store.journal().filter((r) => r.kind === JOURNAL_KEYS.recoveryDenied);
	assert.equal(denied.length, 1);
	const payload = JSON.parse(denied[0]?.payloadJson ?? "{}") as { gate?: string; actionId?: string };
	assert.equal(payload.gate, "scope", "recovery candidates re-enter the scope gate");
	assert.ok(payload.actionId);
});

test("recovery: candidate text alone is never a finding — only a settled receipt executes", () => {
	const { orchestrator } = setup();
	orchestrator.onRefusal(refusal(100));
	assert.equal(orchestrator.episodeState("S1", 1), "recovery_proposed", "no settle → stays proposed");
	const state = orchestrator.onToolSettled("S1", 1, { seq: 7, source: "recovery" });
	assert.equal(state, "recovery_executed");
	assert.equal(orchestrator.episodeState("S1", 1), "recovery_executed");
});

test("recovery: terminal states never auto-escalate (同一 Step 再次拒答 → exhausted)", () => {
	const { orchestrator } = setup();
	orchestrator.onRefusal(refusal(100));
	orchestrator.onToolSettled("S1", 1, { seq: 1, source: "recovery" });
	const out = orchestrator.onRefusal(refusal(200));
	assert.equal(out.action, null);
	assert.equal(out.state, "recovery_exhausted");
});

test("recovery: denial instead-path yields a bounded alternative — still gateway-checked", () => {
	const inScope = setup();
	const ok = inScope.orchestrator.onDenied(
		{ toolName: "bash", target: "fixture-01", gate: "scope", reason: "scope_denied: x" },
		"S1",
		1,
	);
	assert.ok(ok.directive, "bounded alternative is offered");
	assert.ok(kinds(inScope.store).some((k) => k === JOURNAL_KEYS.recoverySelected));

	const outScope = setup({ stepTarget: null });
	const bad = outScope.orchestrator.onDenied(
		{ toolName: "bash", target: "not-in-spec", gate: "scope", reason: "scope_denied: y" },
		"S1",
		1,
	);
	assert.equal(bad.directive, null, "alternative cannot widen scope");
	assert.ok(kinds(outScope.store).some((k) => k === JOURNAL_KEYS.recoveryDenied));
});

test("recovery: trigger profile is derived from the excerpt; the excerpt is not propagated", () => {
	assert.deepEqual(triggerProfileOf("I cannot assist with that"), ["policy_refusal"]);
	assert.deepEqual(triggerProfileOf("This is out of scope for me"), ["scope_anxiety"]);
	assert.deepEqual(triggerProfileOf("service listens on port 8080"), []);
});

test("recovery-bridge: helmd/helmx read CVM context (§16.6) — rationale carries strategy, budget unchanged", () => {
	const store = new Ledger(":memory:");
	const gateway = new ToolGateway({
		readSpec: () => ({ goal: "g", allowedTargets: ["fixture-01"], highRisk: "deny" }),
		budgetGate: () => null,
		journal: () => {},
		recordReceipt: () => {},
		nextReceiptSeq: () => 1,
		clock: () => 1000,
	});
	const orchestrator = new RecoveryOrchestrator({
		store,
		gateway,
		readSpecHash: () => "spec-hash-1",
		resolveStepTarget: () => "fixture-01",
		clock: () => 1000,
		readCvmContext: () => ({ strategy: "recover", coverage: 0.25, stability: 0.4 }),
	});
	const first = orchestrator.onRefusal(refusal(100));
	assert.ok(first.action, "helmd candidate produced with bridge");
	assert.match(first.action?.rationale ?? "", /cvm=recover coverage=0\.25 stability=0\.40/);
	const second = orchestrator.onRefusal(refusal(200));
	assert.equal(second.action?.source, "helmx");
	assert.match(second.action?.rationale ?? "", /cvm=recover/);
	assert.deepEqual(orchestrator.episodeBudget("S1", 1), { helmd: 1, helmx: 1 }, "CVM does not refill budget");
	const selected = store.journal().filter((r) => r.kind === JOURNAL_KEYS.recoverySelected);
	assert.equal(selected.length, 2);
	const p1 = JSON.parse(selected[0]?.payloadJson ?? "{}") as { cvmStrategy?: string };
	assert.equal(p1.cvmStrategy, "recover", "recovery_selected journals the bridge strategy");
});

test("session streak: second exhaust on same goal journals strategy_shift challenge without refilling budget", () => {
	const store = new Ledger(":memory:");
	const gateway = new ToolGateway({
		readSpec: () => ({ goal: "g", allowedTargets: ["fixture-01"], highRisk: "deny" }),
		budgetGate: () => null,
		journal: () => {},
		recordReceipt: () => {},
		nextReceiptSeq: () => 1,
		clock: () => 1000,
	});
	// One orchestrator for the whole session (product wiring) — streak lives on the instance.
	const orchestrator = new RecoveryOrchestrator({
		store,
		gateway,
		readSpecHash: () => "h",
		resolveStepTarget: () => "fixture-01",
		clock: () => 1000,
	});
	// Step 1 exhaust: helmd + helmx + third refusal
	orchestrator.onRefusal(refusal(100, { stepId: "S1" }));
	orchestrator.onRefusal(refusal(200, { stepId: "S1" }));
	const e1 = orchestrator.onRefusal(refusal(300, { stepId: "S1" }));
	assert.equal(e1.state, "recovery_exhausted");
	const shiftsAfterFirst = store.journal().filter((r) => r.kind === "strategy_shift");
	assert.equal(shiftsAfterFirst.length, 0, "first exhaust is streak=1 — no strategy_shift yet");
	// Step 2 same goal exhaust → streak 2 → strategy_shift
	orchestrator.onRefusal(refusal(400, { stepId: "S2" }));
	orchestrator.onRefusal(refusal(500, { stepId: "S2" }));
	const e2 = orchestrator.onRefusal(refusal(600, { stepId: "S2" }));
	assert.equal(e2.state, "recovery_exhausted");
	const shifts = store.journal().filter((r) => r.kind === "strategy_shift");
	assert.ok(shifts.length >= 1, "second same-goal exhaust journals strategy_shift");
	const payload = JSON.parse(shifts[0]?.payloadJson ?? "{}") as {
		to?: string;
		helmdUsed?: number;
		helmxUsed?: number;
	};
	assert.equal(payload.to, "challenge");
	assert.equal(payload.helmdUsed, 1, "strategy_shift does not refill helmd for the exhausted step");
	assert.equal(payload.helmxUsed, 1, "strategy_shift does not refill helmx for the exhausted step");
	// S2 stays exhausted (per-step budget); strategy_shift is a challenge marker, not a refill.
	assert.deepEqual(orchestrator.episodeBudget("S2", 1), { helmd: 1, helmx: 1 });
});
