/**
 * Frozen minimal contracts for the helm runtime wiring (REDESIGN §4.2, §4.4,
 * §10.6, §10.8, §16.3). Pure types + fail-closed validators; no host or I/O.
 *
 * Authority split (invariant): RecoveryAction is ALWAYS a candidate — the
 * execution authority lives in the Tool Gateway decision. Nothing in this file
 * can grant execution.
 */

import { createHash } from "node:crypto";

// ─── refusal event (after-stream) ───────────────────────────────────────────

/** Structured refusal observation. Never rewritten; transcript stays untouched. */
export interface RefusalEvent {
	readonly kind: "refusal_detected";
	readonly runId: string;
	readonly turn: number;
	readonly stepId: string | null;
	/** Trimmed refusal excerpt (audit only — never fed back as policy). */
	readonly excerpt: string;
	readonly stance: "refusal" | "challenged";
	readonly at: number;
}

// ─── RecoveryAction (candidate only) ────────────────────────────────────────

/** Bounded recovery moves — closed set (REDESIGN §4.4 layer 2). */
export type RecoveryKind = "restate_task" | "readonly_diagnostics" | "alt_tool" | "continue_step";

export type RecoverySource = "helmd" | "helmx";

export interface RecoveryRequest {
	/** Human-readable bounded request; advisory data, never authority. */
	readonly directive: string;
	readonly tool?: string;
	readonly target?: string;
}

export interface RecoveryAction {
	readonly id: string;
	readonly kind: RecoveryKind;
	readonly source: RecoverySource;
	readonly stepId: string | null;
	readonly request: RecoveryRequest;
	readonly rationale: string;
	/** 1 = helmd normal retry, 2 = helmx fallback. */
	readonly attempt: number;
	/** Fingerprint of the frozen Spec the candidate was generated against. */
	readonly specHash: string;
}

// ─── CVM snapshot (REDESIGN §16.3) ──────────────────────────────────────────

export interface Sensorium {
	readonly momentum: number;
	readonly pressure: number;
	readonly verificationCoverage: number;
	readonly complexity: number;
	readonly freshness: number;
	readonly stability: number;
	readonly quality: {
		readonly coverage: "measured" | "vacuous";
		readonly stability: "measured" | "partial";
	};
}

export type RunStrategy = "continue" | "verify" | "challenge" | "recover" | "pause";

export interface CvmSnapshot {
	readonly runId: string;
	readonly turn: number;
	readonly sensorium: Sensorium;
	readonly strategy: RunStrategy;
	readonly advisoryKeys: readonly string[];
	readonly evidenceIds: readonly string[];
	readonly at: number;
}

// ─── Gateway decision (REDESIGN §10.6) ──────────────────────────────────────

export type GatewayGate = "scope" | "capability" | "budget" | "tripwire" | "sandbox";

/** Pre-execution decision: only `allow` reaches the tool runner. */
export type GatewayDecision =
	| { readonly kind: "allow" }
	| { readonly kind: "denied"; readonly gate: GatewayGate; readonly reason: string }
	| { readonly kind: "failed"; readonly reason: string };

/** Contract shape of `execute(request, context)` (REDESIGN §10.6). */
export type GatewayExecutionResult =
	| { readonly kind: "receipt"; readonly receipt: ReceiptEvent }
	| { readonly kind: "denied"; readonly gate: GatewayGate; readonly reason: string }
	| { readonly kind: "failed"; readonly reason: string };

// ─── Receipt / Evidence events ──────────────────────────────────────────────

export type ExecutionSource = "model" | "recovery";

export interface ReceiptEvent {
	readonly seq: number;
	readonly tool: string;
	readonly argsSummary: string;
	readonly target: string | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	readonly timedOut?: boolean;
	readonly source: ExecutionSource;
	readonly at: number;
}

export interface EvidenceEvent {
	readonly id: string;
	readonly receiptSeq: number;
	/** Exact slice of the receipt output — never a paraphrase. */
	readonly excerpt: string;
	readonly status: "exploited" | "confirmed" | "unconfirmed";
	readonly sourceStep: string | null;
	readonly at: number;
}

// ─── recovery state machine (one-way, REDESIGN §4.4) ────────────────────────

export type RecoveryState =
	| "normal"
	| "refusal_detected"
	| "recovery_proposed"
	| "recovery_denied"
	| "recovery_executed"
	| "recovery_exhausted";

const RECOVERY_ORDER: readonly RecoveryState[] = [
	"normal",
	"refusal_detected",
	"recovery_proposed",
	"recovery_denied",
	"recovery_executed",
	"recovery_exhausted",
];

/** States can only move forward — a failed recovery never returns to normal. */
export function canTransitionRecovery(from: RecoveryState, to: RecoveryState): boolean {
	return RECOVERY_ORDER.indexOf(to) > RECOVERY_ORDER.indexOf(from);
}

// ─── frozen journal event keys (English, machine contract) ──────────────────

export const JOURNAL_KEYS = {
	refusalDetected: "refusal_detected",
	recoverySelected: "recovery_selected",
	recoveryExecuted: "recovery_executed",
	recoveryDenied: "recovery_denied",
	recoveryExhausted: "recovery_exhausted",
	scopeDenied: "scope_denied",
	tripwireBlocked: "tripwire",
	budgetExhausted: "token_budget_exhausted",
	receiptWritten: "receipt_written",
	evidenceAdded: "evidence_added",
	reviewGate: "review_gate",
	cvmSnapshot: "cvm_snapshot",
} as const;

export type JournalKey = (typeof JOURNAL_KEYS)[keyof typeof JOURNAL_KEYS];

// ─── fail-closed validators ─────────────────────────────────────────────────

export class ContractError extends Error {
	readonly contract: string;
	constructor(contract: string, message: string) {
		super(message);
		this.name = "ContractError";
		this.contract = contract;
	}
}

function requireString(value: unknown, contract: string, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new ContractError(contract, `${field} must be a non-empty string`);
	}
	return value;
}

function requireText(value: unknown, contract: string, field: string): string {
	if (typeof value !== "string") {
		throw new ContractError(contract, `${field} must be a string`);
	}
	return value;
}

function requireNumber(value: unknown, contract: string, field: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new ContractError(contract, `${field} must be a finite number`);
	}
	return value;
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: readonly string[], contract: string): void {
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key)) {
			throw new ContractError(contract, `unknown field: ${key}`);
		}
	}
}

const RECOVERY_KINDS: readonly RecoveryKind[] = ["restate_task", "readonly_diagnostics", "alt_tool", "continue_step"];

const RECOVERY_SOURCES: readonly RecoverySource[] = ["helmd", "helmx"];

export function parseRecoveryAction(raw: unknown): RecoveryAction {
	const contract = "RecoveryAction";
	if (!raw || typeof raw !== "object") throw new ContractError(contract, "not an object");
	const obj = raw as Record<string, unknown>;
	rejectUnknownFields(
		obj,
		["id", "kind", "source", "stepId", "request", "rationale", "attempt", "specHash"],
		contract,
	);
	const kind = requireString(obj.kind, contract, "kind");
	if (!RECOVERY_KINDS.includes(kind as RecoveryKind)) {
		throw new ContractError(contract, `kind must be one of ${RECOVERY_KINDS.join("|")}`);
	}
	const source = requireString(obj.source, contract, "source");
	if (!RECOVERY_SOURCES.includes(source as RecoverySource)) {
		throw new ContractError(contract, `source must be one of ${RECOVERY_SOURCES.join("|")}`);
	}
	if (obj.stepId !== null && typeof obj.stepId !== "string") {
		throw new ContractError(contract, "stepId must be string or null");
	}
	const request = obj.request;
	if (!request || typeof request !== "object") throw new ContractError(contract, "request must be an object");
	const reqObj = request as Record<string, unknown>;
	rejectUnknownFields(reqObj, ["directive", "tool", "target"], `${contract}.request`);
	requireString(reqObj.directive, `${contract}.request`, "directive");
	const attempt = requireNumber(obj.attempt, contract, "attempt");
	if (attempt !== 1 && attempt !== 2) {
		throw new ContractError(contract, "attempt must be 1 (helmd) or 2 (helmx)");
	}
	return raw as RecoveryAction;
}

export function parseRefusalEvent(raw: unknown): RefusalEvent {
	const contract = "RefusalEvent";
	if (!raw || typeof raw !== "object") throw new ContractError(contract, "not an object");
	const obj = raw as Record<string, unknown>;
	rejectUnknownFields(obj, ["kind", "runId", "turn", "stepId", "excerpt", "stance", "at"], contract);
	requireString(obj.kind, contract, "kind");
	requireString(obj.runId, contract, "runId");
	requireNumber(obj.turn, contract, "turn");
	if (obj.stepId !== null && typeof obj.stepId !== "string") {
		throw new ContractError(contract, "stepId must be string or null");
	}
	requireString(obj.excerpt, contract, "excerpt");
	if (obj.stance !== "refusal" && obj.stance !== "challenged") {
		throw new ContractError(contract, "stance must be refusal|challenged");
	}
	requireNumber(obj.at, contract, "at");
	return raw as RefusalEvent;
}

export function parseCvmSnapshot(raw: unknown): CvmSnapshot {
	const contract = "CvmSnapshot";
	if (!raw || typeof raw !== "object") throw new ContractError(contract, "not an object");
	const obj = raw as Record<string, unknown>;
	rejectUnknownFields(obj, ["runId", "turn", "sensorium", "strategy", "advisoryKeys", "evidenceIds", "at"], contract);
	requireString(obj.runId, contract, "runId");
	requireNumber(obj.turn, contract, "turn");
	const sensorium = obj.sensorium;
	if (!sensorium || typeof sensorium !== "object") throw new ContractError(contract, "sensorium must be an object");
	const s = sensorium as Record<string, unknown>;
	rejectUnknownFields(
		s,
		["momentum", "pressure", "verificationCoverage", "complexity", "freshness", "stability", "quality"],
		`${contract}.sensorium`,
	);
	for (const dim of ["momentum", "pressure", "verificationCoverage", "complexity", "freshness", "stability"]) {
		requireNumber(s[dim], `${contract}.sensorium`, dim);
	}
	const quality = s.quality;
	if (!quality || typeof quality !== "object") throw new ContractError(contract, "quality must be an object");
	const q = quality as Record<string, unknown>;
	rejectUnknownFields(q, ["coverage", "stability"], `${contract}.sensorium.quality`);
	if (q.coverage !== "measured" && q.coverage !== "vacuous") {
		throw new ContractError(contract, "quality.coverage must be measured|vacuous");
	}
	if (q.stability !== "measured" && q.stability !== "partial") {
		throw new ContractError(contract, "quality.stability must be measured|partial");
	}
	const strategies: readonly RunStrategy[] = ["continue", "verify", "challenge", "recover", "pause"];
	if (!strategies.includes(obj.strategy as RunStrategy)) {
		throw new ContractError(contract, `strategy must be one of ${strategies.join("|")}`);
	}
	if (!Array.isArray(obj.advisoryKeys) || !obj.evidenceIds) {
		throw new ContractError(contract, "advisoryKeys/evidenceIds must be arrays");
	}
	requireNumber(obj.at, contract, "at");
	return raw as CvmSnapshot;
}

export function parseGatewayDecision(raw: unknown): GatewayDecision {
	const contract = "GatewayDecision";
	if (!raw || typeof raw !== "object") throw new ContractError(contract, "not an object");
	const obj = raw as Record<string, unknown>;
	const kind = obj.kind;
	if (kind === "allow") {
		rejectUnknownFields(obj, ["kind"], contract);
		return { kind: "allow" };
	}
	if (kind === "denied") {
		rejectUnknownFields(obj, ["kind", "gate", "reason"], contract);
		const gates: readonly GatewayGate[] = ["scope", "capability", "budget", "tripwire", "sandbox"];
		if (!gates.includes(obj.gate as GatewayGate)) {
			throw new ContractError(contract, `gate must be one of ${gates.join("|")}`);
		}
		requireString(obj.reason, contract, "reason");
		return raw as GatewayDecision;
	}
	if (kind === "failed") {
		rejectUnknownFields(obj, ["kind", "reason"], contract);
		requireString(obj.reason, contract, "reason");
		return raw as GatewayDecision;
	}
	throw new ContractError(contract, "kind must be allow|denied|failed");
}

export function parseReceiptEvent(raw: unknown): ReceiptEvent {
	const contract = "ReceiptEvent";
	if (!raw || typeof raw !== "object") throw new ContractError(contract, "not an object");
	const obj = raw as Record<string, unknown>;
	rejectUnknownFields(
		obj,
		["seq", "tool", "argsSummary", "target", "stdout", "stderr", "exitCode", "timedOut", "source", "at"],
		contract,
	);
	requireNumber(obj.seq, contract, "seq");
	requireString(obj.tool, contract, "tool");
	requireText(obj.argsSummary, contract, "argsSummary");
	if (obj.target !== null && typeof obj.target !== "string") {
		throw new ContractError(contract, "target must be string or null");
	}
	requireText(obj.stdout, contract, "stdout");
	requireText(obj.stderr, contract, "stderr");
	requireNumber(obj.exitCode, contract, "exitCode");
	if (obj.source !== "model" && obj.source !== "recovery") {
		throw new ContractError(contract, "source must be model|recovery");
	}
	requireNumber(obj.at, contract, "at");
	return raw as ReceiptEvent;
}

export function parseEvidenceEvent(raw: unknown): EvidenceEvent {
	const contract = "EvidenceEvent";
	if (!raw || typeof raw !== "object") throw new ContractError(contract, "not an object");
	const obj = raw as Record<string, unknown>;
	rejectUnknownFields(obj, ["id", "receiptSeq", "excerpt", "status", "sourceStep", "at"], contract);
	requireString(obj.id, contract, "id");
	requireNumber(obj.receiptSeq, contract, "receiptSeq");
	requireString(obj.excerpt, contract, "excerpt");
	if (obj.status !== "exploited" && obj.status !== "confirmed" && obj.status !== "unconfirmed") {
		throw new ContractError(contract, "status must be exploited|confirmed|unconfirmed");
	}
	if (obj.sourceStep !== null && typeof obj.sourceStep !== "string") {
		throw new ContractError(contract, "sourceStep must be string or null");
	}
	requireNumber(obj.at, contract, "at");
	return raw as EvidenceEvent;
}

// ─── spec fingerprint (candidates bind to the frozen Spec) ───────────────────

export function specFingerprint(spec: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(spec ?? null))
		.digest("hex")
		.slice(0, 16);
}
