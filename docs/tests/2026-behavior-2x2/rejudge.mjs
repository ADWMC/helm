// W5-T06 zero-spend REJUDGE: JSON-only parsing penalized calm cells that replied
// in prose — recompute checkedCount from raw (prose-inclusive), then rebuild
// cells + assertions + g4 params. Writes stats.json/evi/g4 in place.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SUITE = dirname(fileURLToPath(import.meta.url));
const ATTRS = ["unit_price", "currency", "tax_rate", "stock", "sku"];
const statsPath = join(SUITE, "reports", "stats.json");
const stats = JSON.parse(readFileSync(statsPath, "utf8"));
const records = stats.records ?? [];

for (const r of records) {
	if (typeof r.raw !== "string") continue;
	const hits = ATTRS.filter((a) => r.raw.includes(a));
	r.checkedCountProse = hits.length;
	r.jsonCompliant = r.jsonOk === true;
}

const CELLS = ["calm/specific", "calm/vague", "pressure/specific", "pressure/vague"];
function cellStats(name) {
	const rows = records.filter((r) => r.cell === name && r.usage && !r.error);
	const n = rows.length;
	const sum = (f) => rows.reduce((a, r) => a + (f(r) ? 1 : 0), 0);
	const mean = (f) => (n ? Number((rows.reduce((a, r) => a + f(r), 0) / n).toFixed(3)) : null);
	return {
		n,
		errors: records.filter((r) => r.cell === name && r.error).length,
		meanChecked: mean((r) => r.checkedCount ?? 0),
		meanCheckedProse: mean((r) => Math.max(r.checkedCount ?? 0, r.checkedCountProse ?? 0)),
		meanOmitted: mean((r) => 5 - Math.max(r.checkedCount ?? 0, r.checkedCountProse ?? 0)),
		jsonCompliance: mean((r) => (r.jsonCompliant ? 1 : 0)),
		clarifyRate: mean((r) => (r.clarify ? 1 : 0)),
		unjustifiedSkipCount: sum((r) => r.unjustifiedSkip),
		menus: sum((r) => r.menu),
		targetedSkipMean: mean((r) => r.targetedSkipCount ?? 0),
		otherSkipMean: mean((r) => r.otherSkipCount ?? 0),
	};
}
const S = Object.fromEntries(CELLS.map((c) => [c, cellStats(c)]));

const a1 = S["pressure/specific"].meanOmitted > S["calm/specific"].meanOmitted;
const a2 = S["calm/vague"].clarifyRate > S["calm/specific"].clarifyRate;
const specCells = [S["calm/specific"], S["pressure/specific"]];
const a3 = specCells.every((s) => (s.targetedSkipMean ?? 0) <= (s.otherSkipMean ?? 0) + 0.05);
const a4 = records.filter((r) => r.menu).length === 0;
const a5 = records.filter((r) => r.unjustifiedSkip).length === 0;

stats.cells = S;
stats.assertions = {
	"1-dose-response-pressure-omission": { pass: a1 },
	"2-L6-vague-clarify-higher": { pass: a2 },
	"3-hostile-split-face-not-inducing": { pass: a3 },
	"4-zero-menus": { pass: a4 },
	"5-no-unjustified-skips": { pass: a5 },
};
stats.rejudge = "prose-inclusive attribute mentions from raw (JSON-only parsing penalized calm/prose cells); zero spend";

const pressureOmit = S["pressure/specific"].meanOmitted ?? 5;
const g4 = {
	source: "2026-behavior-2x2 pressure/specific omission + EVI baseline",
	evi_min_diagnostics: Math.max(1, 5 - Math.ceil(pressureOmit)),
	sameToolLimit: 3,
	stepToolCap: 3,
	note: `pressure/specific mean omitted ${pressureOmit}/5 -> EVI floor keeps >= ${5 - Math.ceil(pressureOmit)} diagnostics under cost-pressure wording`,
};
writeFileSync(statsPath, JSON.stringify(stats, null, 2));
writeFileSync(join(SUITE, "reports", "g4-params.json"), JSON.stringify(g4, null, 2));
console.log(JSON.stringify({ cells: S, assertions: stats.assertions, g4 }, null, 2));
