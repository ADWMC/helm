/** Scope gate — P5 / I13–I14. Pure. */

import type { Spec, StepKind } from "./types.ts";

export interface ScopeDecision {
	readonly allow: boolean;
	/** How the allow/deny was decided: exact/pattern/cidr/out_of_scope/fail_closed/none. */
	readonly matchedBy: string;
	readonly reason: string;
}

const HIGH_RISK_KINDS: ReadonlySet<StepKind> = new Set(["exploit", "respond"]);

/** Host of a URL (or host:port) target; null when unparseable. */
function hostOf(target: string): string | null {
	try {
		return new URL(target).hostname;
	} catch {
		try {
			return new URL(`//${target}`).hostname;
		} catch {
			return null;
		}
	}
}

/**
 * Fail-closed network gate (cybersec-toolkit recipe): loopback + RFC1918 +
 * link-local + CGNAT are private; every other host is external and needs
 * explicit `Spec.allowExternal`.
 */
function isPrivateHost(host: string): boolean {
	const h = host.toLowerCase().replace(/^\[|\]$/g, "");
	if (h === "localhost" || h === "::1" || h === "0.0.0.0" || h === "") return true;
	const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
	if (!m) return false; // non-IPv4 hostname → external
	const a = Number(m[1]);
	const b = Number(m[2]);
	const c = Number(m[3]);
	if ([a, b, c, Number(m[4])].some((n) => n > 255)) return false;
	if (a === 127 || a === 10) return true;
	if (a === 192 && b === 168) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 169 && b === 254) return true;
	if (a === 100 && b >= 64 && b <= 127) return true;
	return false;
}

function cidrContains(cidr: string, ip: string): boolean {
	const [range, bitsRaw] = cidr.split("/");
	const bits = Number(bitsRaw);
	if (!range || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
	const parse = (s: string): number[] | null => {
		const parts = s.split(".");
		if (parts.length !== 4) return null;
		const nums = parts.map(Number);
		if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
		return nums;
	};
	const r = parse(range);
	const i = parse(ip);
	if (!r || !i) return false;
	const toInt = (o: number[]) => ((o[0]! << 24) >>> 0) + (o[1]! << 16) + (o[2]! << 8) + o[3]!;
	const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
	return (toInt(r) & mask) === (toInt(i) & mask);
}

/** Explicit Spec glob: `*` matches any chars (spans separators), anchored. */
function globMatches(pattern: string, value: string): boolean {
	const re = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
	return new RegExp(`^${re}$`).test(value);
}

/**
 * I13: allowlist entries are explicit rules — exact string, `*` glob, or
 * IPv4 CIDR. First matching entry wins; no match → deny (fail closed).
 */
function matchAllowed(target: string, host: string | null, allowed: readonly string[]): string | null {
	for (const p of allowed) {
		if (p === target) return `exact:${p}`;
	}
	for (const p of allowed) {
		if (p.includes("*") && globMatches(p, target)) return `pattern:${p}`;
		if (/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(p) && host && cidrContains(p, host)) {
			return `cidr:${p}`;
		}
	}
	return null;
}

export function targetInAllowlist(target: string, allowed: readonly string[]): boolean {
	return matchAllowed(target, hostOf(target), allowed) !== null;
}

export function assertStepTarget(spec: Spec, target: string): ScopeDecision {
	if (!target.trim()) {
		return { allow: false, matchedBy: "none", reason: "empty_target" };
	}
	for (const bad of spec.outOfScope ?? []) {
		if (target === bad || target.startsWith(bad)) {
			return {
				allow: false,
				matchedBy: `out_of_scope:${bad}`,
				reason: `out_of_scope:${bad}`,
			};
		}
	}
	// W4-T03 targetKind modes — fail-closed semantics unchanged (I13/I14):
	//   url (default): exact/glob/cidr as before · host: host-level allow ·
	//   sample_hash: EXACT whitelist compare (globs deliberately NOT honored, §5.2).
	const kind = (spec.targetKind ?? "url") as string;
	if (!["url", "host", "sample_hash"].includes(kind)) {
		return { allow: false, matchedBy: "target_kind_invalid", reason: `target_kind_invalid:${kind}` };
	}
	if (kind === "sample_hash") {
		if (spec.allowedTargets.includes(target)) {
			return { allow: true, matchedBy: `exact:${target}`, reason: `allowed_by:sample_hash:${target}` };
		}
		const globHit = spec.allowedTargets.find((p) => p.includes("*") && globMatches(p, target));
		if (globHit) {
			return { allow: false, matchedBy: "hash_glob_denied", reason: `hash_must_be_exact:${target}` };
		}
		return { allow: false, matchedBy: "none", reason: `target_not_allowed:${target}` };
	}
	if (kind === "host") {
		const host = hostOf(target);
		if (!host) {
			return { allow: false, matchedBy: "host_unparseable", reason: `host_unparseable:${target}` };
		}
		const hit = spec.allowedTargets.find((p) => {
			const noScheme = p.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
			const hp = (noScheme.split("/")[0] ?? "").replace(/\*+$/, "");
			const entryHost = hp.startsWith("[") ? `${(hp.split("]")[0] ?? "").slice(1)}]` : (hp.split(":")[0] ?? "");
			if (entryHost === host) return true;
			return hp.includes("*") && globMatches(hp, host);
		});
		if (!hit) {
			return { allow: false, matchedBy: "none", reason: `target_not_allowed:${host}` };
		}
		if (!isPrivateHost(host) && spec.allowExternal !== true) {
			return { allow: false, matchedBy: "fail_closed", reason: `external_not_allowed:${host}` };
		}
		return { allow: true, matchedBy: `host:${hit}`, reason: `allowed_by:host:${hit}` };
	}
	const host = hostOf(target);
	const matchedBy = matchAllowed(target, host, spec.allowedTargets);
	if (matchedBy === null) {
		return {
			allow: false,
			matchedBy: "none",
			reason: `target_not_allowed:${target}`,
		};
	}
	// Fail-closed external gate: allowlisted ≠ authorized for public hosts.
	if (host !== null && !isPrivateHost(host) && spec.allowExternal !== true) {
		return {
			allow: false,
			matchedBy: "fail_closed",
			reason: `external_not_allowed:${host}`,
		};
	}
	return { allow: true, matchedBy, reason: `allowed_by:${matchedBy}` };
}

/**
 * Session-layer pre-check (Cybermes `validate_scope` pattern): query scope
 * BEFORE acting. Fail-closed — no Spec means no authorization.
 */
export function validateScopeQuery(spec: Spec | null, target: string): ScopeDecision {
	if (!spec || !Array.isArray(spec.allowedTargets)) {
		return {
			allow: false,
			matchedBy: "no_spec",
			reason: "no_spec: set spec.json or Spec before any action",
		};
	}
	return assertStepTarget(spec, target);
}

export function assertStepPlan(
	spec: Spec,
	kind: StepKind,
	target: string,
	opts: { readonly approvedHighRisk?: boolean } = {},
): ScopeDecision {
	const base = assertStepTarget(spec, target);
	if (!base.allow) return base;
	if (HIGH_RISK_KINDS.has(kind) && spec.highRisk === "deny") {
		return {
			allow: false,
			matchedBy: base.matchedBy,
			reason: `high_risk_denied:${kind}`,
		};
	}
	if (HIGH_RISK_KINDS.has(kind) && spec.highRisk === "hitl" && !opts.approvedHighRisk) {
		return {
			allow: false,
			matchedBy: base.matchedBy,
			reason: `high_risk_hitl_required:${kind}`,
		};
	}
	return base;
}
