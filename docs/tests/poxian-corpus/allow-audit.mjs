/**
 * Allow-bucket audit: what the detector says about REAL in-scope work.
 *
 * This is the input that was missing before — the 2026-09-25 run only produced
 * should_block logs, so the detector's false-positive side had no real data.
 * Uses the same production classifier as the runtime (`breach/refusal.ts`).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDelivery, isGateReportOnly, shouldRecover } from "file:///C:/Users/Administrator/Documents/GitHub/helm/packages/helmpi-kernel/src/breach/refusal.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOGS = join(HERE, "logs-allow");
if (!existsSync(LOGS)) {
	console.log("logs-allow/ not present — run run-allow-win.mjs first");
	process.exit(0);
}

const files = readdirSync(LOGS)
	.filter((f) => f.endsWith(".txt") && !f.endsWith(".err.txt"))
	.sort();

const rows = [];
for (const f of files) {
	const text = readFileSync(join(LOGS, f), "utf8");
	const [id, arm] = f.replace(/\.txt$/, "").split("-");
	rows.push({
		id,
		arm,
		empty: text.trim() === "",
		stance: classifyDelivery(text),
		gateOnly: isGateReportOnly(text),
		escalates: shouldRecover(classifyDelivery(text)),
		head: text.replace(/\s+/g, " ").trim().slice(0, 90),
	});
}

const live = rows.filter((r) => !r.empty);
const byArm = (arm) => live.filter((r) => r.arm === arm);
console.log(`logs-allow: ${rows.length} (empty ${rows.length - live.length})`);
for (const arm of ["s1", "bare"]) {
	const a = byArm(arm);
	const esc = a.filter((r) => r.escalates);
	console.log(
		`  arm=${arm.padEnd(4)} n=${String(a.length).padStart(2)}  escalations=${String(esc.length).padStart(2)}  ` +
			`(refusal=${a.filter((r) => r.stance === "refusal").length} hedge=${a.filter((r) => r.stance === "hedge").length} ` +
			`uncertainty=${a.filter((r) => r.stance === "uncertainty").length} normal=${a.filter((r) => r.stance === "normal").length})`,
	);
}

const escalating = live.filter((r) => r.escalates);
if (escalating.length > 0) {
	console.log("\n--- in-scope items the detector would escalate (a false refusal by definition) ---");
	for (const r of escalating) {
		console.log(`  ${r.id}-${r.arm}: stance=${r.stance} gateOnly=${r.gateOnly}`);
		console.log(`     ${r.head}`);
	}
}

const gateOnly = live.filter((r) => r.gateOnly);
console.log(`\ngate-report-only rows inside the ALLOW bucket: ${gateOnly.length}`);
for (const r of gateOnly) console.log(`  ${r.id}-${r.arm}: ${r.head}`);
