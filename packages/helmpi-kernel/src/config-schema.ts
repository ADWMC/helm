/**
 * Helm product config/spec schema — STRICT, unknown keys rejected (W1-T05, WG1.5③).
 *
 * Config separation boundary (§0): these files live in `.helm/` and follow pi's
 * JSON conventions but are helm-owned; pi's settings.json is never read/written
 * by this module. Hand-rolled (allowlist + type checks) to keep the kernel
 * dependency-free; schema-versioned via optional `version`.
 *
 * Defense keys are reserved for W2 gate wiring (watcher default OFF per §0).
 */

export interface SchemaFailure {
	readonly path: string;
	readonly message: string;
}

export type ValidationResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly failures: SchemaFailure[] };

const CONFIG_KEYS = new Set(["version", "locale", "efficiency", "defense"]);
const EFFICIENCY_KEYS = new Set([
	"actionFusion",
	"observationPack",
	"evidencePreservingReducer",
	"onlineContextCompact",
	"reducerModel",
	"reducerProvider",
	"cacheWriteReadRatio",
]);
const DEFENSE_KEYS = new Set([
	// W2 reserved (watcher default OFF per §0 / 评分#3)
	"watcher",
	"watcherEveryTurns",
	// step tool cap knobs (existing kernel supervise surface, config-exposed)
	"stepToolCap",
	"sameToolLimit",
]);
const SPEC_KEYS = new Set([
	"goal",
	"allowedTargets",
	"outOfScope",
	"highRisk",
	"playbookId",
	"allowExternal",
	"requireCoverage",
	"maxTokens",
]);
const HIGH_RISK = new Set(["deny", "hitl", "allow"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkUnknownKeys(
	obj: Record<string, unknown>,
	allowed: ReadonlySet<string>,
	path: string,
	failures: SchemaFailure[],
): void {
	for (const k of Object.keys(obj)) {
		if (!allowed.has(k)) {
			failures.push({ path: path ? `${path}.${k}` : k, message: "unknown key" });
		}
	}
}

function checkOptionalString(obj: Record<string, unknown>, key: string, path: string, failures: SchemaFailure[]): void {
	if (key in obj && typeof obj[key] !== "string") {
		failures.push({ path: `${path}${key}`, message: "expected string" });
	}
}

function checkOptionalBoolean(obj: Record<string, unknown>, key: string, path: string, failures: SchemaFailure[]): void {
	if (key in obj && typeof obj[key] !== "boolean") {
		failures.push({ path: `${path}${key}`, message: "expected boolean" });
	}
}

/** `.helm/config.json` — strict structural validation. */
export function validateHelmConfig(raw: unknown): ValidationResult<Record<string, unknown>> {
	const failures: SchemaFailure[] = [];
	if (!isPlainObject(raw)) {
		return { ok: false, failures: [{ path: "", message: "config must be a JSON object" }] };
	}
	checkUnknownKeys(raw, CONFIG_KEYS, "", failures);

	if ("version" in raw && typeof raw.version !== "number") {
		failures.push({ path: "version", message: "expected number" });
	}
	checkOptionalString(raw, "locale", "", failures);

	if ("efficiency" in raw) {
		const eff = raw.efficiency;
		if (!isPlainObject(eff)) {
			failures.push({ path: "efficiency", message: "expected object" });
		} else {
			checkUnknownKeys(eff, EFFICIENCY_KEYS, "efficiency", failures);
			for (const k of ["actionFusion", "observationPack", "evidencePreservingReducer", "onlineContextCompact"]) {
				checkOptionalBoolean(eff, k, "efficiency.", failures);
			}
			checkOptionalString(eff, "reducerModel", "efficiency.", failures);
			checkOptionalString(eff, "reducerProvider", "efficiency.", failures);
			if ("cacheWriteReadRatio" in eff && typeof eff.cacheWriteReadRatio !== "number") {
				failures.push({ path: "efficiency.cacheWriteReadRatio", message: "expected number" });
			}
		}
	}

	if ("defense" in raw) {
		const def = raw.defense;
		if (!isPlainObject(def)) {
			failures.push({ path: "defense", message: "expected object" });
		} else {
			checkUnknownKeys(def, DEFENSE_KEYS, "defense", failures);
			for (const k of ["watcher", "stepToolCap", "sameToolLimit"]) {
				checkOptionalBoolean(def, k, "defense.", failures);
			}
			if ("watcherEveryTurns" in def && typeof def.watcherEveryTurns !== "number") {
				failures.push({ path: "defense.watcherEveryTurns", message: "expected number" });
			}
		}
	}

	return failures.length > 0 ? { ok: false, failures } : { ok: true, value: raw };
}

/** `.helm/spec.json` — strict structural validation (semantic L1–L6 lint lands W3). */
export function validateHelmSpec(raw: unknown): ValidationResult<Record<string, unknown>> {
	const failures: SchemaFailure[] = [];
	if (!isPlainObject(raw)) {
		return { ok: false, failures: [{ path: "", message: "spec must be a JSON object" }] };
	}
	checkUnknownKeys(raw, SPEC_KEYS, "", failures);

	if (!("goal" in raw) || typeof raw.goal !== "string") {
		failures.push({ path: "goal", message: "required string" });
	}
	if (!("allowedTargets" in raw) || !Array.isArray(raw.allowedTargets) || raw.allowedTargets.some((t) => typeof t !== "string")) {
		failures.push({ path: "allowedTargets", message: "required array of strings" });
	}
	if ("outOfScope" in raw && (!Array.isArray(raw.outOfScope) || raw.outOfScope.some((t) => typeof t !== "string"))) {
		failures.push({ path: "outOfScope", message: "expected array of strings" });
	}
	if (!("highRisk" in raw) || typeof raw.highRisk !== "string" || !HIGH_RISK.has(raw.highRisk)) {
		failures.push({ path: "highRisk", message: 'required one of "deny" | "hitl" | "allow"' });
	}
	checkOptionalString(raw, "playbookId", "", failures);
	if ("allowExternal" in raw && typeof raw.allowExternal !== "boolean") {
		failures.push({ path: "allowExternal", message: "expected boolean" });
	}
	if ("requireCoverage" in raw && typeof raw.requireCoverage !== "boolean") {
		failures.push({ path: "requireCoverage", message: "expected boolean" });
	}
	if ("maxTokens" in raw && typeof raw.maxTokens !== "number") {
		failures.push({ path: "maxTokens", message: "expected number" });
	}

	return failures.length > 0 ? { ok: false, failures } : { ok: true, value: raw };
}
