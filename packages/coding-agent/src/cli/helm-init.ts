/**
 * helm init — workspace configuration wizard.
 *
 * The problem this solves: a fresh workspace used to mean hand-writing
 * .helm/spec.json and hoping. A file with a missing `highRisk` is silently
 * skipped by the scope loader (the run then dies on an opaque `no_spec`), and
 * `helm spec init` only scaffolds an empty goal that `helm run` will refuse. The
 * wizard collects the three things a workspace actually needs — Spec, model,
 * analysis mode — and it will NOT write a Spec the run gate would reject: the
 * same validators the gates use (validateHelmSpec + lintHelmSpec) must pass
 * first, with every failure named.
 *
 * Non-interactive safe: every value has a flag; without a TTY the wizard either
 * succeeds from flags or exits 2 with the exact missing pieces.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { validateHelmSpec } from "@adwmc/helm-kernel/config";
import { lintHelmSpec } from "@adwmc/helm-kernel/spec-lint";
import { SettingsManager } from "../core/settings-manager.ts";

export interface InitAnswers {
	readonly goal?: string;
	readonly targets?: readonly string[];
	readonly highRisk?: "deny" | "hitl" | "allow";
	readonly allowExternal?: boolean;
	readonly maxTokens?: number;
	readonly diagnostics?: readonly string[];
	readonly mode?: "lite" | "full" | "deep";
	/** "provider/modelId" — persisted as the workspace default model. */
	readonly model?: string;
}

export interface InitOptions {
	/** Overwrite an existing spec. */
	readonly force?: boolean;
	/** Prompt for anything not answered by flags (requires a TTY or injected ask). */
	readonly interactive?: boolean;
	/** Injectable prompt (tests); defaults to stdin when interactive. */
	readonly ask?: (question: string, fallback: string) => Promise<string>;
	/** Override the analysis-mode file path (tests). */
	readonly modePath?: string;
	/** Override the settings manager (tests). */
	readonly settings?: SettingsManager;
}

export interface InitResult {
	readonly ok: boolean;
	readonly exitCode: number;
	readonly errors: readonly string[];
	readonly written: readonly string[];
	readonly spec?: Record<string, unknown>;
}

/** All values the wizard can set, as a checklist for prompts and messages. */
const HIGH_RISK = ["deny", "hitl", "allow"] as const;
const MODES = ["lite", "full", "deep"] as const;

function csv(v: string | undefined): string[] | undefined {
	if (v === undefined) return undefined;
	const out = v
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s !== "");
	return out.length > 0 ? out : undefined;
}

/** Parse `--flag value` pairs plus `--force` / `--interactive` booleans. */
export function parseInitFlags(args: readonly string[]): InitAnswers & { force: boolean; interactive: boolean } {
	const out: {
		goal?: string;
		targets?: string[];
		highRisk?: "deny" | "hitl" | "allow";
		allowExternal?: boolean;
		maxTokens?: number;
		diagnostics?: string[];
		mode?: "lite" | "full" | "deep";
		model?: string;
		force: boolean;
		interactive: boolean;
	} = { force: false, interactive: false };
	let i = 0;
	const take = (): string | undefined => {
		const v = i < args.length ? args[i] : undefined;
		i += 1;
		return v;
	};
	while (i < args.length) {
		const a = take();
		switch (a) {
			case "--goal":
				out.goal = take();
				break;
			case "--targets":
				out.targets = csv(take());
				break;
			case "--high-risk": {
				const v = take();
				if (v === "deny" || v === "hitl" || v === "allow") out.highRisk = v;
				break;
			}
			case "--max-tokens": {
				const v = Number(take());
				if (Number.isFinite(v) && v > 0) out.maxTokens = Math.floor(v);
				break;
			}
			case "--diagnostics":
				out.diagnostics = csv(take());
				break;
			case "--allow-external":
				out.allowExternal = true;
				break;
			case "--mode": {
				const v = take();
				if (v === "lite" || v === "full" || v === "deep") out.mode = v;
				break;
			}
			case "--model":
				out.model = take();
				break;
			case "--force":
				out.force = true;
				break;
			case "--interactive":
				out.interactive = true;
				break;
			default:
				break;
		}
	}
	return out;
}

/** Build the Spec object the gates accept (only known keys — validateHelmSpec rejects unknowns). */
export function buildSpec(a: InitAnswers): Record<string, unknown> {
	const goal = (a.goal ?? "").trim();
	const targets = [...(a.targets ?? [])];
	const spec: Record<string, unknown> = {
		goal,
		allowedTargets: targets,
		outOfScope: [] as string[],
		highRisk: a.highRisk ?? "deny",
		maxTokens: a.maxTokens ?? 500_000,
	};
	if (a.allowExternal === true) spec.allowExternal = true;
	const diagnostics = [...(a.diagnostics ?? [])];
	if (diagnostics.length > 0) spec.diagnosticSet = diagnostics;
	return spec;
}

/** Validate with the exact checkers the loader and run gate use. */
export function verifySpec(spec: Record<string, unknown>): { errors: string[] } {
	const errors: string[] = [];
	const schema = validateHelmSpec(spec);
	if (!schema.ok) {
		for (const f of schema.failures) errors.push(`spec schema: ${f.path || "<root>"}: ${f.message}`);
		return { errors };
	}
	for (const f of lintHelmSpec(spec as Parameters<typeof lintHelmSpec>[0])) {
		errors.push(`spec lint [${f.rule}]: ${f.message}`);
	}
	return { errors };
}

function parseModel(model: string): { provider: string; modelId: string } | null {
	const s = model.trim();
	const at = s.indexOf("/");
	if (at <= 0 || at === s.length - 1) return null;
	return { provider: s.slice(0, at), modelId: s.slice(at + 1) };
}

export function defaultModePath(): string {
	return join(homedir(), ".helm-pi", "analysis-mode");
}

async function fillMissing(a: InitAnswers, opts: InitOptions): Promise<InitAnswers> {
	const ask =
		opts.ask ??
		(async (question: string, fallback: string): Promise<string> => {
			const rl = createInterface({ input: process.stdin, output: process.stdout });
			try {
				const answer = (await rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `)).trim();
				return answer === "" ? fallback : answer;
			} finally {
				rl.close();
			}
		});

	const out: {
		goal?: string;
		targets?: string[];
		highRisk?: "deny" | "hitl" | "allow";
		allowExternal?: boolean;
		maxTokens?: number;
		diagnostics?: string[];
		mode?: "lite" | "full" | "deep";
		model?: string;
	} = {
		...a,
		targets: a.targets === undefined ? undefined : [...a.targets],
		diagnostics: a.diagnostics === undefined ? undefined : [...a.diagnostics],
	};

	if (!out.goal) out.goal = (await ask("Goal (one sentence, with what to measure)", "")).trim();
	if (!out.targets || out.targets.length === 0)
		out.targets = csv(await ask("Allowed targets (comma: exact / glob / CIDR)", "")) ?? [];
	if (!out.highRisk) {
		const v = await ask(`High-risk policy (${HIGH_RISK.join("/")})`, "deny");
		if (v === "deny" || v === "hitl" || v === "allow") out.highRisk = v;
	}
	if (!out.maxTokens) {
		const v = Number(await ask("Max tokens per run", "500000"));
		if (Number.isFinite(v) && v > 0) out.maxTokens = Math.floor(v);
	}
	if (!out.diagnostics)
		out.diagnostics = csv(await ask("Diagnostic set (words that also appear in the goal)", "")) ?? [];
	if (out.allowExternal === undefined)
		out.allowExternal = (await ask("Allow external (non-private) targets? (y/n)", "n")).toLowerCase().startsWith("y");
	if (!out.mode) {
		const v = await ask(`Analysis mode (${MODES.join("/")})`, "full");
		if (v === "lite" || v === "full" || v === "deep") out.mode = v;
	}
	if (!out.model)
		out.model = (await ask("Default model (provider/modelId, empty keeps current)", "")).trim() || undefined;
	return out;
}

/**
 * Run the wizard. Writes .helm/spec.json only when schema + lint both pass;
 * then the mode file and default model when given. Returns every error at once
 * so a single round of edits fixes the Spec.
 */
export async function runHelmInit(args: readonly string[], cwd: string, opts: InitOptions = {}): Promise<InitResult> {
	const flags = parseInitFlags(args);
	const errors: string[] = [];
	const written: string[] = [];

	const interactive =
		opts.interactive ?? (flags.interactive || opts.ask !== undefined || process.stdin.isTTY === true);
	let answers: InitAnswers = flags;
	if (interactive) answers = await fillMissing(flags, opts);

	if ((answers.goal ?? "").trim() === "") errors.push("missing --goal (one sentence with what to measure)");
	if ((answers.targets ?? []).length === 0) errors.push("missing --targets (comma-separated allowed targets)");
	if (answers.model) {
		if (!parseModel(answers.model)) errors.push(`--model must be "provider/modelId", got: ${answers.model}`);
	}
	if (errors.length > 0) return { ok: false, exitCode: 2, errors, written };

	const spec = buildSpec(answers);
	const verdict = verifySpec(spec);
	if (verdict.errors.length > 0) return { ok: false, exitCode: 2, errors: verdict.errors, written };

	const helmDir = join(cwd, ".helm");
	const specPath = join(helmDir, "spec.json");
	if (existsSync(specPath) && !flags.force) {
		return { ok: false, exitCode: 2, errors: [`${specPath} already exists (use --force to overwrite)`], written };
	}
	mkdirSync(helmDir, { recursive: true });
	writeFileSync(specPath, `${JSON.stringify(spec, null, "\t")}\n`, "utf8");
	written.push(specPath);

	if (answers.mode) {
		const modePath = opts.modePath ?? defaultModePath();
		mkdirSync(dirname(modePath), { recursive: true });
		writeFileSync(modePath, `${answers.mode}\n`, "utf8");
		written.push(modePath);
	}

	if (answers.model) {
		const parsed = parseModel(answers.model);
		if (parsed) {
			const settings = opts.settings ?? SettingsManager.create(cwd);
			settings.setDefaultModelAndProvider(parsed.provider, parsed.modelId);
			written.push(`settings.defaultModel=${parsed.provider}/${parsed.modelId}`);
		}
	}

	return { ok: true, exitCode: 0, errors: [], written, spec };
}

/** Human summary printed after a successful init. */
export function initSummary(r: InitResult, cwd: string): string {
	const lines: string[] = ["workspace initialized:"];
	for (const w of r.written) lines.push(`  wrote ${w}`);
	lines.push(`  spec validated: schema ok, lint ok (L1-L6)`);
	if (r.spec) {
		lines.push(`  goal: ${String(r.spec.goal)}`);
		lines.push(`  targets: ${(r.spec.allowedTargets as string[]).join(", ")}`);
		lines.push(`  highRisk: ${String(r.spec.highRisk)}  maxTokens: ${String(r.spec.maxTokens)}`);
	}
	lines.push(`next: helm validate-scope <target>   # probe one target`);
	lines.push(`      helm run "<prompt>"            # start from ${cwd}`);
	return lines.join("\n");
}
