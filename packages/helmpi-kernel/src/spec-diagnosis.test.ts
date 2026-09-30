/**
 * spec-diagnosis: the `no_spec` denial must self-explain WHICH resolution
 * failure happened. Motivated by a real incident: an operator wrote spec.json
 * (root fallback path) without `highRisk`, the loader silently skipped it, and
 * all three retries hit the identical opaque "no_spec" message.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { describeSpecResolution } from "./index.ts";

const VALID = { goal: "g", allowedTargets: ["http://127.0.0.1:18081"], highRisk: "deny" };

function fixture(setup: (dir: string) => void): string {
	const dir = mkdtempSync(join(tmpdir(), "spec-diag-"));
	setup(dir);
	return dir;
}

test("diagnosis: no files at all names both absent paths", () => {
	const dir = fixture(() => {});
	try {
		const s = describeSpecResolution(dir);
		assert.match(s, /\.helm[\\/]spec\.json: absent/);
		assert.match(s, /[\\/]spec\.json: absent/);
		assert.match(s, /phase ledger: spec not set/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("diagnosis: shape-invalid file (missing highRisk) is named with the missing key", () => {
	const dir = fixture((d) => {
		mkdirSync(join(d, ".helm"), { recursive: true });
		writeFileSync(
			join(d, ".helm", "spec.json"),
			JSON.stringify({ goal: "g", allowedTargets: ["x"] }), // no highRisk
			"utf8",
		);
	});
	try {
		const s = describeSpecResolution(dir);
		assert.match(s, /\.helm[\\/]spec\.json: present but SKIPPED/);
		assert.match(s, /highRisk/);
		assert.doesNotMatch(s, /allowedTargets \(must be a string array\)/); // key present
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("diagnosis: malformed JSON reports UNREADABLE, not just absent", () => {
	const dir = fixture((d) => {
		writeFileSync(join(d, "spec.json"), "{ not json", "utf8");
	});
	try {
		const s = describeSpecResolution(dir);
		assert.match(s, /[\\/]spec\.json: present but UNREADABLE/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("diagnosis: valid file is reported usable", () => {
	const dir = fixture((d) => {
		writeFileSync(join(d, "spec.json"), JSON.stringify(VALID), "utf8");
	});
	try {
		const s = describeSpecResolution(dir);
		assert.match(s, /[\\/]spec\.json: present and usable/);
		assert.match(s, /\.helm[\\/]spec\.json: absent/); // fallback path still named
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("diagnosis: root fallback is used when .helm file is shape-invalid", () => {
	// Mirrors loadSessionSpec: invalid .helm file falls through to root spec.json.
	const dir = fixture((d) => {
		mkdirSync(join(d, ".helm"), { recursive: true });
		writeFileSync(join(d, ".helm", "spec.json"), JSON.stringify({ goal: "g" }), "utf8");
		writeFileSync(join(d, "spec.json"), JSON.stringify(VALID), "utf8");
	});
	try {
		const s = describeSpecResolution(dir);
		assert.match(s, /\.helm[\\/]spec\.json: present but SKIPPED/);
		assert.match(s, /[\\/]spec\.json: present and usable/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
