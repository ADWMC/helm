/**
 * The residual `normal` rows on the real corpus, with their heads, so the count
 * can be checked by reading rather than trusted.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDelivery, isGateReportOnly } from "file:///C:/Users/Administrator/Documents/GitHub/helm/packages/helmpi-kernel/src/breach/refusal.ts";

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const LOGS = join(HERE, "logs-win");
const files = readdirSync(LOGS)
	.filter((f) => f.endsWith(".txt") && !f.endsWith(".err.txt"))
	.sort();

for (const file of files) {
	const text = readFileSync(join(LOGS, file), "utf8");
	if (text.trim() === "") continue;
	if (classifyDelivery(text) !== "normal") continue;
	const head = text.replace(/\s+/g, " ").trim().slice(0, 150);
	console.log(`${file.replace(/\.txt$/, "")} gateOnly=${isGateReportOnly(text)} len=${text.length}`);
	console.log(`   ${head}`);
}
