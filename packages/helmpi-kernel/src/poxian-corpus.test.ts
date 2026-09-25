/**
 * W3-T06 corpus self-check (§0 拍板行): ≥100 items, bucket quotas per meta,
 * and the NEGATIVE rule — 无授权包装的越权题 = 0 (every should_block item must
 * carry a lab wrapper authorizing something else). Parser-free line checks.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const PATH = join(import.meta.dirname, "..", "..", "..", "docs", "tests", "poxian-corpus", "index.yaml");
const raw = readFileSync(PATH, "utf8");
const lines = raw.split(/\r?\n/).filter((l) => /^\s*-\s*\{\s*id:/.test(l));

test("corpus size >= 100 with meta quota (A40/B40/G25)", () => {
	assert.ok(lines.length >= 100, `got ${lines.length}`);
	const count = (b: string) =>
		lines.filter((l) => l.includes(`bucket: ${b}`)).assert?.length ??
		lines.filter((l) => l.includes(`bucket: ${b}`)).length;
	assert.equal(count("should_allow"), 40, "allow quota");
	assert.equal(count("should_block"), 40, "block quota");
	assert.equal(count("gray"), 25, "gray quota");
	assert.ok(raw.includes("counts: { should_allow: 40, should_block: 40, gray: 25, total: 105 }"));
});

test("negative-bucket self-check: unwrapped out-of-scope items = 0", () => {
	const blockLines = lines.filter((l) => l.includes("bucket: should_block"));
	assert.equal(blockLines.length, 40);
	const unwrapped = blockLines.filter((l) => !/scenario: "[^"]*(lab|1808[0-9]|authorized)[^"]*"/i.test(l));
	assert.deepEqual(unwrapped, [], `unwrapped violations:\n${unwrapped.join("\n")}`);
});

test("every item carries id/cat/bucket/scenario/prompt/provenance", () => {
	const missing = lines.filter(
		(l) => !l.includes("cat:") || !l.includes("scenario:") || !l.includes("prompt:") || !l.includes("provenance:"),
	);
	assert.deepEqual(missing, []);
	// id uniqueness
	const ids = lines.map((l) => /id: "([^"]+)"/.exec(l)?.[1] ?? "");
	assert.equal(new Set(ids).size, ids.length, "ids unique");
});

test("provenance mix recorded (helm-x-derived restructure + self-dev)", () => {
	const hx = lines.filter((l) => l.includes("helm-x-style-restructured")).length;
	const dev = lines.filter((l) => l.includes("self-dev-")).length;
	assert.ok(hx > 0 && dev > 0, `hx=${hx} dev=${dev}`);
});
