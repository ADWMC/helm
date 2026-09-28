/**
 * Phase contract in the prompt (S3a).
 *
 * The runtime enforces two boundaries: `loop.ts` fails a run when one step kind
 * repeats past the limit, and `completion.ts:compileFinish` rejects a finish
 * whose basis is not grounded in a done step's receipt. Before this change
 * neither boundary appeared in any prompt segment, so a model could only learn
 * them by being rejected by them.
 *
 * These tests pin the prompt's side of the contract to the runtime's, so the
 * statement cannot drift away from the enforcement.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_SAME_KIND_LIMIT } from "./domain/completion.ts";
import { composeSystemPrompt, DEFAULT_STEP_KINDS } from "./prompt-lib.ts";

const cwd = process.cwd();

function prompt(extra: { sameKindLimit?: number; stepKinds?: readonly string[] } = {}): string {
	return composeSystemPrompt({ tier: "full", cwd, reminders: [], ...extra });
}

test("phase contract is present in the composed prompt", () => {
	const text = prompt();
	assert.match(text, /<helm_phase>/);
	assert.match(text, /PHASE CONTRACT/);
	assert.match(text, /kind is a hard boundary/);
});

test("both tiers carry the phase contract", () => {
	const lite = composeSystemPrompt({ tier: "lite", cwd, reminders: [] });
	const full = composeSystemPrompt({ tier: "full", cwd, reminders: [] });
	assert.match(lite, /<helm_phase>/);
	assert.match(full, /<helm_phase>/);
});

test("the stated same-kind limit equals the enforced default", () => {
	const text = prompt();
	assert.match(
		text,
		new RegExp(`${DEFAULT_SAME_KIND_LIMIT} consecutive steps of one kind`),
		`prompt must state the loop's own default (${DEFAULT_SAME_KIND_LIMIT})`,
	);
});

test("an explicit limit overrides the stated one", () => {
	const text = prompt({ sameKindLimit: 3 });
	assert.match(text, /3 consecutive steps of one kind/);
	assert.doesNotMatch(text, new RegExp(`${DEFAULT_SAME_KIND_LIMIT} consecutive steps of one kind`));
});

test("every kind the compiler accepts appears in the prompt", () => {
	// Read the accept-set out of propose.ts rather than restating it here. A
	// hardcoded list in the test would only prove the test agrees with itself; a
	// kind added to the compiler must fail this until the prompt mentions it.
	const src = readFileSync(fileURLToPath(new URL("./propose.ts", import.meta.url)), "utf8");
	const block = src.match(/const KINDS: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\);/);
	assert.ok(block, "could not locate the KINDS accept-set in propose.ts");
	const accepted = [...block[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
	assert.ok(accepted.length >= 6, `parsed only ${accepted.length} kinds from propose.ts`);

	const text = prompt();
	for (const kind of accepted) {
		assert.match(
			text,
			new RegExp(`\\b${kind}\\b`),
			`kind ${kind} is accepted by the compiler but absent from the prompt`,
		);
	}
	assert.deepEqual(
		[...DEFAULT_STEP_KINDS].sort(),
		[...accepted].sort(),
		"prompt kind list and compiler accept-set diverged",
	);
});

test("the six PentestGPT-parity kinds carry their separation wording", () => {
	const text = prompt();
	// The boundary is the point: without these lines the model sees a list of
	// names, not a rule about what each kind may do.
	assert.match(text, /discover\s+- map the surface/);
	assert.match(text, /exploit\s+- pursue the goal/);
	assert.match(text, /test\s+- run the smallest baseline/);
	assert.match(text, /verify\s+- confirm or falsify/);
	assert.match(text, /recover\s+- restore a blocked path/);
	assert.match(text, /enumerate\s+- expand only the named surface/);
});

test("the finish basis rule is stated, matching compileFinish", () => {
	const text = prompt();
	assert.match(text, /finish is accepted only with a basis/);
	assert.match(text, /exact slice/);
	// compileFinish rejects these three shapes; the prompt must say so up front.
	assert.match(text, /summary, a paraphrase, a truncated excerpt, or a self-report is not/);
	assert.match(text, /Open steps block a finish/);
});

test("the convergence outcome is named so it is recognisable", () => {
	const text = prompt();
	assert.match(text, /convergence_exhausted/);
});
