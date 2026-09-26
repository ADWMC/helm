/**
 * Tool Gateway — the single execution entry for every tool call (REDESIGN
 * §10.6). Fixed gate order: scope → capability → budget → tripwire → sandbox
 * → execute → receipt. Prompt text, the TUI and RecoveryPlanner are NOT
 * security boundaries; the Gateway is.
 *
 * Recovery actions (helmd/helmx) produce candidates only — their requests
 * re-enter through `decide()` like any other call, so a recovery path can
 * never bypass scope, capability, budget, tripwire or sandbox.
 */

import { validateScopeQuery } from "../domain/scope.ts";
import type { Spec } from "../domain/types.ts";
import { commandTripwire } from "../guard/cai.ts";
import type {
	EvidenceEvent,
	ExecutionSource,
	GatewayDecision,
	GatewayExecutionResult,
	ReceiptEvent,
} from "./contracts.ts";
import { JOURNAL_KEYS, specFingerprint } from "./contracts.ts";

export type ToolClass = "file" | "shell" | "sandbox" | "network" | "mcp" | "query";

export interface GatewayRequest {
	readonly toolName: string;
	readonly args: Record<string, unknown>;
	readonly source: ExecutionSource;
	readonly toolClass: ToolClass;
	readonly recoveryId?: string;
}

export interface ToolResultLike {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	readonly timedOut?: boolean;
}

export interface BudgetGateVerdict {
	readonly block: boolean;
	readonly terminate?: boolean;
	readonly reason: string;
}

export interface GatewayDeps {
	readonly readSpec: () => Spec | null;
	/** G4 monitor hook — budget + streak accounting (same-tool cap never hard-blocks). */
	readonly budgetGate: (toolName: string) => BudgetGateVerdict | null;
	readonly journal: (kind: string, payload: Record<string, unknown>) => void;
	readonly recordReceipt: (receipt: ReceiptEvent) => void;
	readonly nextReceiptSeq: () => number;
	readonly clock?: () => number;
	/** Sandbox boundary probe (workdir-only + no egress). Default applies helm sandbox semantics. */
	readonly sandboxPolicy?: (request: GatewayRequest, target: string | null) => { allow: boolean; reason?: string };
}

/** Network-bearing argument names and command shapes (mirrors the G2 probe). */
const DIRECT_TARGET_KEYS = ["target", "url", "uri"] as const;

const URL_RE = /(https?:\/\/[^\s"'`]+)/;
const HASH_RE = /\b[a-f0-9]{32,64}\b/i;

const MAX_ARGS_SUMMARY = 500;
const MAX_EVIDENCE_SLICE = 800;
const MAX_RECEIPT_FOR_EVIDENCE = 4000;

/**
 * Extract the scope-relevant target from a tool call. Mirrors the W2-T01
 * probe (direct target/url/uri, URL inside a command, hash token in
 * sample_hash mode); null means "no target-bearing call" (local query).
 */
export function extractTarget(
	spec: Spec | null,
	args: Record<string, unknown>,
	commandText: string | null,
): string | null {
	const direct = DIRECT_TARGET_KEYS.map((k) => args[k]).find(
		(v): v is string => typeof v === "string" && v.length > 0,
	);
	if (direct) return direct;
	if (commandText) {
		const m = URL_RE.exec(commandText);
		if (m) return m[1];
	}
	if (spec?.targetKind === "sample_hash") {
		const cand =
			[args.hash, args.path].find((v): v is string => typeof v === "string" && v.length > 0) ?? commandText ?? "";
		const hm = HASH_RE.exec(cand);
		if (hm) return hm[0];
	}
	return null;
}

/** Command-bearing text for tripwire inspection (args.command or external command). */
export function commandTextOf(args: Record<string, unknown>, externalCommand?: unknown): string | null {
	const c = args.command ?? externalCommand;
	return typeof c === "string" ? c : null;
}

/** Terminate semantics: tripwire stops immediately; budget exhaustion closes the run. */
export function shouldTerminate(decision: GatewayDecision): boolean {
	return decision.kind === "denied" && (decision.gate === "tripwire" || decision.gate === "budget");
}

/** Default sandbox boundary: workdir-only paths, no egress (helmpi-tools semantics). */
export function defaultSandboxPolicy(
	request: GatewayRequest,
	target: string | null,
	cwd: string,
): { allow: boolean; reason?: string } {
	if (target !== null && URL_RE.test(target)) {
		return { allow: false, reason: "egress denied (--network none)" };
	}
	const cmd = commandTextOf(request.args);
	if (cmd && URL_RE.test(cmd)) {
		return { allow: false, reason: "egress denied (--network none)" };
	}
	const path = request.args.path;
	if (typeof path === "string" && path.length > 0) {
		const normalized = path.replace(/\\/g, "/");
		const root = cwd.replace(/\\/g, "/");
		if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("/")) {
			if (!normalized.startsWith(root)) {
				const outside = `host path outside workdir: ${path}`;
				return { allow: false, reason: outside };
			}
		}
	}
	return { allow: true };
}

const IMPACT_RE = /\bFLAG\{[^}]{1,120}\}|\buid=\d+|\bgid=\d+\b|\broot@\b/;

export class ToolGateway {
	private readonly deps: GatewayDeps;

	constructor(deps: GatewayDeps) {
		this.deps = deps;
	}

	private now(): number {
		return this.deps.clock ? this.deps.clock() : Date.now();
	}

	/**
	 * Pre-execution gate decision. Order is frozen: scope → capability →
	 * budget → tripwire → sandbox. Only `allow` may reach a tool runner.
	 * `journalDenials: false` is the candidate-validation mode used by the
	 * recovery validator — the decision is real, but the audit row is written
	 * by the caller as `recovery_denied` (candidates never execute).
	 */
	decide(request: GatewayRequest, options: { journalDenials?: boolean } = {}): GatewayDecision {
		const journal = options.journalDenials === false ? () => {} : this.deps.journal;
		const spec = this.deps.readSpec();
		const commandText = commandTextOf(request.args);
		const target = extractTarget(spec, request.args, commandText);

		// 1. scope — fail-closed, pre-exec (I13/I14, W2-T01 contract kept).
		if (target !== null) {
			const d = validateScopeQuery(spec, target);
			if (!d.allow) {
				journal(JOURNAL_KEYS.scopeDenied, {
					tool: request.toolName,
					target,
					matchedBy: d.matchedBy,
					reason: d.reason,
					phase: "pre-exec",
					source: request.source,
					...(request.recoveryId ? { recoveryId: request.recoveryId } : {}),
				});
				return {
					kind: "denied",
					gate: "scope",
					reason: `scope_denied: ${target} (${d.matchedBy}: ${d.reason})`,
				};
			}
		}

		// 2. capability — tool class vs active target kind.
		if (spec?.targetKind === "sample_hash" && request.toolClass === "network") {
			const reason = "capability_denied: network tools are not available for sample_hash targets";
			journal("capability_denied", {
				tool: request.toolName,
				toolClass: request.toolClass,
				targetKind: spec.targetKind,
				phase: "pre-exec",
				source: request.source,
			});
			return { kind: "denied", gate: "capability", reason };
		}

		// 3. budget — I10 live budget + streak bookkeeping (streak never hard-blocks).
		const budget = this.deps.budgetGate(request.toolName);
		if (budget?.block) {
			return {
				kind: "denied",
				gate: "budget",
				reason: budget.reason,
			};
		}

		// 4. tripwire — injection patterns inside a command (CAI layer-4, 即时停机).
		const trip = commandText ? commandTripwire(commandText) : null;
		if (trip && trip.length > 0) {
			journal(JOURNAL_KEYS.tripwireBlocked, {
				tool: request.toolName,
				matched: trip,
				phase: "pre-exec",
				source: request.source,
			});
			return { kind: "denied", gate: "tripwire", reason: `tripwire:${trip.join(",")}` };
		}

		// 5. sandbox — workdir-only mount + no egress for sandbox-class calls.
		if (request.toolClass === "sandbox") {
			const policy =
				this.deps.sandboxPolicy?.(request, target) ?? defaultSandboxPolicy(request, target, process.cwd());
			if (!policy.allow) {
				const reason = `sandbox_denied: ${policy.reason ?? "sandbox policy"}`;
				journal("sandbox_denied", {
					tool: request.toolName,
					reason: policy.reason ?? "sandbox policy",
					phase: "pre-exec",
					source: request.source,
					...(request.recoveryId ? { recoveryId: request.recoveryId } : {}),
				});
				return { kind: "denied", gate: "sandbox", reason };
			}
		}

		return { kind: "allow" };
	}

	/**
	 * Post-execution settlement (after-tool): every outcome — success, failure,
	 * timeout — writes a Receipt; grounded slices become Evidence events.
	 */
	settle(request: GatewayRequest, result: ToolResultLike): { receipt: ReceiptEvent; evidence: EvidenceEvent[] } {
		const spec = this.deps.readSpec();
		const commandText = commandTextOf(request.args);
		const target = extractTarget(spec, request.args, commandText);
		let summary: string;
		try {
			summary = JSON.stringify(request.args);
		} catch {
			summary = "<unserializable>";
		}
		const receipt: ReceiptEvent = {
			seq: this.deps.nextReceiptSeq(),
			tool: request.toolName,
			argsSummary: summary.length > MAX_ARGS_SUMMARY ? `${summary.slice(0, MAX_ARGS_SUMMARY)}…` : summary,
			target,
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: result.exitCode,
			...(result.timedOut !== undefined ? { timedOut: result.timedOut } : {}),
			source: request.source,
			at: this.now(),
		};
		this.deps.recordReceipt(receipt);
		this.deps.journal(JOURNAL_KEYS.receiptWritten, {
			seq: receipt.seq,
			tool: receipt.tool,
			target: receipt.target,
			exitCode: receipt.exitCode,
			...(receipt.timedOut !== undefined ? { timedOut: receipt.timedOut } : {}),
			source: receipt.source,
			...(request.recoveryId ? { recoveryId: request.recoveryId } : {}),
		});
		const evidence = this.deriveEvidence(receipt);
		for (const ev of evidence) {
			this.deps.journal(JOURNAL_KEYS.evidenceAdded, { ...ev });
		}
		return { receipt, evidence };
	}

	/**
	 * Evidence derivation: only exact slices of the receipt output become
	 * evidence (I5); truncated text never completes (I7). Impact matches slice
	 * to the impact region; small clean outputs slice whole.
	 */
	private deriveEvidence(receipt: ReceiptEvent): EvidenceEvent[] {
		const text = receipt.stdout + (receipt.stderr ? `\n${receipt.stderr}` : "");
		const trimmed = text.trim();
		if (!trimmed) return [];
		const impact = IMPACT_RE.exec(text);
		if (impact) {
			const excerpt = impact[0];
			return [
				{
					id: `EV-${receipt.seq}-1`,
					receiptSeq: receipt.seq,
					excerpt,
					status: "exploited",
					sourceStep: null,
					at: receipt.at,
				},
			];
		}
		if (text.length > MAX_RECEIPT_FOR_EVIDENCE) return []; // truncated → no evidence
		const slice = text.length > MAX_EVIDENCE_SLICE ? text.slice(0, MAX_EVIDENCE_SLICE) : text;
		const unconfirmed =
			/\b(?:api[_-]?key|secret|credential|private[_-]?key)\b[^.]{0,40}\b(?:present|found|detected|embedded)\b|\b200\s+OK\b/i.test(
				slice,
			);
		return [
			{
				id: `EV-${receipt.seq}-1`,
				receiptSeq: receipt.seq,
				excerpt: slice,
				status: unconfirmed ? "unconfirmed" : "confirmed",
				sourceStep: null,
				at: receipt.at,
			},
		];
	}

	/**
	 * Contract shape (REDESIGN §10.6): execute(request, context) →
	 * receipt | denied | failed. The runner is injected so the Gateway stays
	 * the only place where execution is authorized.
	 */
	async execute(
		request: GatewayRequest,
		runner: (request: GatewayRequest) => Promise<ToolResultLike>,
	): Promise<GatewayExecutionResult> {
		const decision = this.decide(request);
		if (decision.kind === "denied") {
			return { kind: "denied", gate: decision.gate, reason: decision.reason };
		}
		try {
			const result = await runner(request);
			const { receipt } = this.settle(request, result);
			return { kind: "receipt", receipt };
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			return { kind: "failed", reason };
		}
	}

	/** Frozen-spec fingerprint for candidate binding. */
	specHash(): string {
		return specFingerprint(this.deps.readSpec());
	}
}
