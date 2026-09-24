/**
 * helm product shell commands (W1-T03, PLAN §1.5 命令面).
 *
 * Dispatch contract (mirrors runAuthCommand in main.ts): return true when this
 * argv is a helm product command and has been handled (exit code set via
 * process.exitCode where applicable); return false otherwise so the host falls
 * through to its normal flow untouched.
 *
 * Commands: spec init · run · resume · report · validate-scope ·
 *           attack-coverage · doctor   (`helmpi` is the same binary).
 * Stubs print honest "not yet" states instead of pretending coverage:
 * doctor probes land with W1-T06 (tool-memory), attack data with W3.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateHelmSpec } from "@adwmc/helm-kernel/config";
import { exportReport, exportReportJson, reportExitCode } from "@adwmc/helm-kernel/export";
import { Ledger } from "@adwmc/helm-kernel/ledger";
import { validateScopeQuery } from "@adwmc/helm-kernel/scope";

const HELM_COMMANDS: ReadonlySet<string> = new Set([
	"spec",
	"run",
	"resume",
	"report",
	"validate-scope",
	"attack-coverage",
	"doctor",
]);

function flag(args: string[], name: string): string | undefined {
	const i = args.indexOf(name);
	return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function specScaffold() {
	return {
		goal: "",
		allowedTargets: [] as string[],
		outOfScope: [] as string[],
		highRisk: "deny" as const,
		maxTokens: 500_000,
	};
}

/** Returns true iff argv[0] is a helm product command (handled or errored). */
export async function runHelmCommand(args: string[], cwd: string = process.cwd()): Promise<boolean> {
	const cmd = args[0];
	if (!cmd || !HELM_COMMANDS.has(cmd)) return false;
	const helmDir = join(cwd, ".helm");
	const specPath = join(helmDir, "spec.json");

	switch (cmd) {
		case "spec": {
			if (args[1] !== "init") {
				console.error("usage: helm spec init [--force]");
				process.exitCode = 2;
				return true;
			}
			mkdirSync(helmDir, { recursive: true });
			if (existsSync(specPath) && !args.includes("--force")) {
				console.error(`refusing to overwrite ${specPath} (use --force)`);
				process.exitCode = 1;
				return true;
			}
			const scaffold = specScaffold();
			const sv = validateHelmSpec(scaffold);
			if (!sv.ok) {
				console.error(`internal scaffold invalid: ${sv.failures.map((f) => `${f.path}: ${f.message}`).join(", ")}`);
				process.exitCode = 1;
				return true;
			}
			writeFileSync(specPath, `${JSON.stringify(scaffold, null, 2)}${String.fromCharCode(10)}`, "utf8");
			// Best-effort SOW template copy (dev layout carries docs/ next to the repo root).
			const tplCandidates = [resolve(cwd, "docs/SOW-TEMPLATE.md"), resolve(cwd, "../../docs/SOW-TEMPLATE.md")];
			let tpl = "";
			for (const c of tplCandidates) {
				if (existsSync(c)) {
					const target = join(cwd, "SOW.md");
					if (!existsSync(target)) writeFileSync(target, readFileSync(c, "utf8"), "utf8");
					tpl = `; SOW notes: ${target}`;
					break;
				}
			}
			console.log(`wrote ${specPath}${tpl}`);
			console.log("fill goal + allowedTargets (or author SOW.md); helm validate-scope <target> pre-checks");
			process.exitCode = 0;
			return true;
		}

		case "validate-scope": {
			const target = args.slice(1).filter((a) => !a.startsWith("--"))[0];
			if (!target) {
				console.error("usage: helm validate-scope <target> [--spec <path>]");
				process.exitCode = 2;
				return true;
			}
			const path = flag(args, "--spec") ?? specPath;
			let spec: unknown = null;
			if (existsSync(path)) {
				try {
					const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
					const sv = validateHelmSpec(parsed);
					if (!sv.ok) {
						console.error(
							`invalid spec schema at ${path}: ${sv.failures.map((f) => `${f.path}: ${f.message}`).join(", ")}`,
						);
						process.exitCode = 2;
						return true;
					}
					spec = parsed;
				} catch (err) {
					console.error(`invalid spec JSON at ${path}: ${String(err)}`);
					process.exitCode = 2;
					return true;
				}
			}
			const decision = validateScopeQuery(spec as never, target);
			console.log(JSON.stringify(decision, null, 2));
			// fail-closed: deny → non-zero (WG1.2 exit semantics)
			process.exitCode = decision.allow ? 0 : 3;
			return true;
		}

		case "report": {
			const dir = flag(args, "--dir") ?? join(cwd, ".helm");
			const dbPath = join(dir, "ledger.db");
			if (!existsSync(dbPath)) {
				console.error(`no ledger at ${dbPath} (run a session first, or pass --dir)`);
				process.exitCode = 1;
				return true;
			}
			const ledger = new Ledger(dbPath);
			const md = exportReport(ledger);
			const json = exportReportJson(ledger);
			const out = flag(args, "--out") ?? join(dir, "REPORT.md");
			writeFileSync(out, md, "utf8");
			const jsonOut = `${out.replace(/\.md$/i, "")}.json`;
			writeFileSync(jsonOut, JSON.stringify(json, null, 2), "utf8");
			const findings = Number(json.findings ?? 0);
			console.log(`wrote ${out}\nwrote ${jsonOut}\nfindings=${findings}`);
			// strix exit semantics: 0 = clean · 2 = findings present
			process.exitCode = reportExitCode(findings);
			ledger.close();
			return true;
		}

		case "attack-coverage": {
			// Honest empty state: findings do not carry ATT&CK mappings yet —
			// mapped data lands with the W3 engagement package (references/attack-navigator.json).
			console.log(
				"attack-coverage: no ATT&CK-mapped findings yet (mapping lands with W3 engagement; navigator reference: references/attack-navigator.json)",
			);
			process.exitCode = 0;
			return true;
		}

		case "doctor": {
			// Honest stub until W1-T06 (tool-memory probes) makes this real.
			console.log(
				"doctor: environment probes pending W1-T06 (tool-memory init; run helm doctor after kernel memory lands)",
			);
			process.exitCode = 0;
			return true;
		}

		case "run":
		case "resume": {
			if (existsSync(specPath)) {
				let goal = "";
				try {
					goal = String((JSON.parse(readFileSync(specPath, "utf8")) as { goal?: string }).goal ?? "");
				} catch {
					console.error(`warning: unreadable spec at ${specPath}`);
				}
				if (goal.trim()) {
					console.log(`spec loaded: ${specPath} (goal: ${goal})`);
				} else {
					// Full L1–L6 lint lands with W3; here we only flag the obvious.
					console.log(
						`warning: spec at ${specPath} has an empty goal (run helm spec init / fill it; strict lint arrives with W3)`,
					);
				}
			} else {
				console.log("no .helm/spec.json — starting a plain session (engagement runs are spec-driven)");
			}
			// Strip our subcommand so the host does not treat it as a prompt, then
			// fall through to the normal interactive/resume flow.
			args.shift();
			return false;
		}
	}

	/* c8 ignore next */
	return false;
}
