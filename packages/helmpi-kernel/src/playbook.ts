/** Playbook phase gates — L2 / I11. Pure. */

export interface PlaybookDeliverable {
	readonly key: string;
	readonly description: string;
	readonly evidence: "required" | "optional";
}

export interface PlaybookPhase {
	readonly id: string;
	readonly title: string;
	readonly deliverables: readonly PlaybookDeliverable[];
	readonly gateOut: string;
	readonly next: readonly string[];
	readonly refs?: readonly string[];
	readonly hintMenu?: readonly string[];
}

export interface Playbook {
	readonly schema: 1;
	readonly id: string;
	readonly title: string;
	/** Optional MITRE ATT&CK technique IDs for coverage/navigator mapping (Wave 4). */
	readonly attack?: readonly string[];
	readonly phases: readonly PlaybookPhase[];
}

/** T + 3–4 digits, optional .### sub-technique (verified against local ATT&CK mappings). */
const TID_RE = /^T\d{3,4}(\.\d{3})?$/;

export function isValidAttackId(tid: string): boolean {
	return TID_RE.test(tid);
}

export type GateCheck =
	| { readonly ok: true }
	| { readonly ok: false; readonly missing: readonly string[]; readonly reason: string };

export function parsePlaybook(raw: unknown): Playbook {
	if (typeof raw !== "object" || raw === null) {
		throw new Error("playbook must be object");
	}
	const o = raw as Record<string, unknown>;
	const allowed = new Set(["schema", "id", "title", "description", "lanes", "budgets", "phases", "attack"]);
	for (const k of Object.keys(o)) {
		if (!allowed.has(k)) throw new Error(`Unknown playbook key: ${k}`);
	}
	if (o.schema !== 1) throw new Error("playbook schema must be 1");
	if (typeof o.id !== "string" || !o.id) throw new Error("playbook.id required");
	if (typeof o.title !== "string") throw new Error("playbook.title required");
	if (!Array.isArray(o.phases) || o.phases.length === 0) {
		throw new Error("playbook.phases required");
	}
	const phases: PlaybookPhase[] = [];
	const ids = new Set<string>();
	for (const p of o.phases) {
		if (typeof p !== "object" || p === null) throw new Error("invalid phase");
		const ph = p as Record<string, unknown>;
		if (typeof ph.id !== "string" || !ph.id) throw new Error("phase.id required");
		if (ids.has(ph.id)) throw new Error(`duplicate phase id ${ph.id}`);
		ids.add(ph.id);
		if (!Array.isArray(ph.deliverables) || ph.deliverables.length === 0) {
			throw new Error(`phase ${ph.id} needs deliverables`);
		}
		if (!Array.isArray(ph.next)) throw new Error(`phase ${ph.id} needs next`);
		for (const n of ph.next) {
			if (typeof n !== "string") throw new Error("next must be strings");
		}
		const deliverables: PlaybookDeliverable[] = ph.deliverables.map((d) => {
			const dd = d as Record<string, unknown>;
			if (typeof dd.key !== "string") throw new Error("deliverable.key");
			const ev = dd.evidence === "optional" ? "optional" : "required";
			return {
				key: dd.key,
				description: String(dd.description ?? dd.key),
				evidence: ev,
			};
		});
		phases.push({
			id: ph.id,
			title: String(ph.title ?? ph.id),
			deliverables,
			gateOut: String(ph.gate_out ?? ph.gateOut ?? "all_deliverables_have_evidence"),
			next: (ph.next as string[]).slice(),
			...(Array.isArray(ph.refs) ? { refs: (ph.refs as string[]).slice() } : {}),
			...(Array.isArray(ph.hint_menu) ? { hintMenu: (ph.hint_menu as string[]).slice() } : {}),
		});
	}
	for (const ph of phases) {
		for (const n of ph.next) {
			if (!ids.has(n)) throw new Error(`phase ${ph.id} next dangling: ${n}`);
		}
	}
	let attack: string[] | undefined;
	if (o.attack !== undefined) {
		if (!Array.isArray(o.attack) || o.attack.length === 0) {
			throw new Error("playbook.attack must be a non-empty array");
		}
		attack = o.attack.map((t) => {
			const s = String(t).trim();
			// "宁缺勿猜" (Anthropic-Skills rule): exact T-ID format or reject.
			if (!TID_RE.test(s)) throw new Error(`invalid attack id: ${s}`);
			return s;
		});
	}
	return {
		schema: 1,
		id: o.id,
		title: o.title,
		...(attack ? { attack } : {}),
		phases,
	};
}

/**
 * Evidence keys satisfied for a phase (I11).
 * `satisfied` = deliverable keys that already have at least one evidence ref.
 */
export function checkGateOut(playbook: Playbook, phaseId: string, satisfied: ReadonlySet<string>): GateCheck {
	const phase = playbook.phases.find((p) => p.id === phaseId);
	if (!phase) {
		return { ok: false, missing: [], reason: `unknown_phase:${phaseId}` };
	}
	if (phase.gateOut !== "all_deliverables_have_evidence") {
		return { ok: false, missing: [], reason: `unsupported_gate_out:${phase.gateOut}` };
	}
	const missing = phase.deliverables
		.filter((d) => d.evidence === "required" && !satisfied.has(d.key))
		.map((d) => d.key);
	if (missing.length > 0) {
		return { ok: false, missing, reason: "missing_evidence" };
	}
	return { ok: true };
}

export function canEnterNext(
	playbook: Playbook,
	phaseId: string,
	nextId: string,
	satisfied: ReadonlySet<string>,
): GateCheck {
	const phase = playbook.phases.find((p) => p.id === phaseId);
	if (!phase) return { ok: false, missing: [], reason: `unknown_phase:${phaseId}` };
	if (!phase.next.includes(nextId)) {
		return { ok: false, missing: [], reason: `not_allowed_next:${nextId}` };
	}
	return checkGateOut(playbook, phaseId, satisfied);
}
