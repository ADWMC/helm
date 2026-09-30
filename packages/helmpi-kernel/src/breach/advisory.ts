/**
 * Advisory ledger — guidance with machine-checkable adoption proof.
 * Distinct from completion (never writes done/finish).
 *
 * Downgrade rule (helm-d advisory-ledger.md, adopted in §4.6 E): a non-mandatory
 * advisory ignored on three separate occasions stops being rendered; `mandatory`
 * advisories are never downgraded. The tally is persisted in the ledger file, so
 * a restart does not reset how often an advisory was ignored.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type AdvisoryTier = "mandatory" | "recommended" | "hint";
export type Verdict = "adopted" | "ignored" | "delivered";

/** Ignore count at which a non-mandatory advisory stops being rendered. */
export const DOWNGRADE_AFTER_IGNORES = 3;

export type Proof =
	| { kind: "tool_called"; tools: string[]; argIncludes?: string }
	| { kind: "finding_recorded" }
	| { kind: "case_opened" }
	| { kind: "evidence_saved" }
	| { kind: "reference_read"; pathIncludes?: string }
	| { kind: "reply_shows"; markers: string[] }
	| { kind: "reply_avoids"; markers: string[] };

export interface Advisory {
	readonly key: string;
	readonly tier: AdvisoryTier;
	readonly content: string;
	readonly proof?: Proof;
	readonly withinTurns?: number;
}

export interface Reckoned {
	readonly key: string;
	readonly tier: AdvisoryTier;
	readonly verdict: Verdict;
	readonly turnsWaited: number;
}

export function defaultAdvisoryPath(): string {
	const root = process.env.HELPI_HOME ?? join(process.env.HOME ?? homedir(), ".helm-pi");
	return join(root, "advisories.jsonl");
}

export class AdvisoryLedger {
	private readonly path: string;
	private pending = new Map<string, { advisory: Advisory; atTurn: number }>();
	/** Persisted verdict tally per key: how often each advisory was judged. */
	private readonly tally = new Map<string, { adopted: number; ignored: number; delivered: number }>();

	constructor(path = defaultAdvisoryPath()) {
		this.path = path;
		mkdirSync(dirname(path), { recursive: true });
		if (!existsSync(path)) writeFileSync(path, "", "utf8");
		this.seedTally();
	}

	/** Rebuild per-key verdict counts from the append-only ledger. */
	private seedTally(): void {
		let raw = "";
		try {
			raw = readFileSync(this.path, "utf8");
		} catch {
			return;
		}
		for (const line of raw.split(/\r?\n/)) {
			if (!line.trim()) continue;
			let row: { key?: unknown; verdict?: unknown };
			try {
				row = JSON.parse(line) as { key?: unknown; verdict?: unknown };
			} catch {
				continue; // a torn line never invalidates the tally we already have
			}
			if (typeof row.key !== "string") continue;
			const slot = this.tally.get(row.key) ?? { adopted: 0, ignored: 0, delivered: 0 };
			if (row.verdict === "adopted") slot.adopted += 1;
			else if (row.verdict === "ignored") slot.ignored += 1;
			else if (row.verdict === "delivered") slot.delivered += 1;
			else continue;
			this.tally.set(row.key, slot);
		}
	}

	/** Times this key was judged ignored across the whole ledger. */
	ignoredCount(key: string): number {
		return this.tally.get(key)?.ignored ?? 0;
	}

	/**
	 * Whether a pending advisory still gets rendered. Mandatory advisories are
	 * never downgraded; others stop after {@link DOWNGRADE_AFTER_IGNORES}.
	 */
	isDowngraded(key: string, tier: AdvisoryTier): boolean {
		if (tier === "mandatory") return false;
		return this.ignoredCount(key) >= DOWNGRADE_AFTER_IGNORES;
	}

	submit(advisory: Advisory, atTurn: number): void {
		this.pending.set(advisory.key, { advisory, atTurn });
	}

	has(key: string): boolean {
		return this.pending.has(key);
	}

	/** Pending advisory keys for CvmSnapshot.advisoryKeys (§16.6 bridge). */
	pendingKeys(): string[] {
		return [...this.pending.keys()];
	}

	/** Content to inject at next assembly (mandatory never dropped, ignored keys降频). */
	renderPending(): string {
		const parts: string[] = [];
		for (const { advisory } of this.pending.values()) {
			if (advisory.tier === "hint" && parts.length >= 2) continue;
			if (this.isDowngraded(advisory.key, advisory.tier)) continue;
			parts.push(`[${advisory.tier}] ${advisory.content}`);
		}
		return parts.join("\n");
	}

	/** Keys suppressed by the downgrade rule right now (diagnostics). */
	downgradedKeys(): string[] {
		const out: string[] = [];
		for (const { advisory } of this.pending.values()) {
			if (this.isDowngraded(advisory.key, advisory.tier)) out.push(advisory.key);
		}
		return out;
	}

	/**
	 * Per-key adoption accounting over the whole ledger. This is the measurable
	 * side of the advisory loop (§4.4 可测指标): adoption is proven by a machine
	 * check, never by the model agreeing in prose.
	 */
	kpis(): Array<{ key: string; adopted: number; ignored: number; delivered: number; adoptionRate: number }> {
		return [...this.tally.entries()]
			.map(([key, t]) => {
				const judged = t.adopted + t.ignored;
				return {
					key,
					adopted: t.adopted,
					ignored: t.ignored,
					delivered: t.delivered,
					adoptionRate: judged === 0 ? 0 : t.adopted / judged,
				};
			})
			.sort((a, b) => b.adoptionRate - a.adoptionRate || a.key.localeCompare(b.key));
	}

	/**
	 * Reckon pending advisories against observable behavior.
	 * `turn` = current assistant turn index; `observed` = tools called / findings etc.
	 */
	reckon(
		turn: number,
		observed: {
			toolCalls?: readonly string[];
			findingRecorded?: boolean;
			caseOpened?: boolean;
			evidenceSaved?: boolean;
			replyText?: string;
		},
	): Reckoned[] {
		const out: Reckoned[] = [];
		for (const [key, entry] of [...this.pending]) {
			const waited = turn - entry.atTurn;
			const proof = entry.advisory.proof;
			let verdict: Verdict = "delivered";
			if (proof) {
				const ok = this.proofOk(proof, observed, waited, entry.advisory.withinTurns);
				verdict = ok ? "adopted" : waited >= (entry.advisory.withinTurns ?? 2) ? "ignored" : "delivered";
				if (verdict !== "delivered") this.pending.delete(key);
			} else if (waited >= 1) {
				this.pending.delete(key);
			}
			out.push({ key, tier: entry.advisory.tier, verdict, turnsWaited: waited });
		}
		for (const r of out) {
			const slot = this.tally.get(r.key) ?? { adopted: 0, ignored: 0, delivered: 0 };
			if (r.verdict === "adopted") slot.adopted += 1;
			else if (r.verdict === "ignored") slot.ignored += 1;
			else slot.delivered += 1;
			this.tally.set(r.key, slot);
		}
		this.append(out);
		return out;
	}

	private proofOk(
		proof: Proof,
		observed: {
			toolCalls?: readonly string[];
			findingRecorded?: boolean;
			caseOpened?: boolean;
			evidenceSaved?: boolean;
			replyText?: string;
		},
		waited: number,
		within?: number,
	): boolean {
		const limit = within ?? 2;
		switch (proof.kind) {
			case "tool_called": {
				const calls = observed.toolCalls ?? [];
				return proof.tools.some((t) => calls.includes(t));
			}
			case "finding_recorded":
				return observed.findingRecorded === true;
			case "case_opened":
				return observed.caseOpened === true;
			case "evidence_saved":
				return observed.evidenceSaved === true;
			case "reference_read":
				return (observed.toolCalls ?? []).includes("read_reference");
			case "reply_shows": {
				const text = observed.replyText ?? "";
				return proof.markers.some((m) => text.includes(m));
			}
			case "reply_avoids": {
				if (waited < limit) return false;
				const text = observed.replyText ?? "";
				return !proof.markers.some((m) => text.includes(m));
			}
			default:
				return false;
		}
	}

	private append(rows: readonly Reckoned[]): void {
		if (rows.length === 0) return;
		const lines = rows.map((r) => JSON.stringify({ ...r, at: Date.now() })).join("\n");
		appendFileSync(this.path, `${lines}\n`, "utf8");
	}

	stats(): { path: string; pending: number } {
		let _lines = 0;
		if (existsSync(this.path)) {
			_lines = readFileSync(this.path, "utf8").split(/\r?\n/).filter(Boolean).length;
		}
		return { path: this.path, pending: this.pending.size };
	}
}
