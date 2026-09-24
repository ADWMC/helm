import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_CONFIG, parseConfig } from "./config.ts";
import { CompileError } from "./domain/completion.ts";
import type { Spec } from "./domain/types.ts";
import { Ledger } from "./ledger.ts";
import { enterPhase, readPhaseState, satisfyDeliverable, startPlaybook } from "./phase.ts";
import { parsePlaybookYaml } from "./playbook-yaml.ts";
import { applyProposal, parsePropose } from "./propose.ts";
import { statusText } from "./status.ts";

function reversePb() {
	const yaml = readFileSync(join(process.cwd(), "references/playbooks/reverse.yaml"), "utf8");
	return parsePlaybookYaml(yaml);
}

function tmp() {
	return mkdtempSync(join(tmpdir(), "helmpi-p0-"));
}

const spec: Spec = {
	goal: "analyze sample",
	allowedTargets: ["http://127.0.0.1:18080"],
	highRisk: "deny",
};

test("config analysisMode lite/full/deep + reject invalid", () => {
	assert.equal(DEFAULT_CONFIG.session.analysisMode, "full");
	const c = parseConfig({ version: 1, session: { analysisMode: "lite" } });
	assert.equal(c.session.analysisMode, "lite");
	assert.throws(() => parseConfig({ version: 1, session: { analysisMode: "turbo" } }));
	assert.match(statusText(c), /analysisMode: lite/);
});

test("phase gate denies illegal next without evidence (I11)", () => {
	const dir = tmp();
	try {
		const led = new Ledger(join(dir, "ledger.db"));
		led.setSpec(spec);
		const pb = reversePb();
		startPlaybook(led, pb);
		assert.equal(readPhaseState(led).phaseId, "scope");

		assert.throws(
			() => enterPhase(led, pb, "intake"),
			(e: unknown) => {
				assert.ok(e instanceof CompileError);
				assert.match(String((e as Error).message), /phase gate denied|missing_evidence/);
				return true;
			},
		);

		satisfyDeliverable(led, "goal_and_sample");
		enterPhase(led, pb, "intake");
		assert.equal(readPhaseState(led).phaseId, "intake");

		assert.throws(() => enterPhase(led, pb, "triage"));
		satisfyDeliverable(led, "artifact_hash");
		enterPhase(led, pb, "triage");
		assert.equal(readPhaseState(led).phaseId, "triage");

		led.close();
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

test("applyProposal with phaseId enforces gate before addStep", () => {
	const dir = tmp();
	try {
		const led = new Ledger(join(dir, "ledger.db"));
		led.setSpec(spec);
		const pb = reversePb();
		startPlaybook(led, pb);

		const bad = parsePropose({
			finish: false,
			summary: "jump to intake",
			newStep: {
				id: "s1",
				kind: "discover",
				target: "http://127.0.0.1:18080",
				objective: "intake work",
				doneWhen: "hash recorded",
				phaseId: "intake",
			},
		});
		assert.throws(
			() => applyProposal(led, bad, { playbook: pb }),
			(e: unknown) => {
				assert.ok(e instanceof CompileError);
				return true;
			},
		);
		assert.equal(led.steps().length, 0);

		satisfyDeliverable(led, "goal_and_sample");
		const good = parsePropose({
			finish: false,
			summary: "start scope work",
			newStep: {
				id: "s0",
				kind: "discover",
				target: "http://127.0.0.1:18080",
				objective: "state goal",
				doneWhen: "goal recorded",
				phaseId: "scope",
			},
		});
		applyProposal(led, good, { playbook: pb });
		assert.equal(led.steps().length, 1);
		assert.equal(readPhaseState(led).phaseId, "scope");

		led.close();
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});
