/** Tool memory — diagnostic-level notes (never finish_basis alone).
 *
 * W1-T06 upgrades to WG1.6: project `.helm/tool-memory.db` SQLite (config
 * separation — not `~/.helm-pi`, not pi paths), probe + last_verified
 * evidence discipline (failed re-verify → stale → never injected), and a
 * token-budgeted recall serializer for the G1 prompt segment (W2 wires it).
 * Legacy JSONL (~/.helm-pi/tool-memory.jsonl) migrates once on first open.
 */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type ToolMemScope = "global" | "workspace" | "target";
export type ToolMemKind = "tool" | "tactic" | "deadend" | "install";
export type ToolMemVerdict = "works" | "fails" | "unknown";
export type ToolMemStatus = "verified" | "stale";

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
	/** WG1.6: command that re-probes this locator (missing → never verified). */
	probe?: string;
	/** WG1.6: epoch ms of last SUCCESSFUL probe. */
	lastVerified?: number;
	/** WG1.6: verified | stale (failed probe or unprobed probation). */
	status: ToolMemStatus;
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
	return join(process.cwd(), ".helm", "tool-memory.db");
}

export function openToolMemory(path = defaultToolMemoryPath()): ToolMemoryStore {
	return new ToolMemoryStore(path);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tool_memory (
	id TEXT PRIMARY KEY,
	scope TEXT NOT NULL, scope_key TEXT NOT NULL, kind TEXT NOT NULL,
	name TEXT NOT NULL, target TEXT,
	verdict TEXT NOT NULL, confidence TEXT NOT NULL,
	note TEXT NOT NULL, evidence_refs TEXT NOT NULL, source TEXT NOT NULL,
	created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, hits INTEGER NOT NULL,
	probe TEXT, last_verified INTEGER, status TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tm_key ON tool_memory (scope, scope_key, kind, name, IFNULL(target, ''));
`;

interface Row {
	id: string;
	scope: string;
	scope_key: string;
	kind: string;
	name: string;
	target: string | null;
	verdict: string;
	confidence: string;
	note: string;
	evidence_refs: string;
	source: string;
	created_at: number;
	updated_at: number;
	hits: number;
	probe: string | null;
	last_verified: number | null;
	status: string;
}

function rowToEntry(r: Row): ToolMemoryEntry {
	return {
		id: r.id,
		scope: r.scope as ToolMemScope,
		scopeKey: r.scope_key,
		kind: r.kind as ToolMemKind,
		name: r.name,
		...(r.target ? { target: r.target } : {}),
		verdict: r.verdict as ToolMemVerdict,
		confidence: r.confidence as "high" | "medium" | "low",
		note: r.note,
		evidenceRefs: JSON.parse(r.evidence_refs) as string[],
		source: r.source as ToolMemoryEntry["source"],
		createdAt: r.created_at,
		updatedAt: r.updated_at,
		hits: r.hits,
		...(r.probe ? { probe: r.probe } : {}),
		...(r.last_verified ? { lastVerified: r.last_verified } : {}),
		status: r.status as ToolMemStatus,
	};
}

export class ToolMemoryStore {
	readonly path: string;
	private readonly db: DatabaseSync;

	constructor(path: string = defaultToolMemoryPath()) {
		this.path = path;
		mkdirSync(dirname(path), { recursive: true });
		this.db = new DatabaseSync(path);
		this.db.exec(SCHEMA);
		this.migrateLegacyJsonl();
	}

	/** One-shot import from the legacy helm-pi JSONL store (data continuity). */
	private migrateLegacyJsonl(): void {
		const legacy = join(process.env.HOME ?? homedir(), ".helm-pi", "tool-memory.jsonl");
		if (!existsSync(legacy)) return;
		const count = (this.db.prepare("SELECT COUNT(*) AS n FROM tool_memory").get() as { n: number }).n;
		if (count > 0) return;
		try {
			for (const line of readFileSync(legacy, "utf8").split(/\r?\n/).filter(Boolean)) {
				const e = JSON.parse(line) as ToolMemoryEntry;
				this.writeRow({
					...e,
					id: e.id ?? `tm-${randomUUID().slice(0, 8)}`,
					status: e.status ?? "stale",
				});
			}
			renameSync(legacy, `${legacy}.migrated.bak`);
		} catch {
			/* legacy best-effort */
		}
	}

	private writeRow(e: ToolMemoryEntry): void {
		this.db
			.prepare(
				`INSERT INTO tool_memory
				(id,scope,scope_key,kind,name,target,verdict,confidence,note,evidence_refs,source,created_at,updated_at,hits,probe,last_verified,status)
				VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
				ON CONFLICT (scope,scope_key,kind,name,IFNULL(target,'')) DO UPDATE SET
					verdict=excluded.verdict, confidence=excluded.confidence, note=excluded.note,
					evidence_refs=excluded.evidence_refs, updated_at=excluded.updated_at,
					hits=tool_memory.hits + 1, probe=COALESCE(excluded.probe, tool_memory.probe),
					last_verified=COALESCE(excluded.last_verified, tool_memory.last_verified),
					status=excluded.status`,
			)
			.run(
				e.id,
				e.scope,
				e.scopeKey,
				e.kind,
				e.name,
				e.target ?? null,
				e.verdict,
				e.confidence,
				e.note,
				JSON.stringify(e.evidenceRefs),
				e.source,
				e.createdAt,
				e.updatedAt,
				e.hits,
				e.probe ?? null,
				e.lastVerified ?? null,
				e.status,
			);
	}

	all(): ToolMemoryEntry[] {
		const rows = this.db.prepare("SELECT * FROM tool_memory ORDER BY updated_at DESC").all() as unknown as Row[];
		return rows.map(rowToEntry);
	}

	/** Upsert by (scope, scopeKey, kind, name, target) — same semantics as before. */
	upsert(
		input: Omit<ToolMemoryEntry, "id" | "createdAt" | "updatedAt" | "hits" | "status"> & {
			id?: string;
			hits?: number;
			status?: ToolMemStatus;
		},
	): ToolMemoryEntry {
		const now = Date.now();
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
			...(input.probe ? { probe: input.probe } : {}),
			...(input.lastVerified ? { lastVerified: input.lastVerified } : {}),
			status: input.status ?? (input.probe && input.lastVerified ? "verified" : "stale"),
		};
		const existing = this.db
			.prepare(
				"SELECT status, evidence_refs, verdict, note FROM tool_memory WHERE scope=? AND scope_key=? AND kind=? AND name=? AND IFNULL(target, '')=IFNULL(?, '')",
			)
			.get(next.scope, next.scopeKey, next.kind, next.name, next.target ?? null) as
			| { status?: string; evidence_refs?: string; verdict?: string; note?: string }
			| undefined;
		if (existing) {
			// Merge semantics preserved from the JSONL store: evidence union,
			// keep prior verdict when the new one is unknown, notes coalesce.
			const prevRefs = JSON.parse(existing.evidence_refs ?? "[]") as string[];
			next.evidenceRefs = [...new Set([...prevRefs, ...next.evidenceRefs])];
			if (next.verdict === "unknown" && existing.verdict && existing.verdict !== "unknown") {
				next.verdict = existing.verdict as ToolMemVerdict;
			}
			if (!next.note && existing.note) next.note = existing.note;
		}
		if (input.status === undefined && !input.lastVerified) {
			next.status = (existing?.status as ToolMemStatus | undefined) ?? "stale";
		}
		this.writeRow(next);
		const row = this.db
			.prepare(
				"SELECT * FROM tool_memory WHERE scope=? AND scope_key=? AND kind=? AND name=? AND IFNULL(target,'')=IFNULL(?, '')",
			)
			.get(next.scope, next.scopeKey, next.kind, next.name, next.target ?? null) as unknown as Row;
		return rowToEntry(row);
	}

	search(opts: {
		q?: string;
		target?: string;
		kind?: ToolMemKind;
		limit?: number;
		includeStale?: boolean;
	}): ToolMemoryEntry[] {
		const q = (opts.q ?? "").toLowerCase();
		const limit = opts.limit ?? 8;
		let rows = this.all();
		if (!opts.includeStale) rows = rows.filter((r) => r.status !== "stale");
		if (opts.kind) rows = rows.filter((r) => r.kind === opts.kind);
		if (opts.target) {
			const t = opts.target.toLowerCase();
			rows = rows.filter((r) => (r.target && r.target.toLowerCase() === t) || r.name.toLowerCase().includes(t));
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

	/**
	 * WG1.6: re-run an entry's probe command. Failure (nonzero exit / spawn
	 * error) flips the entry to `stale` — stale entries never reach recall
	 * injection. Success stamps `lastVerified`.
	 */
	verify(id: string, probeOverride?: string): ToolMemoryEntry | undefined {
		const row = this.db.prepare("SELECT * FROM tool_memory WHERE id=?").get(id) as unknown as Row | undefined;
		if (!row) return undefined;
		const entry = rowToEntry(row);
		const probe = probeOverride ?? entry.probe;
		if (!probe) return entry;
		let ok = false;
		try {
			const r = spawnSync(probe, { shell: true, encoding: "utf8", timeout: 10_000 });
			ok = r.status === 0;
		} catch {
			ok = false;
		}
		const now = Date.now();
		this.db
			.prepare(
				"UPDATE tool_memory SET status=?, verdict=?, last_verified=COALESCE(?, last_verified), updated_at=? WHERE id=?",
			)
			.run(ok ? "verified" : "stale", ok ? "works" : "fails", ok ? now : null, now, id);
		const after = this.db.prepare("SELECT * FROM tool_memory WHERE id=?").get(id) as unknown as Row;
		return rowToEntry(after);
	}

	/**
	 * WG1.6: budgeted recall for the G1 prompt segment (token cap → truncation
	 * at entry boundaries). Verified entries only; stale never injected.
	 */
	recallForPrompt(opts: { budgetTokens?: number; kind?: ToolMemKind; limit?: number } = {}): string {
		const budgetChars = (opts.budgetTokens ?? 600) * 4;
		const rows = this.search({
			...(opts.kind ? { kind: opts.kind } : {}),
			limit: opts.limit ?? 20,
			includeStale: false,
		});
		const lines: string[] = [];
		let used = 0;
		for (const r of rows) {
			const line = `- ${r.kind}/${r.scope}: ${r.name}${r.target ? ` @ ${r.target}` : ""} — ${r.note} (${r.verdict}${
				r.lastVerified ? `, verified ${new Date(r.lastVerified).toISOString().slice(0, 10)}` : ""
			})`;
			if (used + line.length + 1 > budgetChars) break;
			lines.push(line);
			used += line.length + 1;
		}
		return lines.join("\n");
	}

	close(): void {
		this.db.close();
	}

	static readonly DISCLAIMER = "Tool memory is diagnostic only — not evidence, never a sole finish_basis (P4/I6).";
}
