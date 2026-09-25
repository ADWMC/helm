/**
 * W4-T03: Spec.targetKind (url|host|sample_hash) + hash whitelist scope (§5.2).
 *   schema: strict 3-value enum · scope: fail-closed unchanged (I13/I14),
 *   sample_hash = EXACT whitelist (globs deliberately denied), host = host-level,
 *   unknown kind = fail-closed · G2: non-whitelisted hash blocked PRE-exec with
 *   journal {phase: pre-exec, at>0} (timestamped before any execution).
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI } from "@adwmc/helm-coding-agent";
import { validateHelmSpec } from "./config-schema.ts";
import { validateScopeQuery } from "./domain/scope.ts";
import type { Spec } from "./domain/types.ts";
import helmPiExtension from "./index.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function spec(over: Partial<Spec>): Spec {
	return { goal: "g", allowedTargets: [], highRisk: "deny", ...over } as Spec;
}

test("schema: targetKind accepts url|host|sample_hash, rejects others", () => {
	for (const k of ["url", "host", "sample_hash"]) {
		const r = validateHelmSpec({ goal: "g", allowedTargets: ["x"], highRisk: "deny", targetKind: k });
		assert.equal(r.ok, true, `${k}: ${JSON.stringify(r)}`);
	}
	const bad = validateHelmSpec({ goal: "g", allowedTargets: ["x"], highRisk: "deny", targetKind: "blob" });
	assert.equal(bad.ok, false);
	assert.ok(bad.failures.some((f) => f.path === "targetKind"));
});

test("sample_hash: exact whitelist allow / non-listed deny / glob entry denied / unknown kind fail-closed", () => {
	const s = spec({ targetKind: "sample_hash", allowedTargets: [HASH_A] });
	assert.equal(validateScopeQuery(s, HASH_A).allow, true);
	const deny = validateScopeQuery(s, HASH_B);
	assert.equal(deny.allow, false);
	assert.match(deny.reason, /target_not_allowed/);
	// globs are NOT honored in hash mode (精确比对)
	const globSpec = spec({ targetKind: "sample_hash", allowedTargets: ["aaaaaaaa*"] });
	const gd = validateScopeQuery(globSpec, HASH_A);
	assert.equal(gd.allow, false);
	assert.match(gd.matchedBy, /hash_glob_denied/);
	// unknown kind → fail-closed
	const weird = spec({ targetKind: "nope" as never, allowedTargets: [HASH_A] });
	const ud = validateScopeQuery(weird, HASH_A);
	assert.equal(ud.allow, false);
	assert.equal(ud.matchedBy, "target_kind_invalid");
});

test("host mode: host-level allow, path-independent, evil/unparseable/external deny", () => {
	const s = spec({ targetKind: "host", allowedTargets: ["http://127.0.0.1:18081/whatever*"] });
	assert.equal(validateScopeQuery(s, "http://127.0.0.1:18081/any/deep/path?q=1").allow, true);
	assert.equal(validateScopeQuery(s, "https://evil.example/x").allow, false);
	assert.equal(validateScopeQuery(s, "not a url at all!").allow, false, "unparseable → fail-closed");
	// external public host still needs allowExternal (fail-closed unchanged)
	const ext = spec({ targetKind: "host", allowedTargets: ["https://public.example.com/*"] });
	const e = validateScopeQuery(ext, "https://public.example.com/admin");
	assert.equal(e.allow, false);
	assert.equal(e.matchedBy, "fail_closed");
});

test("url mode: default behavior unchanged (regression spot)", () => {
	const s = spec({ allowedTargets: ["http://127.0.0.1:18081*"] });
	assert.equal(validateScopeQuery(s, "http://127.0.0.1:18081/notes?id=1").allow, true);
	assert.equal(validateScopeQuery(s, "http://evil.example/").allow, false);
});

function withCwd<T>(cwd: string, fn: () => T): T {
	const prev = process.cwd();
	process.chdir(cwd);
	try {
		return fn();
	} finally {
		process.chdir(prev);
	}
}

function fauxPi(): ExtensionAPI & { toolCalls: Array<(e: unknown) => unknown> } {
	const toolCalls: Array<(e: unknown) => unknown> = [];
	return {
		toolCalls,
		on(ev: string, h: unknown) {
			if (ev === "tool_call") toolCalls.push(h as (e: unknown) => unknown);
		},
		registerTool() {},
		registerCommand() {},
		setLabel() {},
	} as unknown as ExtensionAPI & { toolCalls: Array<(e: unknown) => unknown> };
}

test("G2 negative: non-whitelisted hash blocked pre-exec + journal timestamped; whitelisted passes", () => {
	const cwd = mkdtempSync(join(tmpdir(), "helm-t03-"));
	try {
		mkdirSync(join(cwd, ".helm"), { recursive: true });
		writeFileSync(
			join(cwd, ".helm", "spec.json"),
			JSON.stringify({
				goal: "sample hashing run over authorized binaries with explicit hash list 1 entry",
				allowedTargets: [HASH_A],
				highRisk: "deny",
				maxTokens: 100000,
				targetKind: "sample_hash",
				diagnosticSet: ["hash list"],
			}),
			"utf8",
		);
		withCwd(cwd, () => {
			const pi = fauxPi();
			helmPiExtension(pi);
			// denied hash → block verdict (nothing executes)
			let verdict: { block?: boolean; reason?: string } | undefined;
			for (const h of pi.toolCalls) {
				verdict = h({
					toolName: "bash",
					input: { hash: HASH_B, command: `sha256sum ${HASH_B}` },
				}) as typeof verdict;
			}
			assert.equal(verdict?.block, true, "non-listed hash must block pre-exec");
			assert.match(verdict?.reason ?? "", /scope_denied/);
			// journaled with phase pre-exec + timestamp
			const { Ledger } = require_ledger();
			// homedir(): process.env.HOME is undefined for node spawned by pwsh on Windows
			// → relative ".helm/..." landed inside the temp cwd → open sqlite handle → rmSync EPERM
			const led = new Ledger(join(homedir(), ".helm", "agent", "phase.db"));
			const rows = led.journal().filter((r) => r.kind === "scope_denied");
			const last = rows[rows.length - 1];
			assert.ok(last, "journal row exists");
			const p = JSON.parse(last?.payloadJson ?? "{}");
			assert.equal(p.phase, "pre-exec");
			assert.equal(p.target, HASH_B);
			assert.ok(Number(last?.at) > 0, "at timestamp present (时间戳序)");
			led.close();
			// whitelisted hash → no block (falls through)
			let pass: unknown;
			for (const h of pi.toolCalls) {
				pass = h({ toolName: "bash", input: { hash: HASH_A, command: `sha256sum ${HASH_A}` } });
			}
			assert.equal(pass, undefined, "whitelisted hash passes (no verdict)");
		});
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

function require_ledger(): {
	Ledger: new (p: string) => { journal(): Array<{ kind: string; payloadJson?: string; at?: number }>; close(): void };
} {
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- static ESM import at top would drag index graph ordering; dynamic below
	return ledgerModule;
}

let ledgerModule: {
	Ledger: new (p: string) => { journal(): Array<{ kind: string; payloadJson?: string; at?: number }>; close(): void };
};
// loaded synchronously before tests via top-level await
const mod = await import("./ledger.ts");
ledgerModule = mod as unknown as typeof ledgerModule;
