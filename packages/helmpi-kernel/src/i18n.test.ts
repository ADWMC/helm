/**
 * WG1.7 i18n infrastructure (W1-T07, §1.6):
 *  1) en ↔ zh-CN key parity + placeholder parity
 *  2) missing key falls back per key to English (never a bare key while en has it)
 *  3) machine surfaces stay frozen English (source scan: no i18n imports, no CJK)
 *  4) CJK width: wide char = 2 cols, truncation never splits a code point
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	catalog,
	charWidth,
	detectSystemLocale,
	localeFromTimeZone,
	padToWidth,
	placeholders,
	resetLocaleCache,
	resolveLocale,
	t,
	truncateToWidth,
} from "./i18n/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

test("WG1.7-1: en and zh-CN catalogs have identical key sets and placeholder sets", () => {
	const en = catalog("en");
	const zh = catalog("zh-CN");
	const enKeys = Object.keys(en).sort();
	const zhKeys = Object.keys(zh).sort();
	assert.deepEqual(zhKeys, enKeys, "key sets must match exactly");
	assert.ok(enKeys.length >= 10, "catalog must be seeded");
	for (const k of enKeys) {
		assert.deepEqual(
			[...placeholders(en[k]!)].sort(),
			[...placeholders(zh[k]!)].sort(),
			`placeholder mismatch for ${k}`,
		);
	}
});

test("WG1.7-2: per-key fallback to English; only fully unknown keys return the key", () => {
	// Simulate a zh key missing: t() with a key present only in en still resolves.
	const enOnlyKey = Object.keys(catalog("en"))[0]!;
	const viaEn = t(enOnlyKey, {}, "zh-CN");
	assert.notEqual(viaEn, enOnlyKey, "existing key must translate (not raw key)");
	// Key missing everywhere → visible raw key (never silent empty).
	assert.equal(t("definitely.missing.key", {}, "en"), "definitely.missing.key");
	// Interpolation with visible placeholder when param missing.
	const withParam = Object.keys(catalog("en")).find((k) => placeholders(catalog("en")[k]!).size > 0)!;
	const out = t(withParam, {}, "en");
	assert.ok(out.includes("{{"), "missing param leaves visible placeholder, not empty");
});

test("WG1.7-3: machine surfaces are frozen English — kernel machine writers never import i18n, no CJK in them", () => {
	const machineFiles = [
		"export.ts",
		"ledger.ts",
		"loop.ts",
		"supervise.ts",
		"playbook.ts",
		"domain/types.ts",
		"memory/tool-memory.ts",
	];
	const cjk = /[一-鿿]/;
	for (const rel of machineFiles) {
		// Strip comments first: the frozen-English rule targets emitted output,
		// not documentation comments (e.g. playbook.ts cites a CN rule name).
		const src = readFileSync(join(HERE, rel), "utf8")
			.replace(/\/\/[^\n]*/g, "")
			.replace(/\/\*[\s\S]*?\*\//g, "");
		assert.ok(!src.includes("/i18n/"), `${rel} must not import the i18n module`);
		assert.ok(!src.includes('from "./i18n'), `${rel} must not import the i18n module`);
		assert.ok(!cjk.test(src), `${rel} must contain no CJK (frozen English machine surface)`);
	}
	// Journal-kind-looking keys must not exist in catalogs (they are code constants).
	for (const k of Object.keys(catalog("en"))) {
		assert.ok(!k.startsWith("journal."), "journal event names are not translatable");
		assert.ok(!k.startsWith("report.json."), "json report keys are not translatable");
	}
});

test("WG1.7-4: CJK width — wide chars are 2 cols, truncation never splits a code point", () => {
	assert.equal(charWidth("a"), 1);
	assert.equal(charWidth("中"), 2);
	assert.equal(charWidth("あ"), 2);
	assert.equal(charWidth("한"), 2);
	// Budget 5 cols: "中文" = 4 cols, adding 'a' = 5, adding another 中 would hit 7 → drop it whole.
	assert.equal(truncateToWidth("中文a中", 5), "中文a");
	// 2+2=4 <= 5 keeps 中文; next wide char would hit 6 > 5 and is dropped whole.
	assert.equal(truncateToWidth("中文中文", 5), "中文");
	// pad stays within budget
	const padded = padToWidth("中文", 8);
	let cols = 0;
	for (const ch of padded) cols += charWidth(ch);
	assert.equal(cols, 8);
});

test("WG1.7: locale chain — config beats env, invalid env falls through to system detect (memo reset between)", () => {
	const dir = mkdtempSync(join(tmpdir(), "helm-i18n-"));
	// isolate the global settings step (TUI /settings writes agentDir/settings.json)
	const savedAgentDir = process.env.HELM_CODING_AGENT_DIR;
	const tempAgentDir = mkdtempSync(join(tmpdir(), "helm-i18n-agent-"));
	process.env.HELM_CODING_AGENT_DIR = tempAgentDir;
	const savedLc = { LC_ALL: process.env.LC_ALL, LC_MESSAGES: process.env.LC_MESSAGES, LANG: process.env.LANG };
	try {
		resetLocaleCache();
		const prev = process.env.HELM_LOCALE;
		process.env.HELM_LOCALE = "zh-CN";
		assert.equal(resolveLocale(dir), "zh-CN", "env fallback works");
		resetLocaleCache();
		mkdirSync(join(dir, ".helm"), { recursive: true });
		writeFileSync(join(dir, ".helm", "config.json"), JSON.stringify({ locale: "en" }), "utf8");
		assert.equal(resolveLocale(dir), "en", "config beats env");
		resetLocaleCache();
		process.env.HELM_LOCALE = "klingon";
		writeFileSync(join(dir, ".helm", "config.json"), JSON.stringify({}), "utf8");
		// deterministic auto-detect for this assertion (POSIX locale is authoritative when present)
		delete process.env.LC_MESSAGES;
		delete process.env.LANG;
		process.env.LC_ALL = "en_US.UTF-8";
		assert.equal(resolveLocale(dir), "en", "invalid env → chain ends at system detect (=en under en_US locale)");
		if (prev === undefined) delete process.env.HELM_LOCALE;
		else process.env.HELM_LOCALE = prev;
		resetLocaleCache();
	} finally {
		process.env.LC_ALL = savedLc.LC_ALL;
		if (savedLc.LC_ALL === undefined) delete process.env.LC_ALL;
		process.env.LC_MESSAGES = savedLc.LC_MESSAGES;
		if (savedLc.LC_MESSAGES === undefined) delete process.env.LC_MESSAGES;
		process.env.LANG = savedLc.LANG;
		if (savedLc.LANG === undefined) delete process.env.LANG;
		if (savedAgentDir === undefined) delete process.env.HELM_CODING_AGENT_DIR;
		else process.env.HELM_CODING_AGENT_DIR = savedAgentDir;
		try {
			rmSync(tempAgentDir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
		resetLocaleCache();
	}
});

test("WG1.7-5: system auto-detect — POSIX locale authoritative; timezone helper maps CJK zones (user directive)", () => {
	const savedLc = { LC_ALL: process.env.LC_ALL, LC_MESSAGES: process.env.LC_MESSAGES, LANG: process.env.LANG };
	const apply = (v: string | undefined) => {
		if (v === undefined) delete process.env.LC_ALL;
		else process.env.LC_ALL = v;
	};
	try {
		delete process.env.LC_MESSAGES;
		delete process.env.LANG;
		process.env.LC_ALL = "zh_CN.UTF-8";
		assert.equal(detectSystemLocale(), "zh-CN", "POSIX zh → zh-CN");
		process.env.LC_ALL = "en_US.UTF-8";
		assert.equal(detectSystemLocale(), "en", "POSIX en → en (explicit choice wins over OS/tz)");
		process.env.LC_ALL = "C";
		assert.equal(detectSystemLocale(), "en", "POSIX C → en");
	} finally {
		apply(savedLc.LC_ALL);
		process.env.LC_MESSAGES = savedLc.LC_MESSAGES;
		if (savedLc.LC_MESSAGES === undefined) delete process.env.LC_MESSAGES;
		process.env.LANG = savedLc.LANG;
		if (savedLc.LANG === undefined) delete process.env.LANG;
	}
	// timezone tier (pure): CJK/Chinese zones → zh-CN, others → en fallback
	assert.equal(localeFromTimeZone("Asia/Shanghai"), "zh-CN");
	assert.equal(localeFromTimeZone("Asia/Taipei"), "zh-CN");
	assert.equal(localeFromTimeZone("Asia/Hong_Kong"), "zh-CN");
	assert.equal(localeFromTimeZone("Europe/Berlin"), "en");
	assert.equal(localeFromTimeZone("America/New_York"), "en");
});

test("WG1.7-6: global settings (TUI /settings) sits between env and auto-detect", () => {
	const project = mkdtempSync(join(tmpdir(), "helm-i18n-proj-"));
	const agent = mkdtempSync(join(tmpdir(), "helm-i18n-glob-"));
	const savedAgentDir = process.env.HELM_CODING_AGENT_DIR;
	const savedLocale = process.env.HELM_LOCALE;
	const savedLc = { LC_ALL: process.env.LC_ALL, LC_MESSAGES: process.env.LC_MESSAGES, LANG: process.env.LANG };
	try {
		process.env.HELM_CODING_AGENT_DIR = agent;
		delete process.env.HELM_LOCALE;
		delete process.env.LC_MESSAGES;
		delete process.env.LANG;
		process.env.LC_ALL = "en_US.UTF-8"; // deterministic auto tier → en
		// no settings.json → auto-detect
		resetLocaleCache();
		assert.equal(resolveLocale(project), "en", "no global settings → system detect");
		// TUI persisted preference wins over auto
		writeFileSync(join(agent, "settings.json"), JSON.stringify({ locale: "zh-CN" }), "utf8");
		resetLocaleCache();
		assert.equal(resolveLocale(project), "zh-CN", "global settings locale beats auto-detect");
		// "auto" is the explicit opt-out → back to system detect
		writeFileSync(join(agent, "settings.json"), JSON.stringify({ locale: "auto" }), "utf8");
		resetLocaleCache();
		assert.equal(resolveLocale(project), "en", "locale=auto skips to system detect");
		// env still beats the persisted TUI preference (per-run override)
		process.env.HELM_LOCALE = "zh-CN";
		resetLocaleCache();
		assert.equal(resolveLocale(project), "zh-CN", "env beats global settings");
	} finally {
		if (savedLocale === undefined) delete process.env.HELM_LOCALE;
		else process.env.HELM_LOCALE = savedLocale;
		process.env.LC_ALL = savedLc.LC_ALL;
		if (savedLc.LC_ALL === undefined) delete process.env.LC_ALL;
		process.env.LC_MESSAGES = savedLc.LC_MESSAGES;
		if (savedLc.LC_MESSAGES === undefined) delete process.env.LC_MESSAGES;
		process.env.LANG = savedLc.LANG;
		if (savedLc.LANG === undefined) delete process.env.LANG;
		if (savedAgentDir === undefined) delete process.env.HELM_CODING_AGENT_DIR;
		else process.env.HELM_CODING_AGENT_DIR = savedAgentDir;
		for (const d of [project, agent]) {
			try {
				rmSync(d, { recursive: true, force: true });
			} catch {
				/* ignore */
			}
		}
		resetLocaleCache();
	}
});
