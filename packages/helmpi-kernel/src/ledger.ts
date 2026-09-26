/** Authoritative SQLite ledger — P1 / I1–I3. Single writer = this module. */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CompileError } from "./domain/completion.ts";
import type {
	Claim,
	CoverageEntry,
	Direction,
	Hint,
	Observation,
	Receipt,
	RunStatus,
	Spec,
	Step,
	StepStatus,
	Workspace,
} from "./domain/types.ts";

export interface JournalRow {
	readonly revision: number;
	readonly kind: string;
	readonly payloadJson: string;
	readonly at: number;
}

export interface ProposeView {
	readonly revision: number;
	readonly runStatus: RunStatus;
	readonly goal: string;
	readonly allowedTargets: readonly string[];
	readonly openSteps: readonly Step[];
	readonly recentClosedSteps: readonly Step[];
	readonly openDirections: readonly Direction[];
	readonly recentHints: readonly Hint[];
	readonly observationIds: readonly string[];
	readonly diagnostics: readonly { readonly kind: string; readonly message: string }[];
}

export type ProposeDecision =
	| {
			readonly finish: false;
			readonly summary: string;
			readonly newStep?: {
				readonly id: string;
				readonly kind: Step["kind"];
				readonly target: string;
				readonly objective: string;
				readonly doneWhen: string;
				readonly basisIds?: readonly string[];
				readonly dependsOn?: readonly string[];
				/** Playbook phase this step belongs to — gated when provided */
				readonly phaseId?: string;
			};
			readonly nextStepId?: string;
	  }
	| {
			readonly finish: true;
			readonly summary: string;
			readonly finishBasisIds: readonly string[];
	  };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS journal (
  revision INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_refs TEXT NOT NULL,
  confidence TEXT,
  creator TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  run_id TEXT
);
CREATE TABLE IF NOT EXISTS directions (
  id TEXT PRIMARY KEY,
  from_claim_ids TEXT NOT NULL,
  to_claim_id TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  creator TEXT NOT NULL,
  worker TEXT
);
CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  objective TEXT NOT NULL,
  done_when TEXT NOT NULL,
  basis_ids TEXT NOT NULL,
  depends_on TEXT NOT NULL,
  status TEXT NOT NULL,
  created_revision INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  step_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  receipt_seq INTEGER NOT NULL,
  created_at_revision INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hints (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  creator TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  approved INTEGER NOT NULL,
  by TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS run_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  kind_streak TEXT NOT NULL,
  decisions_used INTEGER NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS receipts (
	seq INTEGER PRIMARY KEY,
	stdout TEXT NOT NULL,
	stderr TEXT NOT NULL,
	exit_code INTEGER NOT NULL,
	timed_out INTEGER
);
CREATE TABLE IF NOT EXISTS coverage (
  id TEXT PRIMARY KEY,
  surface TEXT NOT NULL,
  outcome TEXT NOT NULL,
  note TEXT,
  created_revision INTEGER NOT NULL
);
`;

function j(v: unknown): string {
	return JSON.stringify(v);
}

function pj<T>(s: string): T {
	return JSON.parse(s) as T;
}

export class Ledger {
	private readonly db: DatabaseSync;

	constructor(path: string) {
		if (path !== ":memory:") {
			mkdirSync(dirname(path), { recursive: true });
		}
		this.db = new DatabaseSync(path);
		this.db.exec(SCHEMA);
		const cur = this.db.prepare("SELECT value FROM meta WHERE key='revision'").get() as { value: string } | undefined;
		if (!cur) {
			this.db.prepare("INSERT INTO meta(key,value) VALUES('revision','0')").run();
			this.db
				.prepare("INSERT INTO journal(revision,kind,payload_json,at) VALUES(0,'init',?,?)")
				.run(j({ status: "open" }), Date.now());
		}
		this.db.prepare("INSERT OR IGNORE INTO run_state(id,kind_streak,decisions_used) VALUES(1,'{}',0)").run();
		try {
			// Legacy run_state (pre-token schema) upgrade.
			this.db.exec("ALTER TABLE run_state ADD COLUMN tokens_used INTEGER NOT NULL DEFAULT 0");
		} catch {
			/* column already exists */
		}
		try {
			// Legacy claims (pre-run-id schema) upgrade.
			this.db.exec("ALTER TABLE claims ADD COLUMN run_id TEXT");
		} catch {
			/* column already exists */
		}
	}

	close(): void {
		this.db.close();
	}

	revision(): number {
		const row = this.db.prepare("SELECT value FROM meta WHERE key='revision'").get() as {
			value: string;
		};
		return Number(row.value);
	}

	private bump(kind: string, payload: unknown): number {
		const next = this.revision() + 1;
		const tx = this.db.prepare("BEGIN IMMEDIATE");
		try {
			tx.run();
			this.db.prepare("UPDATE meta SET value=? WHERE key='revision'").run(String(next));
			this.db
				.prepare("INSERT INTO journal(revision,kind,payload_json,at) VALUES(?,?,?,?)")
				.run(next, kind, j(payload), Date.now());
			this.db.prepare("COMMIT").run();
		} catch (e) {
			try {
				this.db.prepare("ROLLBACK").run();
			} catch {
				/* ignore */
			}
			throw e;
		}
		return next;
	}

	journal(from = 0): JournalRow[] {
		const rows = this.db
			.prepare("SELECT revision,kind,payload_json,at FROM journal WHERE revision>=? ORDER BY revision")
			.all(from) as {
			revision: number;
			kind: string;
			payload_json: string;
			at: number;
		}[];
		return rows.map((r) => ({
			revision: r.revision,
			kind: r.kind,
			payloadJson: r.payload_json,
			at: r.at,
		}));
	}

	setMeta(key: string, value: string): void {
		this.db
			.prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
			.run(key, value);
		// meta used for phase scaffolding — journal only when it's not pure read
	}

	getMeta(key: string): string | null {
		const row = this.db.prepare("SELECT value FROM meta WHERE key=?").get(key) as { value: string } | undefined;
		return row?.value ?? null;
	}

	/** Meta write that also bumps journal (phase transitions etc.). */
	setMetaJournaled(key: string, value: string, kind: string): void {
		this.setMeta(key, value);
		this.bump(kind, { key, value });
	}

	setRunStatus(status: RunStatus, reason?: string): void {
		const prev =
			(this.db.prepare("SELECT value FROM meta WHERE key='run_status'").get() as { value: string } | undefined)
				?.value ?? "open";
		this.db
			.prepare(
				"INSERT INTO meta(key,value) VALUES('run_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
			)
			.run(status);
		// Terminal statuses close the convergence budget for the *next* run;
		// a crash mid-run leaves run_state intact so I10 survives restart.
		let resetRunState = false;
		if (status === "completed" || status === "failed" || status === "stopped") {
			this.db.prepare("UPDATE run_state SET kind_streak='{}', decisions_used=0, tokens_used=0 WHERE id=1").run();
			resetRunState = true;
		}
		this.bump("run_status", {
			from: prev,
			to: status,
			reason: reason ?? null,
			reset_run_state: resetRunState,
		});
	}

	runStatus(): RunStatus {
		const row = this.db.prepare("SELECT value FROM meta WHERE key='run_status'").get() as
			| { value: string }
			| undefined;
		return (row?.value as RunStatus) ?? "open";
	}

	/**
	 * I10 convergence budget — persisted (same-kind streak + decisions used)
	 * so a process restart cannot reset the budget. Reset happens only when
	 * the run reaches a terminal status (see setRunStatus).
	 */
	hydrateRunState(): {
		kindStreak: Map<string, number>;
		decisionsUsed: number;
		tokensUsed: number;
	} {
		const row = this.db.prepare("SELECT kind_streak, decisions_used, tokens_used FROM run_state WHERE id=1").get() as
			| { kind_streak: string; decisions_used: number; tokens_used: number }
			| undefined;
		if (!row) {
			return { kindStreak: new Map(), decisionsUsed: 0, tokensUsed: 0 };
		}
		const obj = pj<Record<string, number>>(row.kind_streak);
		return {
			kindStreak: new Map(Object.entries(obj)),
			decisionsUsed: row.decisions_used,
			tokensUsed: row.tokens_used,
		};
	}

	saveRunState(kindStreak: ReadonlyMap<string, number>, decisionsUsed: number, tokensUsed?: number): void {
		const payload = Object.fromEntries(kindStreak);
		const tokens = tokensUsed ?? null;
		// Two-step write: the UPSERT variant can't distinguish "keep" (NULL) from
		// 0 because VALUES-side COALESCE rewrites excluded.* before the update.
		const updated = this.db
			.prepare(
				"UPDATE run_state SET kind_streak=?, decisions_used=?, " +
					"tokens_used=CASE WHEN ? IS NULL THEN tokens_used ELSE ? END WHERE id=1",
			)
			.run(j(payload), decisionsUsed, tokens, tokens);
		if (updated.changes === 0) {
			this.db
				.prepare("INSERT INTO run_state(id,kind_streak,decisions_used,tokens_used) VALUES(1,?,?,COALESCE(?,0))")
				.run(j(payload), decisionsUsed, tokens);
		}
		this.bump("run_state", {
			kind_streak: payload,
			decisions_used: decisionsUsed,
			...(tokensUsed !== undefined ? { tokens_used: tokensUsed } : {}),
		});
	}

	/** One-shot authoritative journal event (recovered / coverage-waived / …). */
	journalEvent(kind: string, payload: unknown): number {
		return this.bump(kind, payload);
	}

	/** I19: record a negative-space coverage entry (checked & clean). */
	recordCoverage(entry: {
		id: string;
		surface: string;
		outcome: CoverageEntry["outcome"];
		note?: string;
	}): CoverageEntry {
		const full: CoverageEntry = {
			...entry,
			createdAtRevision: this.revision(),
		};
		this.db
			.prepare("INSERT OR REPLACE INTO coverage(id,surface,outcome,note,created_revision) VALUES(?,?,?,?,?)")
			.run(full.id, full.surface, full.outcome, full.note ?? null, full.createdAtRevision);
		this.bump("coverage", full);
		return full;
	}

	listCoverage(): CoverageEntry[] {
		const rows = this.db
			.prepare("SELECT id,surface,outcome,note,created_revision FROM coverage ORDER BY created_revision, id")
			.all() as {
			id: string;
			surface: string;
			outcome: string;
			note: string | null;
			created_revision: number;
		}[];
		return rows.map((r) => ({
			id: r.id,
			surface: r.surface,
			outcome: r.outcome as CoverageEntry["outcome"],
			...(r.note !== null ? { note: r.note } : {}),
			createdAtRevision: r.created_revision,
		}));
	}

	setSpec(spec: Spec): void {
		this.db
			.prepare("INSERT INTO meta(key,value) VALUES('spec',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
			.run(j(spec));
		this.bump("spec", spec);
	}

	spec(): Spec {
		const row = this.db.prepare("SELECT value FROM meta WHERE key='spec'").get() as { value: string } | undefined;
		if (!row) throw new Error("spec not set — call setSpec first");
		return pj<Spec>(row.value);
	}

	addClaim(claim: Claim): void {
		this.db
			.prepare(
				`INSERT INTO claims(id,role,description,evidence_refs,confidence,creator,created_at,run_id)
         VALUES(?,?,?,?,?,?,?,?)`,
			)
			.run(
				claim.id,
				claim.role,
				claim.description,
				j(claim.evidenceRefs),
				claim.confidence ?? null,
				claim.creator,
				claim.createdAt,
				claim.runId ?? null,
			);
		this.bump("claim", claim);
	}

	claims(): Claim[] {
		const rows = this.db.prepare("SELECT * FROM claims ORDER BY created_at, id").all() as {
			id: string;
			role: Claim["role"];
			description: string;
			evidence_refs: string;
			confidence: string | null;
			creator: string;
			created_at: number;
			run_id: string | null;
		}[];
		return rows.map((r) => ({
			id: r.id,
			role: r.role,
			description: r.description,
			evidenceRefs: pj<string[]>(r.evidence_refs),
			...(r.confidence ? { confidence: r.confidence as Claim["confidence"] } : {}),
			creator: r.creator,
			createdAt: r.created_at,
			...(r.run_id ? { runId: r.run_id } : {}),
		})) as Claim[];
	}

	addDirection(d: Direction): void {
		this.db
			.prepare(
				`INSERT INTO directions(id,from_claim_ids,to_claim_id,description,status,creator,worker)
         VALUES(?,?,?,?,?,?,?)`,
			)
			.run(d.id, j(d.fromClaimIds), d.toClaimId, d.description, d.status, d.creator, d.worker);
		this.bump("direction", d);
	}

	claimDirection(id: string, worker: string): void {
		const row = this.db.prepare("SELECT status FROM directions WHERE id=?").get(id) as { status: string } | undefined;
		if (!row) throw new CompileError("stale_revision", `unknown direction ${id}`);
		if (row.status !== "open") {
			throw new CompileError("stale_revision", `direction not open: ${row.status}`);
		}
		this.db.prepare("UPDATE directions SET status='claimed', worker=? WHERE id=?").run(worker, id);
		this.bump("direction_claim", { id, worker });
	}

	concludeDirection(id: string, toClaimId: string): void {
		const row = this.db.prepare("SELECT status FROM directions WHERE id=?").get(id) as { status: string } | undefined;
		if (!row || row.status === "concluded") {
			throw new CompileError("stale_revision", `cannot conclude ${id}`);
		}
		this.db.prepare("UPDATE directions SET status='concluded', to_claim_id=? WHERE id=?").run(toClaimId, id);
		this.bump("direction_conclude", { id, toClaimId });
	}

	directions(): Direction[] {
		const rows = this.db.prepare("SELECT * FROM directions").all() as {
			id: string;
			from_claim_ids: string;
			to_claim_id: string | null;
			description: string;
			status: Direction["status"];
			creator: string;
			worker: string | null;
		}[];
		return rows.map((r) => ({
			id: r.id,
			fromClaimIds: pj<string[]>(r.from_claim_ids),
			toClaimId: r.to_claim_id,
			description: r.description,
			status: r.status,
			creator: r.creator,
			worker: r.worker,
		}));
	}

	addStep(step: Step): void {
		const exists = this.db.prepare("SELECT id FROM steps WHERE id=?").get(step.id);
		if (exists) throw new CompileError("stale_revision", `duplicate step ${step.id}`);
		this.db
			.prepare(
				`INSERT INTO steps(id,kind,target,objective,done_when,basis_ids,depends_on,status,created_revision)
         VALUES(?,?,?,?,?,?,?,?,?)`,
			)
			.run(
				step.id,
				step.kind,
				step.target,
				step.objective,
				step.doneWhen,
				j(step.basisIds),
				j(step.dependsOn),
				step.status,
				step.createdRevision,
			);
		this.bump("step_add", step);
	}

	setStepStatus(id: string, status: StepStatus): void {
		const n = this.db.prepare("UPDATE steps SET status=? WHERE id=?").run(status, id);
		if (n.changes === 0) throw new CompileError("stale_revision", `unknown step ${id}`);
		this.bump("step_status", { id, status });
	}

	steps(): Step[] {
		const rows = this.db.prepare("SELECT * FROM steps").all() as {
			id: string;
			kind: Step["kind"];
			target: string;
			objective: string;
			done_when: string;
			basis_ids: string;
			depends_on: string;
			status: StepStatus;
			created_revision: number;
		}[];
		return rows.map((r) => ({
			id: r.id,
			kind: r.kind,
			target: r.target,
			objective: r.objective,
			doneWhen: r.done_when,
			basisIds: pj<string[]>(r.basis_ids),
			dependsOn: pj<string[]>(r.depends_on),
			status: r.status,
			createdRevision: r.created_revision,
		}));
	}

	addObservation(obs: Observation): void {
		this.db
			.prepare(
				`INSERT INTO observations(id,step_id,attempt_id,excerpt,receipt_seq,created_at_revision)
         VALUES(?,?,?,?,?,?)`,
			)
			.run(obs.id, obs.stepId, obs.attemptId, obs.excerpt, obs.receiptSeq, obs.createdAtRevision);
		this.bump("observation", obs);
	}

	observations(): Observation[] {
		const rows = this.db.prepare("SELECT * FROM observations").all() as {
			id: string;
			step_id: string;
			attempt_id: string;
			excerpt: string;
			receipt_seq: number;
			created_at_revision: number;
		}[];
		return rows.map((r) => ({
			id: r.id,
			stepId: r.step_id,
			attemptId: r.attempt_id,
			excerpt: r.excerpt,
			receiptSeq: r.receipt_seq,
			createdAtRevision: r.created_at_revision,
		}));
	}

	recordReceipt(r: Receipt): void {
		this.db
			.prepare("INSERT OR REPLACE INTO receipts(seq,stdout,stderr,exit_code,timed_out) VALUES(?,?,?,?,?)")
			.run(r.seq, r.stdout, r.stderr, r.exitCode, r.timedOut === undefined ? null : r.timedOut ? 1 : 0);
	}

	receipts(): Receipt[] {
		const rows = this.db.prepare("SELECT * FROM receipts ORDER BY seq").all() as {
			seq: number;
			stdout: string;
			stderr: string;
			exit_code: number;
			timed_out: number | null;
		}[];
		return rows.map((r) => ({
			seq: r.seq,
			stdout: r.stdout,
			stderr: r.stderr,
			exitCode: r.exit_code,
			...(r.timed_out !== null ? { timedOut: r.timed_out === 1 } : {}),
		}));
	}
	addHint(hint: Hint): void {
		this.db
			.prepare("INSERT INTO hints(id,content,creator,created_at) VALUES(?,?,?,?)")
			.run(hint.id, hint.content, hint.creator, hint.createdAt);
		this.bump("hint", hint);
	}

	hints(): Hint[] {
		const rows = this.db.prepare("SELECT * FROM hints ORDER BY created_at").all() as {
			id: string;
			content: string;
			creator: string;
			created_at: number;
		}[];
		return rows.map((r) => ({
			id: r.id,
			content: r.content,
			creator: r.creator,
			createdAt: r.created_at,
		}));
	}

	addDiagnostic(kind: string, message: string): void {
		this.db.prepare("INSERT INTO diagnostics(kind,message,at) VALUES(?,?,?)").run(kind, message, Date.now());
		this.bump("diagnostic", { kind, message });
	}

	diagnostics(limit = 10): { kind: string; message: string }[] {
		const rows = this.db.prepare("SELECT kind,message FROM diagnostics ORDER BY id DESC LIMIT ?").all(limit) as {
			kind: string;
			message: string;
		}[];
		return rows;
	}

	approve(kind: string, ref: string, approved: boolean, by: string): void {
		this.db
			.prepare("INSERT INTO approvals(kind,ref,approved,by,at) VALUES(?,?,?,?,?)")
			.run(kind, ref, approved ? 1 : 0, by, Date.now());
		this.bump("approval", { kind, ref, approved, by });
	}

	isApproved(kind: string, ref: string): boolean {
		const row = this.db
			.prepare("SELECT approved FROM approvals WHERE kind=? AND ref=? ORDER BY id DESC LIMIT 1")
			.get(kind, ref) as { approved: number } | undefined;
		return row?.approved === 1;
	}

	workspace(): Workspace {
		return {
			id: "ledger",
			spec: (() => {
				try {
					return this.spec();
				} catch {
					return {
						goal: "",
						allowedTargets: [],
						highRisk: "deny" as const,
					};
				}
			})(),
			runStatus: this.runStatus(),
			revision: this.revision(),
			steps: this.steps(),
			observations: this.observations(),
			claims: this.claims(),
			directions: this.directions(),
			hints: this.hints(),
			coverage: this.listCoverage(),
			coverageWaived: this.journal().some((r) => r.kind === "coverage-waived"),
		};
	}

	proposeView(): ProposeView {
		const ws = this.workspace();
		const open = ws.steps.filter((s) => s.status === "proposed" || s.status === "ready" || s.status === "active");
		const closed = ws.steps.filter((s) => s.status === "done" || s.status === "failed" || s.status === "blocked");
		return {
			revision: ws.revision,
			runStatus: ws.runStatus,
			goal: ws.spec.goal,
			allowedTargets: ws.spec.allowedTargets,
			openSteps: open,
			recentClosedSteps: closed.slice(-4),
			openDirections: ws.directions.filter((d) => d.status !== "concluded"),
			recentHints: ws.hints.slice(-6),
			observationIds: ws.observations.map((o) => o.id),
			diagnostics: this.diagnostics(4),
		};
	}
}
