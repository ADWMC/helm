/** Playbook phase state on Ledger — hard enforce gates (I11 / PLAN P0-1). */

import { CompileError } from "./domain/completion.ts";
import type { Ledger } from "./ledger.ts";
import { canEnterNext, checkGateOut, type Playbook } from "./playbook.ts";

export interface PhaseState {
	readonly playbookId: string | null;
	readonly phaseId: string | null;
	/** deliverable keys with evidence attached */
	readonly satisfied: readonly string[];
}

const PHASE_PLAYBOOK = "phase_playbook";
const PHASE_CURRENT = "phase_current";
const PHASE_SATISFIED = "phase_satisfied";

function getMeta(ledger: Ledger, key: string): string | null {
	const row = ledger.getMeta(key);
	return row;
}

export function readPhaseState(ledger: Ledger): PhaseState {
	const playbookId = getMeta(ledger, PHASE_PLAYBOOK);
	const phaseId = getMeta(ledger, PHASE_CURRENT);
	const raw = getMeta(ledger, PHASE_SATISFIED);
	let satisfied: string[] = [];
	if (raw) {
		try {
			const p = JSON.parse(raw) as unknown;
			if (Array.isArray(p)) satisfied = p.map(String);
		} catch {
			satisfied = [];
		}
	}
	return {
		playbookId: playbookId,
		phaseId: phaseId,
		satisfied,
	};
}

export function startPlaybook(ledger: Ledger, playbook: Playbook): void {
	const first = playbook.phases[0];
	if (!first) throw new CompileError("stale_revision", "playbook has no phases");
	ledger.setMetaJournaled(PHASE_PLAYBOOK, playbook.id, "phase_start");
	ledger.setMetaJournaled(PHASE_CURRENT, first.id, "phase_start");
	ledger.setMetaJournaled(PHASE_SATISFIED, "[]", "phase_start");
	ledger.addDiagnostic("phase_start", `${playbook.id}:${first.id}`);
}

export function satisfyDeliverable(ledger: Ledger, key: string): void {
	const st = readPhaseState(ledger);
	if (st.satisfied.includes(key)) return;
	const next = [...st.satisfied, key];
	ledger.setMetaJournaled(PHASE_SATISFIED, j(next), "phase_satisfy");
	ledger.addDiagnostic("phase_satisfy", key);
}

/**
 * Enter nextId only if current phase allows it and gate_out holds (I11).
 * Throws CompileError when rejected — callers must not silently advance.
 */
export function enterPhase(ledger: Ledger, playbook: Playbook, nextId: string): void {
	const st = readPhaseState(ledger);
	if (st.playbookId && st.playbookId !== playbook.id) {
		throw new CompileError("stale_revision", `active playbook is ${st.playbookId}, not ${playbook.id}`);
	}
	const from = st.phaseId;
	const satisfied = new Set(st.satisfied);
	if (from) {
		const check = canEnterNext(playbook, from, nextId, satisfied);
		if (!check.ok) {
			throw new CompileError(
				"stale_revision",
				`phase gate denied ${from}→${nextId}: ${check.reason}` +
					(check.missing.length ? ` missing=${check.missing.join(",")}` : ""),
			);
		}
	} else {
		// starting: next must be first phase
		const first = playbook.phases[0]?.id;
		if (nextId !== first) {
			throw new CompileError("stale_revision", `first phase must be ${first}`);
		}
	}
	ledger.setMetaJournaled(PHASE_PLAYBOOK, playbook.id, "phase_enter");
	ledger.setMetaJournaled(PHASE_CURRENT, nextId, "phase_enter");
	ledger.addDiagnostic("phase_enter", nextId);
}

/** Optional: if decision names a phase, enforce gate before adding the step. */
export function assertPhaseForStep(ledger: Ledger, playbook: Playbook | undefined, phaseId: string | undefined): void {
	if (!playbook || !phaseId) return;
	const st = readPhaseState(ledger);
	if (st.phaseId === phaseId) {
		// same phase: ensure allowed from itself only via start or re-enter rules —
		// staying is fine
		return;
	}
	enterPhase(ledger, playbook, phaseId);
}

export function phaseGateOk(playbook: Playbook, phaseId: string, satisfied: ReadonlySet<string>): boolean {
	return checkGateOut(playbook, phaseId, satisfied).ok;
}

function j(v: unknown): string {
	return JSON.stringify(v);
}
