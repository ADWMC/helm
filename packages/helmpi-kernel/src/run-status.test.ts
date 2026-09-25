/**
 * W5-T07 ③ Run-state rendering (READ-ONLY): phase gates + budget six-col from
 * the last token_checkpoint + latest instead lines; degrades gracefully when
 * dbs are absent. Seeds REAL phase.db (same home path as live sessions — kernel
 * suite runs with --test-concurrency=1, serial-safe).
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Ledger } from "./ledger.ts";
import { runStatusLines } from "./status.ts";

function seedPhase(): void {
	const db = join(homedir(), ".helm", "agent", "phase.db");
	mkdirSync(join(homedir(), ".helm", "agent"), { recursive: true });
	const pl = new Ledger(db);
	pl.journalEvent("token_checkpoint", {
		input: 100,
		output: 50,
		cacheRead: 10,
		cacheWrite: 5,
		reasoning: 7,
		grand_total_with_cache: 172,
		turnIndex: 5,
	});
	pl.journalEvent("instead", {
		why: "same tool repeated 4x (limit 3) — bounded ladder",
		instead: "change angle",
		source: "streak",
	});
	pl.close();
}

test("runStatusLines: phase gates + budget six-col + instead line (read-only)", () => {
	const cwd = mkdtempSync(join(tmpdir(), "helm-ux-"));
	try {
		mkdirSync(join(cwd, ".helm"), { recursive: true });
		const led = new Ledger(join(cwd, ".helm", "ledger.db"));
		led.setSpec({
			goal: "ux render check with measurable steps 2",
			allowedTargets: ["http://127.0.0.1:18081*"],
			highRisk: "deny",
			maxTokens: 100000,
		} as never);
		led.setRunStatus("running");
		led.addStep({
			id: "s1",
			kind: "recon",
			target: "local",
			objective: "o",
			doneWhen: "x",
			basisIds: [],
			dependsOn: [],
			status: "done",
			turn: 1,
			createdRevision: 1,
		} as never);
		led.addStep({
			id: "s2",
			kind: "recon",
			target: "local",
			objective: "o",
			doneWhen: "y",
			basisIds: [],
			dependsOn: [],
			status: "active",
			turn: 1,
			createdRevision: 2,
		} as never);
		led.close();
		seedPhase();

		const lines = runStatusLines(cwd);
		const joined = lines.join("\n");
		assert.match(joined, /run: running/, "run status line");
		assert.match(joined, /steps: done=1 active=1/, "phase gates (step counts)");
		assert.match(
			joined,
			/budget: in=100 out=50 cacheR=10 cacheW=5 reasoning=7 grand=172\/100000 \(checkpoint@turn 5\)/,
			"budget six-col + limit",
		);
		assert.match(joined, /instead: same tool repeated 4x/, "instead escalation line surfaced");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("runStatusLines: missing dbs → empty (degrades to config status)", () => {
	const cwd = mkdtempSync(join(tmpdir(), "helm-ux-empty-"));
	try {
		const lines = runStatusLines(cwd);
		// phase.db may exist from other tests; ledger absent → no run/steps lines
		assert.ok(!lines.some((l) => l.startsWith("run:")), "no run line without ledger");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
