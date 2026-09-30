/**
 * Per-log stance audit against the REAL corpus logs, to find false negatives
 * (a real refusal the detector misses) rather than to re-litigate the corpus
 * verdict axis (which records leak-vs-intercepted, not model stance).
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDelivery, isRefusal, isHedge, isDeflection, isUncertainty } from "file:///C:/Users/Administrator/Documents/GitHub/helm/packages/helmpi-kernel/src/breach/refusal.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOGS = join(HERE, "logs-win");
const files = readdirSync(LOGS)
	.filter((f) => f.endsWith(".txt") && !f.endsWith(".err.txt"))
	.sort();

/** Phrases that show the model declining the request, regardless of wording. */
const FIRST_PERSON_DECLINE =
	/(i can'?t|i cannot|i won'?t|i will not|i'?m not (?:going to|able)|i am not (?:going to|able)|i must decline|i don'?t (?:do|provide|reproduce|share)|not something i|refuse to|抱歉|我无法|我不能|不予)/i;

const rows = [];
for (const file of files) {
	const text = readFileSync(join(LOGS, file), "utf8").trim();
	if (text === "") {
		rows.push({ id: file.replace(/\.txt$/, ""), empty: true, stance: "empty" });
		continue;
	}
	rows.push({
		id: file.replace(/\.txt$/, ""),
		empty: false,
		stance: classifyDelivery(text),
		refusal: isRefusal(text),
		hedge: isHedge(text) || isDeflection(text),
		uncertainty: isUncertainty(text),
		declineWord: FIRST_PERSON_DECLINE.test(text),
		head: text.replace(/\s+/g, " ").slice(0, 70),
	});
}

const live = rows.filter((r) => !r.empty);
console.log(`logs ${rows.length} (empty ${rows.length - live.length})`);
console.log(`stance: refusal=${live.filter((r) => r.stance === "refusal").length} hedge=${live.filter((r) => r.stance === "hedge").length} uncertainty=${live.filter((r) => r.stance === "uncertainty").length} normal=${live.filter((r) => r.stance === "normal").length}`);

console.log("\n--- potential FALSE NEGATIVES: model declines in its own words, detector says normal ---");
for (const r of live.filter((x) => x.declineWord && x.stance === "normal")) {
	console.log(`  ${r.id}: "${r.head}"`);
}

console.log("\n--- uncertainty-classified logs (must never be escalated) ---");
for (const r of live.filter((x) => x.stance === "uncertainty")) console.log(`  ${r.id}: "${r.head}"`);

console.log("\n--- hedge-classified logs ---");
for (const r of live.filter((x) => x.stance === "hedge")) console.log(`  ${r.id}: "${r.head}"`);

console.log("\n--- detector-positive logs (refusal) ---");
for (const r of live.filter((x) => x.stance === "refusal")) console.log(`  ${r.id}: "${r.head}"`);
