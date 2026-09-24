/** Tool memory — diagnostic-level notes (never finish_basis alone). */

import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type ToolMemScope = "global" | "workspace" | "target";
export type ToolMemKind = "tool" | "tactic" | "deadend" | "install";
export type ToolMemVerdict = "works" | "fails" | "unknown";

export interface ToolMemoryEntry {
	id: string;
	scope: ToolMemScope;
	scopeKey: string;
	kind: ToolMemKind;
	name: string;
	target?: string;
	verdict: ToolMemVerdict;
	confidence: "high" | "medium" | "low";
	note: string;
	evidenceRefs: string[];
	source: "session" | "agent" | "human";
	createdAt: number;
	updatedAt: number;
	hits: number;
}

export interface ToolMemoryConfig {
	enabled: boolean;
	injectOnPropose: boolean;
	maxInject: number;
}

export const DEFAULT_TOOL_MEMORY: ToolMemoryConfig = Object.freeze({
	enabled: true,
	injectOnPropose: true,
	maxInject: 5,
});

export function defaultToolMemoryPath(): string {
	return join(homedir(), ".helm-pi", "tool-memory.jsonl");
}

export function openToolMemory(path = defaultToolMemoryPath()): ToolMemoryStore {
	return new ToolMemoryStore(path);
}

export class ToolMemoryStore {
	readonly path: string;

	constructor(path: string = defaultToolMemoryPath()) {
		this.path = path;
		mkdirSync(dirname(path), { recursive: true });
		if (!existsSync(path)) writeFileSync(path, "", "utf8");
	}

	private load(): ToolMemoryEntry[] {
		if (!existsSync(this.path)) return [];
		return readFileSync(this.path, "utf8")
			.split(/\r?\n/)
			.filter(Boolean)
			.map((l) => {
				try {
					return JSON.parse(l) as ToolMemoryEntry;
				} catch {
					return null;
				}
			})
			.filter((x): x is ToolMemoryEntry => x !== null);
	}

	private saveAll(rows: ToolMemoryEntry[]): void {
		writeFileSync(this.path, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`, "utf8");
	}

	private append(row: ToolMemoryEntry): void {
		appendFileSync(this.path, `${JSON.stringify(row)}\n`, "utf8");
	}

	all(): ToolMemoryEntry[] {
		return this.load();
	}

	/**
	 * Upsert by (scope, scopeKey, kind, name, target).
	 * Same key → bump hits, update note/verdict/evidence.
	 */
	upsert(
		input: Omit<ToolMemoryEntry, "id" | "createdAt" | "updatedAt" | "hits"> & {
			id?: string;
			hits?: number;
		},
	): ToolMemoryEntry {
		const now = Date.now();
		const rows = this.load();
		const key = (e: ToolMemoryEntry) => [e.scope, e.scopeKey, e.kind, e.name, e.target ?? ""].join("\0");
		const next: ToolMemoryEntry = {
			id: input.id ?? `tm-${randomUUID().slice(0, 8)}`,
			scope: input.scope,
			scopeKey: input.scopeKey,
			kind: input.kind,
			name: input.name,
			...(input.target ? { target: input.target } : {}),
			verdict: input.verdict,
			confidence: input.confidence,
			note: input.note,
			evidenceRefs: [...new Set(input.evidenceRefs)],
			source: input.source,
			createdAt: now,
			updatedAt: now,
			hits: 1,
		};
		const idx = rows.findIndex((e) => key(e) === key(next));
		if (idx >= 0) {
			const prev = rows[idx]!;
			const merged: ToolMemoryEntry = {
				...prev,
				verdict: next.verdict !== "unknown" ? next.verdict : prev.verdict,
				confidence: next.confidence,
				note: next.note || prev.note,
				evidenceRefs: [...new Set([...prev.evidenceRefs, ...next.evidenceRefs])],
				updatedAt: now,
				hits: prev.hits + 1,
				...(next.target ? { target: next.target } : {}),
			};
			rows[idx] = merged;
			this.saveAll(rows);
			return merged;
		}
		this.append(next);
		return next;
	}

	search(opts: { q?: string; target?: string; kind?: ToolMemKind; limit?: number }): ToolMemoryEntry[] {
		const q = (opts.q ?? "").toLowerCase();
		const limit = opts.limit ?? 8;
		let rows = this.all();
		if (opts.kind) rows = rows.filter((r) => r.kind === opts.kind);
		if (opts.target) {
			const t = opts.target.toLowerCase();
			rows = rows.filter(
				(r) =>
					(r.target && r.target.toLowerCase() === t) ||
					r.target?.toLowerCase().includes(t) ||
					r.name.toLowerCase().includes(t),
			);
		}
		if (q) {
			rows = rows.filter(
				(r) =>
					r.name.toLowerCase().includes(q) ||
					r.note.toLowerCase().includes(q) ||
					r.kind.includes(q) ||
					(r.target ?? "").toLowerCase().includes(q),
			);
		}
		return rows.sort((a, b) => b.updatedAt - a.updatedAt || b.hits - a.hits).slice(0, limit);
	}

	static readonly DISCLAIMER = "Tool memory is diagnostic only — not evidence, never a sole finish_basis (P4/I6).";
}
