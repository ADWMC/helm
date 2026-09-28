/**
 * references/ index integrity.
 *
 * The ported reference tree is knowledge, not code, so nothing else guards it.
 * Before this test the index.md files had drifted into a dead map: the root
 * index linked 14 paths that did not exist on disk, and no test noticed because
 * no code reads the directory at all.
 *
 * This is the machine gate against that recurring. It asserts two directions:
 *   1. every markdown link in every index.md resolves to a file on disk
 *   2. every document on disk is reachable from at least one index
 *
 * Direction 2 is what makes the tree usable. A document that exists but is never
 * listed is invisible to a reader who starts from the index.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// src/references-index.test.ts -> package root is one level up, references sits there.
const root = fileURLToPath(new URL("../references", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full, out);
		} else if (entry.name.endsWith(".md")) {
			out.push(full);
		}
	}
	return out;
}

const allMarkdown = walk(root).sort();
const indexFiles = allMarkdown.filter((p) => p.endsWith("index.md"));

/** Markdown links of the form [label](target.md), excluding absolute URLs. */
function markdownLinks(from: string): string[] {
	const text = readFileSync(from, "utf8");
	const links: string[] = [];
	for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
		const target = m[1].trim();
		if (/^[a-z]+:/i.test(target) || target.startsWith("#")) {
			continue;
		}
		links.push(target.split("#")[0]);
	}
	return links;
}

test("references tree is non-trivial", () => {
	assert.ok(allMarkdown.length > 50, `expected a populated tree, found ${allMarkdown.length} markdown files`);
	assert.ok(indexFiles.length >= 9, `expected at least 9 index files, found ${indexFiles.length}`);
});

test("every link in every index resolves", () => {
	const broken: string[] = [];
	for (const index of indexFiles) {
		for (const link of markdownLinks(index)) {
			const target = resolve(dirname(index), link);
			let ok = false;
			try {
				ok = statSync(target).isFile();
			} catch {
				ok = false;
			}
			if (!ok) {
				broken.push(`${relative(root, index)} -> ${link}`);
			}
		}
	}
	assert.deepEqual(broken, [], `index links pointing at nothing:\n  ${broken.join("\n  ")}`);
});

test("every document is reachable from some index", () => {
	const listed = new Set<string>();
	for (const index of indexFiles) {
		for (const link of markdownLinks(index)) {
			listed.add(resolve(dirname(index), link));
		}
	}
	const orphans = allMarkdown.filter((p) => !p.endsWith("index.md") && !listed.has(resolve(p)));
	assert.deepEqual(
		orphans.map((p) => relative(root, p)),
		[],
		`documents on disk that no index points at:\n  ${orphans.map((p) => relative(root, p)).join("\n  ")}`,
	);
});

test("domain indexes do not claim more than they list", () => {
	// Each domain index states "共 N 篇". Verify N against the directory so the
	// count cannot drift away from the listing beneath it.
	for (const index of indexFiles) {
		const text = readFileSync(index, "utf8");
		const m = text.match(/共\s*(\d+)\s*篇/);
		if (!m) {
			continue;
		}
		const claimed = Number(m[1]);
		const dir = dirname(index);
		const actual = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "index.md").length;
		assert.equal(
			claimed,
			actual,
			`${relative(root, index)} claims ${claimed} docs but lists a directory with ${actual}`,
		);
	}
});
