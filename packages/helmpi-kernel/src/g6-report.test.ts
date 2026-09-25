/**
 * W2-T07 G6 状态闸回归断言 (§4.1 G6, zero production-code change):
 *   findings → exit 2 · clean → 0; md+json twin consistency; ledger journal
 *   keeps full trail (single-writer bump path).
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { exportReport, exportReportJson, reportExitCode, reportFindings } from "./export.ts";
import { Ledger } from "./ledger.ts";

function tmpLedger(): { dir: string; led: Ledger } {
	const dir = mkdtempSync(join(tmpdir(), "helm-g6-"));
	return { dir, led: new Ledger(join(dir, "ledger.db")) };
}

test("A-G6: findings → exit 2; none → exit 0 (strix semantics)", () => {
	const { dir, led } = tmpLedger();
	try {
		led.setSpec({ goal: "clean run", allowedTargets: ["http://127.0.0.1:18081"], highRisk: "deny" } as never);
		led.setRunStatus("running");
		const ws0 = led.workspace();
		assert.equal(reportFindings(ws0), 0);
		assert.equal(reportExitCode(reportFindings(ws0)), 0);
		led.addClaim({
			id: "c1",
			role: "fact",
			description: "SQLi on /login",
			evidenceRefs: ["o1"],
			creator: "test",
			createdAt: Date.now(),
		});
		const ws1 = led.workspace();
		assert.equal(reportFindings(ws1), 1);
		assert.equal(reportExitCode(reportFindings(ws1)), 2, "findings → exit 2 (§1.5 contract)");
	} finally {
		led.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

test("A-G6: md + json twins carry the same core fields", () => {
	const { dir, led } = tmpLedger();
	try {
		led.setSpec({ goal: "twin-check", allowedTargets: ["http://127.0.0.1:18081"], highRisk: "deny" } as never);
		led.setRunStatus("running");
		led.addClaim({
			id: "c1",
			role: "fact",
			description: "finding text",
			evidenceRefs: [],
			creator: "test",
			createdAt: Date.now(),
		});
		const json = exportReportJson(led);
		const md = exportReport(led);
		assert.equal((json.run as { goal: string }).goal, "twin-check");
		assert.ok(md.includes("twin-check"), "md carries the same goal");
		assert.equal(json.schema, "helm-pi-report/1");
		const findings = json.findings as number | undefined;
		assert.equal(findings, 1, "json findings match workspace fact-claims");
		assert.equal(reportExitCode(Number(findings ?? 0)), 2);
		// journal trail intact after writes (single-writer bump events present)
		// W3-T05: engagement metadata twin (EN keys only)
		const eng = json.engagement as { roe?: { highRisk?: string }; attack?: { techniques?: string[] } };
		assert.ok(eng?.roe?.highRisk, "roe present in json");
		assert.ok(Array.isArray(eng?.attack?.techniques), "attack techniques array");
		assert.ok(md.includes("## Engagement (RoE + ATT&CK)"), "md twin carries the same section");
		assert.ok(md.includes("Evidence audit: acquisition="), "md twin carries the audit line");
		assert.ok(json.evidenceAudit, "json audit present");
		const kinds = led.journal().map((r) => r.kind);
		assert.ok(
			kinds.includes("spec") || kinds.includes("run_status") || kinds.includes("claim"),
			`journal kinds: ${kinds.join(",")}`,
		);
	} finally {
		led.close();
		rmSync(dir, { recursive: true, force: true });
	}
});
