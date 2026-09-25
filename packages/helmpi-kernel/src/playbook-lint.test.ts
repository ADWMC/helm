/**
 * lint-playbooks (4 items, W4-T04) — run under `npm test` (gate: npm run check
 * tsgo-covers this file too):
 *   1. all playbooks parse via parsePlaybookYaml (schema sane)
 *   2. every phase `refs` entry resolves to an existing file under references/
 *      (dangling refs fail — reverse.yaml's toolbox ref was the known offender)
 *   3. gate_out values ∈ known set (all_deliverables_have_evidence ...)
 *   4. every phase `next` link points at an existing phase id (closed graph)
 * Plus: finish-gate coverage (I19) lands in the ledger coverage table with a
 * record sample (finish reuses completion.ts — zero change, §5.2).
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { exportReport } from "./export.ts";
import { Ledger } from "./ledger.ts";
import { parsePlaybookYaml } from "./playbook-yaml.ts";

const PB_DIR = new URL("../references/playbooks/", import.meta.url);
const FILES = readdirSync(PB_DIR).filter((f) => f.endsWith(".yaml"));
const REF_ROOT = new URL("../references/", import.meta.url);
const parsed = FILES.map((f) => ({ file: f, pb: parsePlaybookYaml(readFileSync(new URL(f, PB_DIR), "utf8")) }));

test("lint-playbooks#1: every playbook parses (schema sane)", () => {
	assert.ok(parsed.length >= 4, `playbooks: ${FILES.join(",")}`);
	for (const { file, pb } of parsed) {
		assert.ok(pb.id && pb.phases.length > 0, `${file}: id/phases`);
	}
});

test("lint-playbooks#2: phase refs resolve under references/ (dangling → fail)", () => {
	for (const { file, pb } of parsed) {
		for (const ph of pb.phases) {
			for (const r of ph.refs ?? []) {
				const target = join(new URL("./", REF_ROOT).pathname, r);
				assert.ok(existsSync(target), `${file}/${ph.id}: dangling ref ${r}`);
			}
		}
	}
	// the known offender is now wired to this wave's RE pack
	const rev = parsed.find((p) => p.file === "reverse.yaml")!;
	const intake = rev.pb.phases.find((p) => p.id === "intake")!;
	assert.ok((intake.refs ?? []).includes("re/index.md"), "reverse.yaml intake → RE pack");
});

test("lint-playbooks#3: gate_out values are known", () => {
	const KNOWN = new Set(["all_deliverables_have_evidence", "always"]);
	for (const { file, pb } of parsed) {
		for (const ph of pb.phases) {
			assert.ok(KNOWN.has(String(ph.gateOut)), `${file}/${ph.id}: gateOut=${String(ph.gateOut)}`);
		}
	}
});

test("lint-playbooks#4: next links closed (targets exist)", () => {
	for (const { file, pb } of parsed) {
		const ids = new Set(pb.phases.map((p) => p.id));
		for (const ph of pb.phases) {
			for (const n of ph.next ?? []) {
				assert.ok(ids.has(n), `${file}/${ph.id}: next→${n} missing`);
			}
		}
	}
});

test("I19 coverage record lands in ledger coverage table (finish gate zero-change)", () => {
	const dir = mkdtemp();
	try {
		const led = new Ledger(join(dir, "ledger.db"));
		led.setSpec({
			goal: "re chain with coverage gate and measurable record count",
			allowedTargets: ["http://127.0.0.1:18081*"],
			highRisk: "deny",
			maxTokens: 100000,
			requireCoverage: true,
		} as never);
		led.recordCoverage({
			id: "c1",
			surface: "re/packed-elf-entropy-chain: no-network-termination",
			outcome: "clean",
			notes: "checked, no exec attempted",
		} as never);
		const ws = led.workspace();
		assert.equal(ws.coverage?.length, 1, "coverage row present");
		const report = exportReport(led);
		assert.ok(report.includes("## Coverage (I19)"), "report surfaces coverage section");
		const row = { ...(ws.coverage?.[0] ?? {}) };
		assert.ok(row.id, "sample row has id");
		led.close();
	} finally {
		rmSync(dir);
	}
});

function mkdtemp(): string {
	const { mkdtempSync } = fsmod;
	const { tmpdir } = osmod;
	return mkdtempSync(join(tmpdir(), "helm-pblint-"));
}
function rmSync(dir: string): void {
	fsmod.rmSync(dir, { recursive: true, force: true });
}

import * as fsmod from "node:fs";
import * as osmod from "node:os";
