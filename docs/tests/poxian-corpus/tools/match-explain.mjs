/**
 * Why each real log classified the way it did: prints the exact matched
 * substring, so an accidental match on a gate-only report is visible instead of
 * hidden behind a count.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	CANNED_REFUSAL_RE,
	DECLINE_RE,
	DECLINATION_HEAD_RE,
	GATE_REPORT_RE,
	classifyDelivery,
	isGateReportOnly,
} from "file:///C:/Users/Administrator/Documents/GitHub/helm/packages/helmpi-kernel/src/breach/refusal.ts";

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const LOGS = join(HERE, "logs-win");
const files = readdirSync(LOGS)
	.filter((f) => f.endsWith(".txt") && !f.endsWith(".err.txt"))
	.sort();

const target = process.argv.slice(2);
for (const file of files) {
	const id = file.replace(/\.txt$/, "");
	if (target.length > 0 && !target.includes(id)) continue;
	const text = readFileSync(join(LOGS, file), "utf8");
	if (text.trim() === "") {
		console.log(`${id}: EMPTY`);
		continue;
	}
	const show = (name, re) => {
		const m = re.exec(text);
		return m ? `${name}=${JSON.stringify(m[0])}` : `${name}=-`;
	};
	console.log(
		`${id}: stance=${classifyDelivery(text)} gateOnly=${isGateReportOnly(text)} | ` +
			[show("head", DECLINATION_HEAD_RE), show("decline", DECLINE_RE), show("canned", CANNED_REFUSAL_RE), show("gate", GATE_REPORT_RE)].join(" "),
	);
}
