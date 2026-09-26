/**
 * helmx fixed test cases (HX-01…HX-06) as regression — spawns the §15.4
 * hx-fixture runner per case (single source of truth) and asserts exit 0.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../scripts/hx-fixture.mjs", import.meta.url));

function runFixture(args: string[]): string {
	return execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

for (const id of ["HX-01", "HX-02", "HX-03", "HX-04", "HX-05", "HX-06"]) {
	test(`hx-fixture ${id} passes (dry-run)`, () => {
		const out = runFixture(["--case", id, "--dry-run"]);
		assert.match(out, new RegExp(`${id} PASS`));
		assert.match(out, /"failed":0/);
	});
}

test("hx-fixture HX-03 mock-sse repeat 3 replays the ledger statistics", () => {
	const out = runFixture(["--case", "HX-03", "--mock-sse", "--repeat", "3"]);
	assert.match(out, /HX-03\(mock-sse, repeat=3\) PASS/);
	assert.match(out, /"failed":0/);
});
