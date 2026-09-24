/**
 * Helm i18n (W1-T07, §1.6): human-facing strings only.
 *
 * Boundary: machine surfaces (journal event names, json report keys, exit
 * codes, G1 prompts) are FROZEN English — never routed through this module.
 * Locale chain: .helm/config.json `locale` → HELM_LOCALE env → "en";
 * invalid values warn and fall back. Missing keys fall back PER KEY to the
 * English catalog; missing in both → the key itself is returned (visible).
 *
 * CJK width: fullwidth code points occupy 2 columns; formatCjkLine wraps and
 * pads at a display-column budget without cutting a code point mid-char.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Locale = "en" | "zh-CN";
export const LOCALES: readonly Locale[] = ["en", "zh-CN"];
const FALLBACK: Locale = "en";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadCatalog(file: string): Record<string, string> {
	// Layouts: source tree (pkg/i18n next to src/) and installed/bundled
	// (resolve via package exports subpath). Never crash at import time.
	const candidates = [join(HERE, "..", "..", "i18n", file)];
	try {
		candidates.push(createRequire(import.meta.url).resolve(`@adwmc/helm-kernel/i18n/${file}`));
	} catch {
		/* subpath unavailable in some layouts */
	}
	for (const c of candidates) {
		try {
			return JSON.parse(readFileSync(c, "utf8")) as Record<string, string>;
		} catch {
			/* try next */
		}
	}
	throw new Error(`[i18n] cannot load catalog ${file} (tried: ${candidates.join(", ")})`);
}

const CATALOGS: Record<Locale, Record<string, string>> = {
	en: loadCatalog("en.json"),
	"zh-CN": loadCatalog("zh-CN.json"),
};

let cachedLocale: Locale | undefined;
let cachedCwd: string | undefined;

function readLocaleFromConfig(cwd: string): Locale | undefined {
	try {
		const raw = JSON.parse(readFileSync(join(cwd, ".helm", "config.json"), "utf8")) as { locale?: unknown };
		if (typeof raw.locale === "string") return normalize(raw.locale);
	} catch {
		/* missing/invalid → env chain next */
	}
	return undefined;
}

function normalize(v: string): Locale | undefined {
	return (LOCALES as readonly string[]).includes(v) ? (v as Locale) : undefined;
}

/** Locale chain (§1.6): config → HELM_LOCALE → en; invalid warns, never throws. */
export function resolveLocale(cwd: string = process.cwd()): Locale {
	if (cachedLocale !== undefined && cachedCwd === cwd) return cachedLocale;
	let resolved: Locale = FALLBACK;
	const fromConfig = readLocaleFromConfig(cwd);
	if (fromConfig) {
		resolved = fromConfig;
	} else {
		const fromEnv = process.env.HELM_LOCALE;
		if (fromEnv) {
			const n = normalize(fromEnv);
			if (n) resolved = n;
			else console.warn(`[i18n] invalid HELM_LOCALE=${fromEnv}, falling back to ${FALLBACK}`);
		}
	}
	cachedLocale = resolved;
	cachedCwd = cwd;
	return resolved;
}

/** Test seam: forget memoized locale. */
export function resetLocaleCache(): void {
	cachedLocale = undefined;
	cachedCwd = undefined;
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

export function placeholders(template: string): Set<string> {
	const out = new Set<string>();
	for (const m of template.matchAll(PLACEHOLDER)) out.add(m[1]!);
	return out;
}

/** Translate with per-key English fallback and {{var}} interpolation. */
export function t(key: string, params: Record<string, string | number> = {}, locale: Locale = resolveLocale()): string {
	const primary = CATALOGS[locale][key];
	const template = primary ?? CATALOGS[FALLBACK][key] ?? key;
	return template.replace(PLACEHOLDER, (_m, name: string) => String(params[name] ?? `{{${name}}}`));
}

/** Raw catalog access for parity tests. */
export function catalog(locale: Locale): Record<string, string> {
	return CATALOGS[locale];
}

/** East-Asian Wide/Fullwidth ranges → 2 columns (pragmatic subset, §1.6 ④). */
export function charWidth(ch: string): 1 | 2 {
	const cp = ch.codePointAt(0) ?? 0;
	return (cp >= 0x1100 && cp <= 0x115f) ||
		(cp >= 0x2e80 && cp <= 0xa4cf) ||
		(cp >= 0xac00 && cp <= 0xd7a3) ||
		(cp >= 0xf900 && cp <= 0xfaff) ||
		(cp >= 0xfe30 && cp <= 0xfe6f) ||
		(cp >= 0xff00 && cp <= 0xff60) ||
		(cp >= 0xffe0 && cp <= 0xffe6) ||
		(cp >= 0x1f300 && cp <= 0x1f64f) ||
		(cp >= 0x20000 && cp <= 0x3fffd)
		? 2
		: 1;
}

/**
 * Truncate to `cols` display columns WITHOUT splitting a code point
 * ("断字不断串"): a wide char that would straddle the budget is dropped.
 */
export function truncateToWidth(s: string, cols: number): string {
	let used = 0;
	let out = "";
	for (const ch of s) {
		const w = charWidth(ch);
		if (used + w > cols) break;
		out += ch;
		used += w;
	}
	return out;
}

/** Pad with spaces to exactly `cols` display columns (no growth beyond budget). */
export function padToWidth(s: string, cols: number): string {
	let used = 0;
	for (const ch of s) used += charWidth(ch);
	if (used >= cols) return s;
	return s + " ".repeat(cols - used);
}
