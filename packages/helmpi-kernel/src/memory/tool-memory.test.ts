import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openToolMemory, ToolMemoryStore, type ToolMemVerdict } from "./tool-memory.ts";

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
