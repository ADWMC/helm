// i18n audit — one command that answers "where is the UI still English?"
// Usage: node scripts/i18n-audit.mjs [--json]
//
// Structural failures (exit 1): surfaces.json missing/malformed, a registered
// path that does not exist, en/zh catalog key-set or placeholder drift.
// Warn-mode backlog (exit 0, hardened to error in P3): pending surfaces,
// partial surfaces, orphan catalog keys (key present but never referenced).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const I18N_DIR = join(ROOT, "packages", "helmpi-kernel", "i18n");

const PLACEHOLDER = /\{\{(\w+)\}\}/g;
function placeholders(s) {
	const out = new Set();
	for (const m of s.matchAll(PLACEHOLDER)) out.add(m[1]);
	return out;
}

export function loadCatalogs() {
	const en = JSON.parse(readFileSync(join(I18N_DIR, "en.json"), "utf8"));
	const zh = JSON.parse(readFileSync(join(I18N_DIR, "zh-CN.json"), "utf8"));
	return { en, zh };
}

export function checkParity(en, zh) {
	const errors = [];
	const enKeys = Object.keys(en);
	const zhKeys = Object.keys(zh);
	for (const k of enKeys) if (!(k in zh)) errors.push(`key missing in zh-CN: ${k}`);
	for (const k of zhKeys) if (!(k in en)) errors.push(`key missing in en: ${k}`);
	for (const k of enKeys) {
		if (!(k in zh)) continue;
		const a = [...placeholders(en[k])].sort().join(",");
		const b = [...placeholders(zh[k])].sort().join(",");
		if (a !== b) errors.push(`placeholder drift on ${k}: en=[${a}] zh=[${b}]`);
	}
	return errors;
}

export function loadSurfaces() {
	const file = join(I18N_DIR, "surfaces.json");
	if (!existsSync(file)) throw new Error(`surfaces.json missing: ${file}`);
	const data = JSON.parse(readFileSync(file, "utf8"));
	if (!Array.isArray(data.surfaces)) throw new Error("surfaces.json: `surfaces` array required");
	return data.surfaces;
}

const KNOWN_PROTOCOLS = new Set(["t", "registry", "injected", "pending", "exempt"]);

/** Heuristic: count human-facing English literal sites in a source file. */
export function countLiteralSites(src) {
	const noComments = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
	const count = (re) => (noComments.match(re) ?? []).length;
	return {
		labels: count(/\blabel:\s*["`]/g),
		descriptions: count(/\bdescription:\s*["`]/g),
		status: count(/showStatus\(/g),
	};
}
const literalTotal = (c) => c.labels + c.descriptions + c.status;

/**
 * Orphan keys: catalog key present but nothing in src can consume it.
 * Registry namespaces resolve dynamically (`<ns>.<id>.<field>`), so we check
 * the id component against its registry file; everything else must appear
 * literally (t("key...") call sites).
 */
export function findOrphans(en, surfaces) {
	const orphans = [];
	const settingsFile = join(ROOT, "packages/coding-agent/src/modes/interactive/components/settings-selector.ts");
	const slashFile = join(ROOT, "packages/coding-agent/src/core/slash-commands.ts");
	const srcFiles = [];
	const walk = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "test") continue;
				walk(p);
			} else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) srcFiles.push(p);
		}
	};
	for (const base of ["packages/helmpi-kernel/src", "packages/coding-agent/src", "packages/tui/src", "scripts"]) {
		const dir = join(ROOT, base);
		if (existsSync(dir)) walk(dir);
	}
	const settingsSrc = existsSync(settingsFile) ? readFileSync(settingsFile, "utf8") : "";
	const slashSrc = existsSync(slashFile) ? readFileSync(slashFile, "utf8") : "";
	const allSrc = srcFiles.map((f) => readFileSync(f, "utf8"));
	for (const key of Object.keys(en)) {
		const parts = key.split(".");
		const last = parts[parts.length - 1];
		let used = false;
		// registry row keys look like <ns>.<id>.label|desc — only then resolve by id;
		// anything else (settings.hint.search, cli.*, status.*) must appear literally.
		if (parts[0] === "settings" && parts.length === 3 && (last === "label" || last === "desc")) {
			used = settingsSrc.includes(`id: "${parts[1]}"`);
		} else if (parts[0] === "slash" && parts.length === 3 && last === "desc") {
			used = slashSrc.includes(`name: "${parts[1]}"`);
		} else {
			used = allSrc.some((s) => s.includes(key));
		}
		if (!used) orphans.push(key);
	}
	void surfaces;
	return orphans;
}

export function audit() {
	const errors = [];
	const { en, zh } = loadCatalogs();
	errors.push(...checkParity(en, zh));
	let surfaces;
	try {
		surfaces = loadSurfaces();
	} catch (e) {
		return { errors: [String(e.message ?? e)], report: null };
	}
	const rows = [];
	for (const s of surfaces) {
		if (!KNOWN_PROTOCOLS.has(s.protocol)) errors.push(`surface ${s.id}: unknown protocol ${s.protocol}`);
		if (s.protocol !== "exempt" && (!s.paths || s.paths.length === 0)) errors.push(`surface ${s.id}: paths required`);
		if (s.protocol === "exempt" && !s.reason) errors.push(`surface ${s.id}: exempt surfaces require a reason`);
		let hits = { labels: 0, descriptions: 0, status: 0 };
		for (const rel of s.paths ?? []) {
			const abs = join(ROOT, rel);
			if (!existsSync(abs)) {
				errors.push(`surface ${s.id}: path not found: ${rel}`);
				continue;
			}
			const c = countLiteralSites(readFileSync(abs, "utf8"));
			hits = { labels: hits.labels + c.labels, descriptions: hits.descriptions + c.descriptions, status: hits.status + c.status };
		}
		rows.push({ id: s.id, protocol: s.protocol, status: s.status, literalSites: literalTotal(hits), note: s.note ?? s.reason ?? "" });
	}
	const orphans = findOrphans(en, surfaces);
	const byStatus = rows.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
	const human = rows.filter((r) => r.status !== "exempt");
	const wiredish = human.filter((r) => r.status === "wired").length;
	const backlog = human.filter((r) => r.status === "pending" || r.status === "partial");
	return {
		errors,
		report: {
			catalogKeys: { en: Object.keys(en).length, zh: Object.keys(zh).length },
			surfaces: { total: rows.length, byStatus },
			coverage: human.length ? Number((wiredish / human.length).toFixed(2)) : 0,
			backlogLiteralSites: backlog.reduce((a, r) => a + r.literalSites, 0),
			orphanKeys: orphans,
			rows,
		},
	};
}

function main() {
	const { errors, report } = audit();
	if (errors.length > 0) {
		console.error("[i18n-audit] FAIL");
		for (const e of errors) console.error(`  - ${e}`);
		process.exit(1);
	}
	const json = process.argv.includes("--json");
	if (json) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		console.log(`[i18n-audit] OK  keys=${report.catalogKeys.en}/${report.catalogKeys.zh}  surfaces=${report.surfaces.total} (${Object.entries(report.surfaces.byStatus).map(([k, v]) => `${k}:${v}`).join(" ")})  coverage(wired)=${report.coverage}  backlogLiteralSites=${report.backlogLiteralSites}  orphanKeys=${report.orphanKeys.length}`);
		for (const r of report.rows.filter((x) => x.status === "pending" || x.status === "partial")) {
			console.log(`  [${r.status}] ${r.id}: literalSites=${r.literalSites} — ${r.note}`);
		}
		if (report.orphanKeys.length > 0) console.log(`  orphan keys: ${report.orphanKeys.join(", ")}`);
	}
	process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
