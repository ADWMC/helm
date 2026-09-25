/** Domain language — see DESIGN.md §3. No host or I/O imports. */

export type Confidence = "high" | "medium" | "low";

export type StepKind =
	| "discover"
	| "enumerate"
	| "test"
	| "exploit"
	| "verify"
	| "recover"
	| "reverse"
	| "harden"
	| "respond"
	| "report";

export type StepOutcome = "done" | "progress" | "blocked" | "failed";

export type StepStatus = "proposed" | "ready" | "active" | "done" | "blocked" | "failed";

export type RunStatus = "open" | "running" | "paused" | "completed" | "failed" | "stopped";

export type DirectionStatus = "open" | "claimed" | "concluded" | "released";

export type ClaimRole = "origin" | "goal" | "fact";

export interface Spec {
	readonly goal: string;
	readonly allowedTargets: readonly string[];
	readonly outOfScope?: readonly string[];
	readonly highRisk: "deny" | "hitl" | "allow";
	readonly playbookId?: string;
	/** Fail-closed external gate: public hosts need this explicitly true. */
	readonly allowExternal?: boolean;
	/** I19: finish requires ≥1 coverage record or a coverage-waived journal. */
	readonly requireCoverage?: boolean;
	/** Token budget for the Run (I10 convergence class): exhausted → failed. */
	readonly maxTokens?: number;
	/** W4-T03: scope interpretation mode — url (default) | host | sample_hash. */
	readonly targetKind?: "url" | "host" | "sample_hash";
}

export interface Claim {
	readonly id: string;
	readonly role: ClaimRole;
	readonly description: string;
	readonly evidenceRefs: readonly string[];
	readonly confidence?: Confidence;
	readonly creator: string;
	readonly createdAt: number;
}

export interface Direction {
	readonly id: string;
	readonly fromClaimIds: readonly string[];
	readonly toClaimId: string | null;
	readonly description: string;
	readonly status: DirectionStatus;
	readonly creator: string;
	readonly worker: string | null;
}

export interface Step {
	readonly id: string;
	readonly kind: StepKind;
	readonly target: string;
	readonly objective: string;
	readonly doneWhen: string;
	readonly basisIds: readonly string[];
	readonly dependsOn: readonly string[];
	readonly status: StepStatus;
	readonly createdRevision: number;
}

export interface Observation {
	readonly id: string;
	readonly stepId: string;
	readonly attemptId: string;
	readonly excerpt: string;
	readonly receiptSeq: number;
	readonly createdAtRevision: number;
}

export interface Hint {
	readonly id: string;
	readonly content: string;
	readonly creator: string;
	readonly createdAt: number;
}

export interface Receipt {
	readonly seq: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	readonly timedOut?: boolean;
}

export type CoverageOutcome = "clean" | "finding" | "skipped";

/** Receipt-level evidence ladder (Dark-Moon EXPLOITED/CONFIRMED/UNCONFIRMED). */
export type EvidenceStatus = "exploited" | "confirmed" | "unconfirmed";

/** Negative-space record: what was checked and came back clean (I19). */
export interface CoverageEntry {
	readonly id: string;
	readonly surface: string;
	readonly outcome: CoverageOutcome;
	readonly note?: string;
	readonly createdAtRevision: number;
}

export interface Workspace {
	readonly id: string;
	readonly spec: Spec;
	readonly runStatus: RunStatus;
	readonly revision: number;
	readonly steps: readonly Step[];
	readonly observations: readonly Observation[];
	readonly claims: readonly Claim[];
	readonly directions: readonly Direction[];
	readonly hints: readonly Hint[];
	/** I19 negative-space records for this run. */
	readonly coverage?: readonly CoverageEntry[];
	/** I19: true when a `coverage-waived` journal event exists. */
	readonly coverageWaived?: boolean;
}

export const ACTIVATION_WORD = "helmpi";
export const ACTIVATION_REPLY = "helmpi online. Analyst active. Awaiting task.";
