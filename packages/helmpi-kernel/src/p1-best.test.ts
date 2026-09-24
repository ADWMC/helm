import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Spec as SpecT } from "./domain/types.ts";
import type { ProposeDecision } from "./ledger.ts";
import { Ledger } from "./ledger.ts";
import { FileEchoExecutor, runLoop } from "./loop.ts";
import { enterPhase, readPhaseState, satisfyDeliverable, startPlaybook } from "./phase.ts";
import { parsePlaybookYaml } from "./playbook-yaml.ts";
import { parsePropose } from "./propose.ts";

function loadPb(id: string) {
	return parsePlaybookYaml(readFileSync(join(process.cwd(), "references/playbooks", `${id}.yaml`), "utf8"));
}

function tmp() {
	return mkdtempSync(join(tmpdir(), "helmpi-p1-"));
}

const spec: SpecT = {
	goal: "web lab",
	allowedTargets: ["http://127.0.0.1:18080"],
	highRisk: "deny",
};

test("web-pentest playbook parses with gateable phases", () => {
	const pb = loadPb("web-pentest");
	assert.equal(pb.id, "web-pentest");
	const ids = pb.phases.map((p) => p.id);
	assert.deepEqual(ids, ["scope", "recon", "enum", "test", "exploit", "verify", "report", "close"]);
	// cannot enter recon without allowed_targets
	const ledDir = tmp();
	try {
		const led = new Ledger(join(ledDir, "ledger.db"));
		led.setSpec(spec);
		startPlaybook(led, pb);
		assert.throws(() => enterPhase(led, pb, "recon"));
		satisfyDeliverable(led, "allowed_targets");
		enterPhase(led, pb, "recon");
		assert.equal(readPhaseState(led).phaseId, "recon");
		// recon needs two keys
		satisfyDeliverable(led, "endpoint_inventory");
		assert.throws(() => enterPhase(led, pb, "enum"));
		satisfyDeliverable(led, "tech_surface");
		enterPhase(led, pb, "enum");
		led.close();
	} finally {
		try {
			rmSync(ledDir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

test("ctf playbook gate chain scope→recon", () => {
	const pb = loadPb("ctf");
	const ledDir = tmp();
	try {
		const led = new Ledger(join(ledDir, "ledger.db"));
		led.setSpec(spec);
		startPlaybook(led, pb);
		assert.throws(() => enterPhase(led, pb, "recon"));
		satisfyDeliverable(led, "origin_goal");
		enterPhase(led, pb, "recon");
		led.close();
	} finally {
		try {
			rmSync(ledDir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

test("loop: multi-phase completion path (not wall-clock)", async () => {
	const ledDir = tmp();
	try {
		const led = new Ledger(join(ledDir, "ledger.db"));
		led.setSpec(spec);
		led.setRunStatus("running");
		const pb = loadPb("ctf");
		startPlaybook(led, pb);

		const doneWhenMap: Record<string, string> = {
			s1: "origin goal recorded",
			s2: "surface map ready",
			s3: "flag captured",
			s4: "oracle matched",
			s5: "walkthrough written",
		};
		const phases = ["scope", "recon", "exploit", "verify", "close"];
		const keys = ["origin_goal", "surface_map", "foothold_evidence", "oracle_match", "walkthrough"];
		const _i = 0;
		const queue: ProposeDecision[] = phases.map(
			(phaseId, idx) =>
				({
					finish: false,
					summary: `phase ${phaseId}`,
					newStep: {
						id: `s${idx + 1}`,
						kind: idx === 0 ? "discover" : idx < 3 ? "test" : "verify",
						target: "http://127.0.0.1:18080",
						objective: `work in ${phaseId}`,
						doneWhen: doneWhenMap[`s${idx + 1}`]!,
						phaseId,
					},
					nextStepId: `s${idx + 1}`,
				}) as ProposeDecision,
		);
		// after last step done, finish with its observation — loop handles via proposer
		const executor = new FileEchoExecutor(
			new Map(Object.entries(doneWhenMap).map(([id, dw]) => [id, `ok\n${dw}\n`])),
		);
		const result = await runLoop(led, {
			maxDecisions: 20,
			executor,
			playbook: pb,
			supervise: { enabled: true, sameToolLimit: 5, stepToolCap: 100 },
			proposer: () => {
				if (queue.length > 0) {
					const d = queue.shift()!;
					if ("newStep" in d && d.newStep) {
						const idx = Number(String(d.newStep.id).replace("s", "")) - 1;
						const _key = keys[idx]!;
						// satisfy previous phase deliverables before enter happens inside applyProposal
						// We satisfy current phase keys after enter — satisfy BEFORE enter for gate_out of prior
						if (idx > 0) {
							satisfyDeliverable(led, keys[idx - 1]!);
						} else {
							// first enter needs no prior gate beyond start
						}
					}
					return d;
				}
				const obs = led.observations().at(-1);
				if (!obs) throw new Error("no observation for finish");
				return {
					finish: true,
					summary: "ctf phases complete",
					finishBasisIds: [obs.id],
				};
			},
		});
		// First proposal: phase scope with no prior satisfy — startPlaybook already at scope,
		// phaseId===scope stays, OK
		assert.ok(["completed", "failed"].includes(result.status), `status=${result.status} msg=${result.message}`);
		if (result.status === "failed") {
			// If gate rejected, should be phase-related — fail test with message
			throw new Error(result.message);
		}
		assert.equal(led.runStatus(), "completed");
		assert.ok(led.observations().length >= 1);
		led.close();
	} finally {
		try {
			rmSync(ledDir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

test("loop supervise stepToolCap blocks step (attempt proxy)", async () => {
	const ledDir = tmp();
	try {
		const led = new Ledger(join(ledDir, "ledger.db"));
		led.setSpec(spec);
		led.setRunStatus("running");
		let n = 0;
		const result = await runLoop(led, {
			maxDecisions: 3,
			maxAttemptsPerStep: 10,
			executor: {
				run: () => {
					n += 1;
					// never embed doneWhen → stays on active, attempts grow
					return { seq: n, stdout: "nope\n", stderr: "", exitCode: 0 };
				},
			},
			supervise: { enabled: true, sameToolLimit: 5, stepToolCap: 3 },
			proposer: () => {
				if (n === 0 && led.steps().length === 0) {
					return parsePropose({
						finish: false,
						summary: "start long step",
						newStep: {
							id: "long1",
							kind: "discover",
							target: "http://127.0.0.1:18080",
							objective: "keep going",
							doneWhen: "never appears in output",
						},
					});
				}
				return parsePropose({ finish: false, summary: "idle" });
			},
		});
		const st = led.steps().find((s) => s.id === "long1");
		assert.equal(st?.status, "blocked");
		const diags = led
			.diagnostics(20)
			.map((d) => `${d.kind}:${d.message}`)
			.join("|");
		assert.match(diags, /supervise/);
		led.close();
		void result;
	} finally {
		try {
			rmSync(ledDir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});
