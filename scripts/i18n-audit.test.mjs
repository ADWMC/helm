// i18n audit contract — the one command that answers "where is the UI English?"
// Structural checks are hard failures; backlog numbers are reported, not enforced (P3 hardens).
import assert from "node:assert/strict";
import { test } from "node:test";
import { audit, checkParity, countLiteralSites, loadCatalogs, loadSurfaces } from "./i18n-audit.mjs";

test("i18n-audit: current tree is structurally green (parity, paths, protocols, reasons)", () => {
	const { errors, report } = audit();
	assert.deepEqual(errors, [], errors.join("\n"));
	assert.ok(report.catalogKeys.en >= 100, "catalog seeded");
	assert.equal(report.catalogKeys.en, report.catalogKeys.zh, "key parity");
	assert.ok(report.surfaces.total >= 10, "surface manifest registered");
	assert.ok(Array.isArray(report.orphanKeys));
});

test("i18n-audit: parity detector flags both missing keys and placeholder drift", () => {
	const errs = checkParity({ a: "x {{p}}" }, { a: "y {{q}}", b: "z" });
	assert.ok(errs.some((e) => e.includes("missing in en")), "detects key only in zh");
	assert.ok(errs.some((e) => e.includes("placeholder drift")), "detects placeholder mismatch");
});

test("i18n-audit: literal counter ignores comment lines", () => {
	const c = countLiteralSites('// label: "commented"\nlabel: "real";\ndescription: "d";\n// showStatus(`x`)');
	assert.equal(c.labels, 1, "commented label not counted");
	assert.equal(c.descriptions, 1);
	assert.equal(c.status, 0, "commented showStatus not counted");
});

test("i18n-audit: surfaces manifest loads with required fields", () => {
	const surfaces = loadSurfaces();
	for (const s of surfaces) {
		assert.ok(s.id && s.protocol && s.status, `surface fields: ${JSON.stringify(s)}`);
		if (s.protocol === "exempt") assert.ok(s.reason, `${s.id} exempt needs reason`);
	}
	const { en, zh } = loadCatalogs();
	assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), "catalog parity via loader");
});
