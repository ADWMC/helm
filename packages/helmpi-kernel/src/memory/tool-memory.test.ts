import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	DEFAULT_TOOL_MEMORY,
	defaultToolMemoryPath,
	openToolMemory,
	ToolMemoryStore,
	type ToolMemVerdict,
} from "./tool-memory.ts";

function tmpStore() {
	const dir = mkdtempSync(join(tmpdir(), "helmpi-tm-"));
	return { dir, store: openToolMemory(join(dir, "tm.jsonl")) };
}

test("register then search by name", () => {
	const { dir, store } = tmpStore();
	try {
		store.upsert({
			scope: "workspace",
			scopeKey: "ws1",
			kind: "tool",
			name: "detect_packer",
			verdict: "works",
			confidence: "high",
			note: "UPX OK",
			evidenceRefs: ["E-002"],
			source: "agent",
			status: "verified" as const,
		});
		const hits = store.search({ q: "packer" });
		assert.equal(hits.length, 1);
		assert.equal(hits[0]!.evidenceRefs[0], "E-002");
		assert.match(ToolMemoryStore.DISCLAIMER, /not evidence/i);
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

test("upsert same key bumps hits and merges evidence", () => {
	const { dir, store } = tmpStore();
	try {
		const base = {
			scope: "target" as const,
			scopeKey: "127.0.0.1:18081",
			kind: "tactic" as const,
			name: "sqli-auth",
			target: "127.0.0.1:18081",
			verdict: "works" as ToolMemVerdict,
			confidence: "medium" as const,
			note: "tautology on user",
			evidenceRefs: ["E-004"],
			source: "agent" as const,
			status: "verified" as const,
		};
		const a = store.upsert(base);
		const b = store.upsert({ ...base, note: "confirmed with control 401", evidenceRefs: ["E-005"] });
		assert.equal(b.hits, 2);
		assert.deepEqual(b.evidenceRefs.sort(), ["E-004", "E-005"]);
		assert.equal(store.all().length, 1);
		void a;
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

test("deadend search and kind filter", () => {
	const { dir, store } = tmpStore();
	try {
		store.upsert({
			scope: "global",
			scopeKey: "",
			kind: "deadend",
			name: "sqlmap-tamper-x",
			target: "lab",
			verdict: "fails",
			confidence: "high",
			note: "WAF always 403",
			evidenceRefs: ["E-010"],
			source: "session",
			status: "verified" as const,
		});
		const dead = store.search({ kind: "deadend" });
		assert.equal(dead.length, 1);
		assert.equal(dead[0]!.verdict, "fails");
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

// —— WG1.6 evidence discipline (W1-T06) ——

test("WG1.6 1 default path is project .helm/tool-memory.db (config separation)", () => {
	const p = defaultToolMemoryPath();
	assert.ok(p.endsWith(join(".helm", "tool-memory.db")), p);
	assert.ok(!p.includes(".helm-pi"), "legacy home path must be gone");
});

test("WG1.6 2 fake locator probe fails -> stale -> never recalled", () => {
	const { dir, store } = tmpStore();
	try {
		const e = store.upsert({
			scope: "workspace",
			scopeKey: dir,
			kind: "tool",
			name: "ghost-scanner",
			verdict: "works",
			confidence: "high",
			note: "seeded without probe",
			evidenceRefs: [],
			source: "agent",
			probe: "definitely-not-a-real-binary-xyz",
		});
		const after = store.verify(e.id);
		assert.equal(after?.status, "stale", "failed probe must flip to stale");
		const recalled = store.recallForPrompt();
		assert.ok(!recalled.includes("ghost-scanner"), "stale entries must not be injected");
		const withStale = store.search({ q: "ghost", includeStale: true });
		assert.equal(withStale.length, 1, "stays visible to humans with includeStale");
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

test("WG1.6 2b passing probe stamps lastVerified and status=verified", () => {
	const { dir, store } = tmpStore();
	try {
		const e = store.upsert({
			scope: "workspace",
			scopeKey: dir,
			kind: "tool",
			name: "node-bin",
			verdict: "works",
			confidence: "high",
			note: "runtime",
			evidenceRefs: [],
			source: "agent",
			probe: "node --version",
		});
		const after = store.verify(e.id);
		assert.equal(after?.status, "verified");
		assert.ok((after?.lastVerified ?? 0) > 0);
		assert.ok(store.recallForPrompt().includes("node-bin"));
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

test("WG1.6 3 recall truncates at entry boundary under token budget", () => {
	const { dir, store } = tmpStore();
	try {
		for (let i = 0; i < 20; i++) {
			store.upsert({
				scope: "workspace",
				scopeKey: dir,
				kind: "tool",
				name: `tool-${String(i).padStart(2, "0")}-with-a-descriptive-name`,
				verdict: "works",
				confidence: "high",
				note: `probe note ${i} plus some padding text to consume budget quickly`,
				evidenceRefs: [],
				source: "agent",
				probe: "node --version",
				status: "verified",
			});
		}
		const full = store.recallForPrompt({ budgetTokens: 10000 });
		const tight = store.recallForPrompt({ budgetTokens: 20 });
		assert.ok(full.split("\n").length > tight.split("\n").length, "budget must cut lines");
		for (const l of tight.split("\n").filter(Boolean)) assert.ok(l.startsWith("- "), "whole lines only");
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

test("WG1.6 4 default config enabled=true (默认开)", () => {
	assert.equal(DEFAULT_TOOL_MEMORY.enabled, true);
	assert.equal(DEFAULT_TOOL_MEMORY.injectOnPropose, true);
});
