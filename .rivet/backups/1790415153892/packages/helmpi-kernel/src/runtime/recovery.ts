/**
 * 破甲层 — bounded refusal recovery (REDESIGN §4.4/§4.6/§14.3).
 *
 * Recovery actions are CANDIDATES only: `helmd` proposes one bounded normal
 * retry, `helmx` at most one fallback candidate per step, and every candidate
 * is re-validated through the Tool Gateway before it can influence anything.
 * Per-step budget (1 helmd + 1 helmx) is persisted — a process restart never
 * refills it. The state machine only moves forward; a failed recovery never
 * returns to `normal`.
 */

import { normalizeInput } from "../breach/input-normalizer.ts";
import { classifyStance } from "../breach/refusal.ts";
import type { RefusalEvent, RecoveryAction, RecoveryKind, RecoveryState } from "./contracts.ts";
import {
	canTransitionRecovery,
	ContractError,
	JOURNAL_KEYS,
	parseRecoveryAction,
	specFingerprint,
} from "./contracts.ts";
import type { GatewayRequest, ToolGateway } from "./gateway.ts";

export const HELMD_BUDGET_PER_STEP = 1;
export const HELMX_BUDGET_PER_STEP = 1;

export interface RecoveryStore {
	journalEvent(kind: string, payload: unknown): number;
	setMeta(key: string, value: string): void;
	getMeta(key: string): string | null;
}

interface EpisodeRecord {
	state: RecoveryState;
	helmdUsed: number;
	helmxUsed: number;
	specHash: string;
	pendingActionId: string | null;
}

export interface RecoveryDeps {
	readonly store: RecoveryStore;
	readonly gateway: ToolGateway;
	readonly readSpecHash: () => string;
	/** Frozen step target for scope comparison; null when the step carries none. */
	readonly resolveStepTarget: (stepId: string | null) => string | null;
	readonly clock?: () => number;
}

export interface RecoveryOutcome {
	readonly state: RecoveryState;
	readonly action: RecoveryAction | null;
	readonly directive: string | null;
	readonly reason?: string;
}

/** helmx adapter input (REDESIGN §4.6 B). */
export interface HelmxRequest {
	readonly runId: string;
	readonly stepId: string | null;
	readonly refusalExcerpt: string;
	readonly triggerProfile: readonly string[];
	readonly normalizedGoal: string;
	readonly specHash: string;
	readonly attempts: { readonly helmd: number; readonly helmx: number };
}

/** helmx adapter output — candidate data only, never authority (§14.2). */
export interface HelmxResponse {
	readonly strategyId: string;
	readonly candidateRequest: { readonly directive: string; readonly tool?: string; readonly target?: string };
	readonly rationale: string;
	readonly confidence: number;
	readonly source: "library" | "generated";
}

const TRIGGER_MARKERS: readonly { readonly id: string; readonly re: RegExp }[] = [
	{ id: "policy_refusal", re: /无法(?:协助|提供|满足)|can(?:not|'?t)\s+(?:assist|help|provide)/i },
	{ id: "scope_anxiety", re: /超出|范围|out of scope|authorization/i },
	{ id: "safety_hedge", re: /安全(?:考虑|起见)|safety|policy/i },
];

/** Refusal excerpt → trigger profile (original text is NOT propagated). */
export function triggerProfileOf(excerpt: string): string[] {
	return TRIGGER_MARKERS.filter((m) => m.re.test(excerpt)).map((m) => m.id);
}

/**
 * helmd adapter: one bounded normal retry — normalize the frozen goal into an
 * engineering restatement. Expression only, never scope (§4.6 A).
 */
export function helmdPropose(
	event: RefusalEvent,
	stepTarget: string | null,
	specHash: string,
): RecoveryAction {
	const goal = normalizeInput(event.runId ? event.stepId ?? "" : "") || event.stepId || "current task";
	return {
		id: `rec-${event.at}-helmd`,
		kind: "restate_task",
		source: "helmd",
		stepId: event.stepId,
		request: {
			directive: `Re-deliver the same in-scope technical task in engineering terms (${goal}); stay read-only first and cite receipts for every observation.`,
			...(stepTarget ? { target: stepTarget } : {}),
		},
		rationale: "delivery refusal on an in-scope task — bounded normal retry (helmd)",
		attempt: 1,
		specHash,
	};
}

/**
 * helmx adapter: candidate generation from the trigger profile and the
 * frozen goal. Library-backed and deterministic; rationale/confidence are
 * reference data and never raise evidence or relax gates (§14.2).
 */
export function helmxPropose(request: HelmxRequest): HelmxResponse {
	const profile = request.triggerProfile.length > 0 ? request.triggerProfile.join(",") : "unclassified";
	return {
		strategyId: `hx-lib-${profile}`,
		candidateRequest: {
			directive: `Bounded read-only diagnostics on ${request.normalizedGoal}: enumerate observable fields with read-only tools and record one receipt per observation.`,
			...(request.stepId ? {} : {}),
		},
		rationale: `trigger profile ${profile}; attempts helmd=${request.attempts.helmd} helmx=${request.attempts.helmx}`,
		confidence: 0.5,
		source: "library",
	};
}

function episodeKey(stepId: string | null, turn: number): string {
	return stepId ? `step:${stepId}` : `turn:${turn}`;
}

function metaKey(key: string): string {
	return `recovery:episode:${key}`;
}

function loadEpisode(deps: RecoveryDeps, key: string): EpisodeRecord | null {
	const raw = deps.store.getMeta(metaKey(key));
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as EpisodeRecord;
		if (
			typeof parsed.state === "string" &&
			typeof parsed.helmdUsed === "number" &&
			typeof parsed.helmxUsed === "number"
		) {
			return parsed;
		}
		return null;
	} catch {
		return null;
	}
}

function saveEpisode(deps: RecoveryDeps, key: string, record: EpisodeRecord): void {
	deps.store.setMeta(metaKey(key), JSON.stringify(record));
}

export class RecoveryOrchestrator {
	private readonly deps: RecoveryDeps;
	private readonly episodes = new Map<string, EpisodeRecord>();
	private pendingByEpisode = new Map<string, RecoveryAction>();

	constructor(deps: RecoveryDeps) {
		this.deps = deps;
	}

	private now(): number {
		return this.deps.clock ? this.deps.clock() : Date.now();
	}

	private episode(key: string): EpisodeRecord {
		const existing = this.episodes.get(key) ?? loadEpisode(this.deps, key);
		if (existing) {
			this.episodes.set(key, existing);
			return existing;
		}
		const fresh: EpisodeRecord = {
			state: "normal",
			helmdUsed: 0,
			helmxUsed: 0,
			specHash: this.deps.readSpecHash(),
			pendingActionId: null,
		};
		this.episodes.set(key, fresh);
		saveEpisode(this.deps, key, fresh);
		return fresh;
	}

	private transition(record: EpisodeRecord, key: string, to: RecoveryState): boolean {
		if (record.state === to) return true;
		if (!canTransitionRecovery(record.state, to)) return false;
		record.state = to;
		saveEpisode(this.deps, key, record);
		return true;
	}

	/** Validate a candidate through the SAME gateway as any tool call. */
	validateAction(action: RecoveryAction): ReturnType<ToolGateway["decide"]> {
		const parsed = parseRecoveryAction(action);
		const request: GatewayRequest = {
			toolName: parsed.request.tool ?? "recovery_directive",
			args: {
				command: parsed.request.directive,
				...(parsed.request.target ? { target: parsed.request.target } : {}),
			},
			source: "recovery",
			toolClass: "query",
			recoveryId: parsed.id,
		};
		return this.deps.gateway.decide(request);
	}

	/**
	 * after-stream entry: a refusal was classified. Produce at most one
	 * bounded candidate (helmd first, helmx when the normal retry did not
	 * take), or exhaust the step. Candidates never execute here.
	 */
	onRefusal(event: RefusalEvent): RecoveryOutcome {
		const key = episodeKey(event.stepId, event.turn);
		const record = this.episode(key);

		if (record.state === "normal") {
			this.transition(record, key, "refusal_detected");
			this.deps.store.journalEvent(JOURNAL_KEYS.refusalDetected, {
				runId: event.runId,
				stepId: event.stepId,
				stance: event.stance,
				excerpt: event.excerpt,
				turn: event.turn,
				at: event.at,
			});
		}

		let tier: "helmd" | "helmx" | null = null;
		if (record.helmdUsed < HELMD_BUDGET_PER_STEP) {
			record.helmdUsed += 1;
			tier = "helmd";
		} else if (record.helmxUsed < HELMX_BUDGET_PER_STEP && record.state !== "recovery_denied") {
			record.helmxUsed += 1;
			tier = "helmx";
		}
		if (tier === null || record.state === "recovery_executed" || record.state === "recovery_denied") {
			this.transition(record, key, "recovery_exhausted");
			this.deps.store.journalEvent(JOURNAL_KEYS.recoveryExhausted, {
				stepId: event.stepId,
				state: record.state,
				helmdUsed: record.helmdUsed,
				helmxUsed: record.helmxUsed,
				at: this.now(),
			});
			saveEpisode(this.deps, key, record);
			return { state: record.state, action: null, directive: null, reason: "recovery_exhausted" };
		}

		const stepTarget = this.deps.resolveStepTarget(event.stepId);
		let action: RecoveryAction;
		if (tier === "helmd") {
			action = helmdPropose(event, stepTarget, record.specHash);
		} else {
			const response = helmxPropose({
				runId: event.runId,
				stepId: event.stepId,
				refusalExcerpt: event.excerpt,
				triggerProfile: triggerProfileOf(event.excerpt),
				normalizedGoal: stepTarget ?? "the frozen spec goal",
				specHash: record.specHash,
				attempts: { helmd: record.helmdUsed, helmx: record.helmxUsed },
			});
			action = {
				id: `rec-${event.at}-helmx`,
				kind: "readonly_diagnostics",
				source: "helmx",
				stepId: event.stepId,
				request: {
					directive: response.candidateRequest.directive,
					...(stepTarget ? { target: stepTarget } : {}),
				},
				rationale: response.rationale,
				attempt: 2,
				specHash: record.specHash,
			};
		}

		if (record.state === "refusal_detected") {
			this.transition(record, key, "recovery_proposed");
		}
		const decision = this.validateAction(action);
		if (decision.kind !== "allow") {
			const reason = decision.kind === "denied" ? decision.reason : decision.reason;
			this.transition(record, key, "recovery_denied");
			this.deps.store.journalEvent(JOURNAL_KEYS.recoveryDenied, {
				actionId: action.id,
				source: action.source,
				kind: action.kind,
				gate: decision.kind === "denied" ? decision.gate : "scope",
				reason,
				stepId: event.stepId,
				at: this.now(),
			});
			saveEpisode(this.deps, key, record);
			return { state: record.state, action, directive: null, reason };
		}

		record.pendingActionId = action.id;
		this.pendingByEpisode.set(key, action);
		saveEpisode(this.deps, key, record);
		this.deps.store.journalEvent(JOURNAL_KEYS.recoverySelected, {
			actionId: action.id,
			source: action.source,
			kind: action.kind,
			stepId: event.stepId,
			attempt: action.attempt,
			at: this.now(),
		});
		return { state: record.state, action, directive: action.request.directive };
	}

	/**
	 * before-tool entry (W3-T04 instead path): a denial must carry a bounded
	 * alternative. The alternative is generated and re-validated here — it can
	 * never widen scope and it never executes by itself.
	 */
	onDenied(
		denial: { readonly toolName: string; readonly target: string | null; readonly gate: string; readonly reason: string },
		stepId: string | null,
		turn: number,
	): RecoveryOutcome {
		const key = episodeKey(stepId, turn);
		const record = this.episode(key);
		const kind: RecoveryKind = "readonly_diagnostics";
		const action: RecoveryAction = {
			id: `rec-${this.now()}-instead`,
			kind,
			source: "helmd",
			stepId,
			request: {
				directive: `Bounded alternative for ${denial.toolName} (${denial.reason}): switch to read-only diagnostics inside Spec.allowedTargets and record receipts.`,
				...(denial.target ? { target: denial.target } : {}),
			},
			rationale: `denied at gate ${denial.gate} — instead ladder (bounded alternative)`,
			attempt: 1,
			specHash: this.deps.readSpecHash(),
		};
		const decision = this.validateAction(action);
		if (decision.kind !== "allow") {
			this.deps.store.journalEvent(JOURNAL_KEYS.recoveryDenied, {
				actionId: action.id,
				source: action.source,
				kind: action.kind,
				gate: decision.kind === "denied" ? decision.gate : "scope",
				reason: decision.kind === "denied" ? decision.reason : decision.reason,
				stepId,
				at: this.now(),
			});
			return { state: record.state, action, directive: null, reason: "alternative_out_of_scope" };
		}
		this.deps.store.journalEvent(JOURNAL_KEYS.recoverySelected, {
			actionId: action.id,
			source: action.source,
			kind: action.kind,
			stepId,
			attempt: action.attempt,
			instead: true,
			at: this.now(),
		});
		return { state: record.state, action, directive: action.request.directive };
	}

	/**
	 * after-tool entry: a settled receipt can complete a pending recovery.
	 * The candidate text itself is never a finding — only a receipt moves the
	 * state to `recovery_executed`.
	 */
	onToolSettled(
		stepId: string | null,
		turn: number,
		settled: { readonly seq: number; readonly source: "model" | "recovery" },
	): RecoveryState | null {
		const key = episodeKey(stepId, turn);
		const record = this.episodes.get(key) ?? loadEpisode(this.deps, key);
		if (!record || record.state !== "recovery_proposed") return record?.state ?? null;
		const pending = this.pendingByEpisode.get(key);
		if (!pending) return record.state;
		const textLevel = pending.request.tool === undefined && pending.request.target === undefined;
		if (settled.source !== "recovery" && !textLevel) return record.state;
		record.pendingActionId = null;
		this.pendingByEpisode.delete(key);
		this.transition(record, key, "recovery_executed");
		this.deps.store.journalEvent(JOURNAL_KEYS.recoveryExecuted, {
			actionId: pending.id,
			source: pending.source,
			kind: pending.kind,
			receiptSeq: settled.seq,
			stepId,
			at: this.now(),
		});
		saveEpisode(this.deps, key, record);
		return record.state;
	}

	/** Candidate matching for before-tool tagging (source= "recovery"). */
	matchPending(stepId: string | null, turn: number, toolName: string, target: string | null): RecoveryAction | null {
		const pending = this.pendingByEpisode.get(episodeKey(stepId, turn));
		if (!pending) return null;
		if (pending.request.tool !== undefined && pending.request.tool !== toolName) return null;
		if (pending.request.target !== undefined && pending.request.target !== target) return null;
		return pending;
	}

	/** Visible episode state (CLI/TUI display + tests). */
	episodeState(stepId: string | null, turn: number): RecoveryState {
		return this.episode(episodeKey(stepId, turn)).state;
	}

	episodeBudget(stepId: string | null, turn: number): { helmd: number; helmx: number } {
		const record = this.episode(episodeKey(stepId, turn));
		return { helmd: record.helmdUsed, helmx: record.helmxUsed };
	}
}

export { classifyStance, specFingerprint };
