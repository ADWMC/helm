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
