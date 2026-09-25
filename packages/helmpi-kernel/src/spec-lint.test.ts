/**
 * W3-T01: Spec 特异性 lint L1–L6 (§2.7.1) + report audit line (§2.7 #11c).
 * "lint 不过 = Spec 非法" negatives: vague blocked, unmeasurable blocked,
 * measurable-without-diagnosticSet blocked, L4 never fires, L5 scale explicit.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { lintHelmSpec } from "./spec-lint.ts";

const base = {
	goal: "Find IDOR on /notes (user ids 1..3) and unit price fields on /cart for weblab",
	allowedTargets: ["http://127.0.0.1:18081"],
	maxTokens: 100_000,
	diagnosticSet: ["unit price", "notes id"],
};

test("valid Spec passes all rules (L4 structurally absent)", () => {
	assert.deepEqual(lintHelmSpec(base), []);
});

test("L6: vague goal → block (clarify first), no cascade noise", () => {
	const f = lintHelmSpec({ ...base, goal: "看看这个网站安不安全" });
	assert.equal(f.length, 1);
	assert.equal(f[0]?.rule, "L6");
	const en = lintHelmSpec({ ...base, goal: "find the best deal on this site for us" });
	assert.equal(en[0]?.rule, "L6");
});

test("L1: short or unmeasurable goal rejected", () => {
	const f1 = lintHelmSpec({ ...base, goal: "secure the app" });
	assert.ok(
		f1.some((x) => x.rule === "L1"),
		JSON.stringify(f1),
	);
	const f2 = lintHelmSpec({ ...base, goal: "x" });
	assert.ok(f2.some((x) => x.rule === "L1"));
});

test("L2: measurable goal without diagnosticSet rejected (评分#11)", () => {
	const { diagnosticSet: _omit, ...rest } = base;
	const f = lintHelmSpec(rest);
	assert.ok(
		f.some((x) => x.rule === "L2"),
		JSON.stringify(f),
	);
	// empty array also rejected
	const f2 = lintHelmSpec({ ...base, diagnosticSet: [] });
	assert.ok(f2.some((x) => x.rule === "L2"));
});

test("L3: diagnosticSet tokens must touch the goal", () => {
	const f = lintHelmSpec({ ...base, diagnosticSet: ["quantum-flux-capacitor", "wibble"] });
	assert.ok(
		f.some((x) => x.rule === "L3"),
		JSON.stringify(f),
	);
});

test("L4: cost phrasing never linted (负面规则)", () => {
	// wording about cost/budget phrasing is irrelevant — must not produce L4 (no such rule id)
	const f = lintHelmSpec({ ...base, goal: `${base.goal} within cost budget` });
	assert.ok(!f.some((x) => x.rule === ("L4" as never)));
});

test("L5: empty targets or non-positive budget rejected", () => {
	const f1 = lintHelmSpec({ ...base, allowedTargets: [] });
	assert.ok(
		f1.some((x) => x.rule === "L5"),
		JSON.stringify(f1),
	);
	const f2 = lintHelmSpec({ ...base, maxTokens: 0 });
	assert.ok(f2.some((x) => x.rule === "L5"));
});

test("report evidenceAudit contract (§2.7 #11c): fields + note present", async () => {
	const { mkdtempSync, rmSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const { Ledger } = await import("./ledger.ts");
	const dir = mkdtempSync(join(tmpdir(), "helm-audit-"));
	try {
		const led = new Ledger(join(dir, "ledger.db"));
		led.setSpec({ ...base } as never);
		led.setRunStatus("running");
		led.addClaim({
			id: "c1",
			role: "fact",
			description: "x",
			evidenceRefs: ["o1"],
			creator: "t",
			createdAt: Date.now(),
		});
		const { exportReportJson } = await import("./export.ts");
		const json = exportReportJson(led) as { evidenceAudit?: Record<string, unknown> };
		const audit = json.evidenceAudit;
		assert.ok(audit, "evidenceAudit present");
		assert.equal(typeof audit?.acquisition, "number");
		assert.equal(typeof audit?.utilization, "number");
		assert.match(String(audit?.note), /no-check is not a cannot-use/);
		assert.match(String(audit?.note), /non-negotiable/);
		assert.equal(audit?.utilization, 1, "claim with basis counts as utilization");
		led.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
