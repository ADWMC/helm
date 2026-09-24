/**
 * Advisory ledger — guidance with machine-checkable adoption proof.
 * Distinct from completion (never writes done/finish).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type AdvisoryTier = "mandatory" | "recommended" | "hint";
export type Verdict = "adopted" | "ignored" | "delivered";

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
	const root = process.env.HELPI_HOME ?? join(process.env.HOME ?? "", ".helm-pi");
	return join(root, "advisories.jsonl");
}

export class AdvisoryLedger {
	private readonly path: string;
	private pending = new Map<string, { advisory: Advisory; atTurn: number }>();

	constructor(path = defaultAdvisoryPath()) {
		this.path = path;
		mkdirSync(dirname(path), { recursive: true });
		if (!existsSync(path)) writeFileSync(path, "", "utf8");
	}

	submit(advisory: Advisory, atTurn: number): void {
		this.pending.set(advisory.key, { advisory, atTurn });
	}

	has(key: string): boolean {
		return this.pending.has(key);
	}

	/** Content to inject at next assembly (mandatory never dropped). */
	renderPending(): string {
		const parts: string[] = [];
		for (const { advisory } of this.pending.values()) {
			if (advisory.tier === "hint" && parts.length >= 2) continue;
			parts.push(`[${advisory.tier}] ${advisory.content}`);
		}
		return parts.join("\n");
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
