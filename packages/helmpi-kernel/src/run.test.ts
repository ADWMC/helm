import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CompileError } from "./domain/completion.ts";
import type { Spec } from "./domain/types.ts";
import { exportReport, exportReportJson, reportExitCode, reportFindings } from "./export.ts";
import { Ledger } from "./ledger.ts";
import { emergencyStop, FileEchoExecutor, runLoop } from "./loop.ts";
import { checkGateOut } from "./playbook.ts";
import { parsePlaybookYaml } from "./playbook-yaml.ts";
import { applyProposal, compileProposal, parsePropose } from "./propose.ts";
import { reconcileRun } from "./recover.ts";
import { blockIfCapped, checkSameTool, checkStepToolCap } from "./supervise.ts";

function tmp(): string {
	return mkdtempSync(join(tmpdir(), "helmpi-run-"));
}

function baseSpec(): Spec {
	return {
		goal: "Capture the flag from authorized target.",
		allowedTargets: ["http://127.0.0.1:8080"],
		highRisk: "deny",
	};
}

function ledgerWithSpec(dir: string): Ledger {
	const led = new Ledger(join(dir, "ledger.db"));
	led.setSpec(baseSpec());
	led.setRunStatus("running");
	return led;
}

test("scope denial journals scope_denied before throw (I14)", () => {
	const dir = tmp();
	let led: Ledger | null = null;
	try {
		led = ledgerWithSpec(dir);
		assert.throws(
			() =>
				applyProposal(led!, {
					finish: false,
					summary: "escape attempt",
					newStep: {
						id: "evil1",
						kind: "discover",
						target: "http://evil.example",
						objective: "probe",
						doneWhen: "anything",
					},
				}),
			(e: unknown) => e instanceof CompileError && e.code === "target_out_of_scope",
		);
		const denials = led.journal().filter((r) => r.kind === "scope_denied");
		assert.equal(denials.length, 1, "denial must be journaled once");
		const payload = JSON.parse(denials[0]!.payloadJson) as {
			target: string;
			stepId: string;
			reason: string;
		};
		assert.equal(payload.target, "http://evil.example");
		assert.equal(payload.stepId, "evil1");
		// reason may come from either gate (matcher or shape check) — both wordings count
		assert.match(payload.reason, /target_not_allowed|out.of.scope/i);
		const revs = led.journal().map((r) => r.revision);
		for (let i = 1; i < revs.length; i++) {
			assert.equal(revs[i], revs[i - 1]! + 1, "I1 stays contiguous after journalEvent");
		}
	} finally {
		try {
			led?.close();
		} catch {
			/* already closed */
		}
		rmSync(dir, { recursive: true, force: true });
	}
});

test("step tool cap verdict carries instead path", () => {
	const cfg = { enabled: true, sameToolLimit: 3, stepToolCap: 2 };
	const v = checkStepToolCap(cfg, 2);
	assert.equal(v.blockStep, true);
	assert.ok(v.instead && v.instead.length > 0, "Dark-Moon style why+instead");
});

test("recordCoverage round-trips; waiver journal flips I19 flag", () => {
	const dir = tmp();
	let led: Ledger | null = null;
	try {
		led = ledgerWithSpec(dir);
		const cov = led.recordCoverage({ id: "c1", surface: "/login", outcome: "clean" });
		assert.equal(cov.surface, "/login");
		const ws1 = led.workspace();
		assert.equal(ws1.coverage?.length, 1);
		assert.equal(ws1.coverageWaived, false);

		led.journalEvent("coverage-waived", {
			by: "op",
			reason: "no enumerable surfaces in lab",
		});
		assert.equal(led.workspace().coverageWaived, true);

		const revs = led.journal().map((r) => r.revision);
		for (let i = 1; i < revs.length; i++) {
			assert.equal(revs[i], revs[i - 1]! + 1, "I1 contiguous after coverage/waiver");
		}
	} finally {
		try {
			led?.close();
		} catch {
			/* already closed */
		}
		rmSync(dir, { recursive: true, force: true });
	}
});

test("export layers evidence status and coverage (I19)", () => {
	const dir = tmp();
	let led: Ledger | null = null;
	try {
		led = ledgerWithSpec(dir);
		led.recordCoverage({ id: "c1", surface: "/admin/config", outcome: "clean" });
		const rep = exportReport(led);
		assert.match(rep, /## Evidence status/);
		assert.match(rep, /exploited · \d+ confirmed · \d+ unconfirmed/);
		assert.match(rep, /## Coverage \(I19\)/);
		assert.match(rep, /\[clean\] `\/admin\/config`/);
	} finally {
		try {
			led?.close();
		} catch {
			/* already closed */
		}
		rmSync(dir, { recursive: true, force: true });
	}
});

test("Spec.maxTokens trips token budget as I10-class failure", async () => {
	const dir = tmp();
	let led: Ledger | null = null;
	try {
		led = ledgerWithSpec(dir);
		led.setSpec({ ...baseSpec(), maxTokens: 10 });
		let n = 0;
		const result = await runLoop(led, {
			executor: new FileEchoExecutor(new Map()),
			estimateTokens: () => 6, // 1st propose: 6<10 · 2nd: 12>=10 → trip
			proposer: () => {
				n += 1;
				return {
					finish: false,
					summary: `p${n}`,
					newStep: {
						id: `s${n}`,
						kind: "discover",
						target: "http://127.0.0.1:8080",
						objective: "map",
						doneWhen: `round ${n} recorded`,
					},
				};
			},
		});
		assert.equal(result.status, "failed");
		assert.equal(result.message, "token_budget_exhausted");
		assert.equal(led.runStatus(), "failed", "budget failure is terminal, not completed");
		const conv = led
			.journal()
			.concat()
			.map((r) => `${r.kind}:${r.payloadJson}`)
			.filter((s) => s.includes("token_budget"));
		// diagnostic carries the numbers; journal records the failed transition
		assert.ok(conv.some((s) => s.includes("failed")) || led.runStatus() === "failed");
	} finally {
		try {
			led?.close();
		} catch {
			/* already closed */
		}
		rmSync(dir, { recursive: true, force: true });
	}
});

test("tokens_used persists across Ledger restart", () => {
	const dir = tmp();
	let led: Ledger | null = null;
	try {
		const p = join(dir, "ledger.db");
		const first = new Ledger(p);
		first.saveRunState(new Map([["discover", 1]]), 3, 42);
		first.close();

		led = new Ledger(p);
		const st = led.hydrateRunState();
		assert.equal(st.tokensUsed, 42, "tokens survive restart");
		assert.equal(st.decisionsUsed, 3, "decisions survive restart");
		assert.equal(st.kindStreak.get("discover"), 1, "streak survives restart");
		// 2-arg save keeps tokens (COALESCE), updates decisions
		led.saveRunState(new Map([["discover", 2]]), 4);
		const st2 = led.hydrateRunState();
		assert.equal(st2.tokensUsed, 42, "tokens untouched by 2-arg save");
		assert.equal(st2.decisionsUsed, 4, "decisions updated by 2-arg save");
		assert.equal(st2.kindStreak.get("discover"), 2, "streak updated");
	} finally {
		try {
			led?.close();
		} catch {
			/* already closed */
		}
		rmSync(dir, { recursive: true, force: true });
	}
});

test("api playbook parses with attack T-ids (Wave 4)", async () => {
	const { readFileSync } = await import("node:fs");
	const raw = readFileSync(join(process.cwd(), "references", "playbooks", "api.yaml"), "utf8");
	const pb = parsePlaybookYaml(raw);
	assert.equal(pb.id, "api");
	assert.ok(pb.phases.length >= 5, "api playbook has full phase chain");
	assert.deepEqual(pb.attack, ["T1190", "T1078"]);
	// T639 removed: zero hits in local Anthropic-Skills ATT&CK mappings (宁缺勿猜)
	// gate chain usable: scope -> recon
	assert.ok(pb.phases[0]!.next.includes("recon"));
});

test("attack id format enforced (invalid rejected)", () => {
	assert.throws(
		() =>
			parsePlaybookYaml(
				"schema: 1\nid: x\ntitle: X\nattack: [T1190, BOGUS]\nphases:\n  - id: a\n    title: A\n    deliverables:\n      - key: k\n        description: d\n    next: []\n",
			),
		/invalid attack id/,
	);
});

test("report JSON twin + findings exit code (Wave 4)", () => {
	const dir = tmp();
	let led: Ledger | null = null;
	try {
		led = ledgerWithSpec(dir);
		const j1 = exportReportJson(led);
		assert.equal(j1.schema, "helm-pi-report/1");
		assert.equal(reportFindings(led.workspace()), 0);
		assert.equal(reportExitCode(Number(j1.findings)), 0, "clean run exits 0");

		led.addClaim({
			id: "f1",
			role: "fact",
			description: "IDOR confirmed",
			evidenceRefs: ["E-003"],
			creator: "cli",
			createdAt: Date.now(),
		});
		const j2 = exportReportJson(led);
		assert.equal(j2.findings, 1);
		assert.equal(reportExitCode(Number(j2.findings)), 2, "findings exit 2");
		assert.ok(Array.isArray(j2.diagnostics), "json twin carries diagnostics (I6: not evidence)");

		const md = exportReport(led);
		assert.match(md, /## Diagnostics \(operator view — NOT evidence, I6\)/);
	} finally {
		try {
			led?.close();
		} catch {
			/* already closed */
		}
		rmSync(dir, { recursive: true, force: true });
	}
});

test("ledger revision contiguous journal (I1)", () => {
	const dir = tmp();
	try {
		const led = new Ledger(join(dir, "ledger.db"));
		led.setSpec(baseSpec());
		led.setRunStatus("running");
		led.addHint({ id: "h1", content: "focus 80", creator: "op", createdAt: Date.now() });
		const revs = led.journal().map((r) => r.revision);
		assert.deepEqual(
			revs,
			[...revs].sort((a, b) => a - b),
		);
		assert.equal(revs[0], 0);
		for (let i = 1; i < revs.length; i++) {
			assert.equal(revs[i], revs[i - 1]! + 1);
		}
		led.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("run_state persists across Ledger restart (I10 cross-process)", async () => {
	const dir = tmp();
	try {
		const p = join(dir, "ledger.db");
		let led = new Ledger(p);
		led.setSpec(baseSpec());
		led.setRunStatus("running");
		led.saveRunState(new Map([["discover", 1]]), 0);
		led.close();

		// Simulated process restart: fresh Ledger handle over the same file.
		led = new Ledger(p);
		const state = led.hydrateRunState();
		assert.equal(state.kindStreak.get("discover"), 1);

		const result = await runLoop(led, {
			sameKindLimit: 1,
			executor: new FileEchoExecutor(new Map()),
			proposer: () => ({
				finish: false,
				summary: "same kind probe",
				newStep: {
					id: "s1",
					kind: "discover",
					target: "http://127.0.0.1:8080",
					objective: "map services",
					doneWhen: "services listed",
				},
			}),
		});
		// Streak survived the restart → budget trips instead of silently resetting.
		assert.equal(result.status, "failed");
		assert.equal(result.message, "convergence_exhausted");
		led.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("reconcileRun journals recovered once; revisions stay contiguous", () => {
	const dir = tmp();
	try {
		const led = ledgerWithSpec(dir);
		led.addStep({
			id: "s1",
			kind: "discover",
			target: "http://127.0.0.1:8080",
			objective: "map",
			doneWhen: "services listed",
			basisIds: [],
			dependsOn: [],
			status: "ready",
			createdRevision: led.revision(),
		});

		const first = reconcileRun(led);
		assert.equal(first.recovered, true);
		const second = reconcileRun(led);
		assert.equal(second.recovered, false);

		const entries = led.journal();
		assert.equal(entries.filter((e) => e.kind === "recovered").length, 1, "recovered must be journaled exactly once");
		const revs = entries.map((e) => e.revision);
		assert.equal(revs[0], 0);
		for (let i = 1; i < revs.length; i++) {
			assert.equal(revs[i], revs[i - 1]! + 1, "I1 journal stays contiguous");
		}
		led.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("proposal finish with open step rejected (I8)", () => {
	const dir = tmp();
	try {
		const led = ledgerWithSpec(dir);
		led.addStep({
			id: "s1",
			kind: "discover",
			target: "http://127.0.0.1:8080",
			objective: "map",
			doneWhen: "services listed",
			basisIds: [],
			dependsOn: [],
			status: "ready",
			createdRevision: led.revision(),
		});
		assert.throws(
			() =>
				applyProposal(led, {
					finish: true,
					summary: "done early",
					finishBasisIds: [],
				}),
			(e: unknown) => {
				assert.ok(e instanceof CompileError);
				assert.equal(e.code, "finish_with_open_steps");
				return true;
			},
		);
		led.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("out-of-scope newStep rejected at compile (I13)", () => {
	const dir = tmp();
	try {
		const led = ledgerWithSpec(dir);
		const ws = led.workspace();
		assert.throws(
			() =>
				compileProposal(ws, {
					finish: false,
					summary: "bad target",
					newStep: {
						id: "s1",
						kind: "discover",
						target: "http://evil.test",
						objective: "x",
						doneWhen: "y",
					},
					nextStepId: "s1",
				}),
			(e: unknown) => {
				assert.ok(e instanceof CompileError);
				return true;
			},
		);
		led.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("run loop: discover step done with grounded doneWhen then finish", async () => {
	const dir = tmp();
	try {
		const led = ledgerWithSpec(dir);
		const doneWhen = "services: 80,443";
		const queue = [
			{
				finish: false as const,
				summary: "start discover",
				newStep: {
					id: "d1",
					kind: "discover" as const,
					target: "http://127.0.0.1:8080",
					objective: "map http surface",
					doneWhen,
				},
				nextStepId: "d1",
			},
			{
				finish: true as const,
				summary: "finished with evidence",
				finishBasisIds: ["obs-d1-x"],
			},
		];
		// Executor outputs doneWhen string so excerpt grounds
		const result = await runLoop(led, {
			maxDecisions: 10,
			executor: new FileEchoExecutor(new Map([["*", `scan\n${doneWhen}\n`]])),
			proposer: () => {
				const d = queue.shift();
				if (!d) throw new Error("queue empty");
				if (d.finish && d.finishBasisIds[0] === "obs-d1-x") {
					const obs = led.observations()[0];
					if (obs) d.finishBasisIds = [obs.id];
				}
				return d;
			},
		});
		assert.equal(result.status, "completed");
		const ws = led.workspace();
		assert.equal(ws.runStatus, "completed");
		const step = ws.steps.find((s) => s.id === "d1");
		assert.equal(step?.status, "done");
		assert.ok(ws.observations.length >= 1);
		led.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("run loop HELPI_RUN=0 pauses", async () => {
	const dir = tmp();
	process.env.HELPI_RUN = "0";
	try {
		const led = ledgerWithSpec(dir);
		assert.equal(emergencyStop(), true);
		const r = await runLoop(led, {
			executor: new FileEchoExecutor(new Map()),
			proposer: () => ({ finish: false, summary: "x" }),
		});
		assert.equal(r.status, "paused");
		led.close();
	} finally {
		delete process.env.HELPI_RUN;
		rmSync(dir, { recursive: true, force: true });
	}
});

test("convergence same-kind limit fails run (I10)", async () => {
	const dir = tmp();
	try {
		const led = ledgerWithSpec(dir);
		// pre-create many done discover steps to inflate streak
		// streak counted when step completes in loop; instead test supervise + decision path
		// Use proposer that always adds discover after completing via executor
		let n = 0;
		const result = await runLoop(led, {
			maxDecisions: 20,
			sameKindLimit: 3,
			executor: new FileEchoExecutor(new Map([["*", "target ok\n"]])),
			proposer: () => {
				n += 1;
				if (n <= 3) {
					return {
						finish: false,
						summary: `discover ${n}`,
						newStep: {
							id: `d${n}`,
							kind: "discover",
							target: "http://127.0.0.1:8080",
							objective: "again",
							doneWhen: "target ok",
						},
						nextStepId: `d${n}`,
					};
				}
				return {
					finish: false,
					summary: `discover ${n}`,
					newStep: {
						id: `d${n}`,
						kind: "discover",
						target: "http://127.0.0.1:8080",
						objective: "again",
						doneWhen: "target ok",
					},
					nextStepId: `d${n}`,
				};
			},
		});
		// after 3 done discovers, 4th propose with discover should hit limit
		assert.equal(result.status, "failed");
		assert.equal(result.message, "convergence_exhausted");
		led.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("hint and approve recorded separately from claims (I17)", () => {
	const dir = tmp();
	try {
		const led = ledgerWithSpec(dir);
		led.addHint({ id: "h1", content: "try 8080 upload", creator: "op", createdAt: Date.now() });
		led.approve("step", "s9", true, "op");
		const ws = led.workspace();
		assert.equal(ws.hints.length, 1);
		assert.equal(ws.claims.filter((c) => c.role === "fact").length, 0);
		assert.equal(led.isApproved("step", "s9"), true);
		led.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("reopen-like: completed run can be set running again via setRunStatus", () => {
	const dir = tmp();
	try {
		const led = ledgerWithSpec(dir);
		led.setRunStatus("completed", "was done");
		led.setRunStatus("running", "reopen");
		assert.equal(led.runStatus(), "running");
		led.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("supervise same tool and step cap", () => {
	const cfg = { enabled: true, sameToolLimit: 5, stepToolCap: 10 };
	assert.equal(checkSameTool(cfg, 4).injectDiagnostic, false);
	assert.equal(checkSameTool(cfg, 5).injectDiagnostic, true);
	const dir = tmp();
	try {
		const led = ledgerWithSpec(dir);
		led.addStep({
			id: "s1",
			kind: "test",
			target: "http://127.0.0.1:8080",
			objective: "t",
			doneWhen: "x",
			basisIds: [],
			dependsOn: [],
			status: "active",
			createdRevision: 1,
		});
		assert.equal(blockIfCapped(led, cfg, "s1", 10), true);
		assert.equal(led.steps().find((s) => s.id === "s1")?.status, "blocked");
		led.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("export report marks structural vs semantic", () => {
	const dir = tmp();
	let led: Ledger | null = null;
	try {
		led = ledgerWithSpec(dir);
		const md = exportReport(led);
		assert.match(md, /Structured finish basis/);
		assert.match(md, /semantic needs GoalVerifier|NOT proven/i);
		led.close();
		led = null;
	} finally {
		if (led) {
			try {
				led.close();
			} catch {
				/* ignore */
			}
		}
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore EPERM */
		}
	}
});

test("ctf playbook gates load", () => {
	const text = readFileSync(join(process.cwd(), "references/playbooks/ctf.yaml"), "utf8");
	const pb = parsePlaybookYaml(text);
	assert.equal(pb.id, "ctf");
	const g = checkGateOut(pb, "recon", new Set());
	assert.equal(g.ok, false);
	const g2 = checkGateOut(pb, "recon", new Set(["surface_map"]));
	assert.equal(g2.ok, true);
});

test("parsePropose requires doneWhen on newStep", () => {
	assert.throws(() =>
		parsePropose({
			finish: false,
			summary: "x",
			newStep: { id: "a", kind: "discover", target: "t", objective: "o", doneWhen: " " },
		}),
	);
});
