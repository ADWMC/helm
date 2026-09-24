#!/usr/bin/env node

/** CLI: helmpi — run / board / hint / approve / export (M4–M6). */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Spec } from "./domain/types.ts";
import { exportReport, exportReportJson, reportExitCode } from "./export.ts";
import type { ProposeDecision } from "./ledger.ts";
import { Ledger } from "./ledger.ts";
import { emergencyStop, FileEchoExecutor, runLoop } from "./loop.ts";
import { checkGateOut } from "./playbook.ts";
import { applyProposal, parsePropose } from "./propose.ts";

function usage(): string {
	return `helmpi CLI

  helmpi init --goal G --target T [--target T2] [--dir D]
  helmpi run --dir D [--proposer-file decisions.jsonl]
  helmpi board --dir D
  helmpi hint --dir D --text "..."
  helmpi approve --dir D --kind step --ref ID
  helmpi gate --dir D --phase scope --satisfy key1,key2
  helmpi report --dir D [--out REPORT.md]   # writes .md + .json; exit 0=clean · 2=findings

Env: HELPI_RUN=0 pauses/aborts autonomous run.
`;
}

function open(dir: string): Ledger {
	return new Ledger(join(dir, "ledger.db"));
}

function requireDir(args: string[]): string {
	const i = args.indexOf("--dir");
	if (i < 0 || !args[i + 1]) throw new Error("--dir required");
	return resolve(args[i + 1]!);
}

function flag(args: string[], name: string): string | undefined {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
}

function flags(args: string[], name: string): string[] {
	const out: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === name && args[i + 1]) out.push(args[i + 1]!);
	}
	return out;
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const cmd = args[0];
	if (!cmd || cmd === "help" || cmd === "-h") {
		process.stdout.write(usage());
		return;
	}

	if (cmd === "init") {
		const goal = flag(args, "--goal") ?? "";
		const targets = flags(args, "--target");
		const dir = resolve(flag(args, "--dir") ?? join(process.cwd(), "helmpi-runs", Date.now().toString()));
		if (!goal) throw new Error("--goal required");
		if (targets.length === 0) throw new Error("at least one --target required");
		mkdirSync(dir, { recursive: true });
		const spec: Spec = {
			goal,
			allowedTargets: targets,
			highRisk: (flag(args, "--high-risk") as Spec["highRisk"]) ?? "deny",
		};
		const ledger = open(dir);
		ledger.setSpec(spec);
		ledger.setRunStatus("running");
		ledger.addClaim({
			id: "origin",
			role: "origin",
			description: targets.join(", "),
			evidenceRefs: [],
			creator: "cli",
			createdAt: Date.now(),
		});
		ledger.addClaim({
			id: "goal",
			role: "goal",
			description: goal,
			evidenceRefs: [],
			creator: "cli",
			createdAt: Date.now(),
		});
		ledger.close();
		process.stdout.write(`initialized ${dir}\n`);
		return;
	}

	if (cmd === "board") {
		const dir = requireDir(args);
		const ledger = open(dir);
		const ws = ledger.workspace();
		process.stdout.write(
			`${[
				`revision: ${ws.revision}`,
				`status: ${ws.runStatus}`,
				`goal: ${ws.spec.goal}`,
				`targets: ${ws.spec.allowedTargets.join(", ")}`,
				`steps: ${ws.steps.map((s) => `${s.id}:${s.status}`).join(", ") || "(none)"}`,
				`directions: ${ws.directions.map((d) => `${d.id}:${d.status}`).join(", ") || "(none)"}`,
				`observations: ${ws.observations.length}`,
				`hints: ${ws.hints.length}`,
				`open directions: ${ws.directions.filter((d) => d.status !== "concluded").length}`,
				`HELPI_RUN=${process.env.HELPI_RUN ?? "unset"}`,
				emergencyStop() ? "EMERGENCY STOP active" : "",
			]
				.filter(Boolean)
				.join("\n")}\n`,
		);
		ledger.close();
		return;
	}

	if (cmd === "hint") {
		const dir = requireDir(args);
		const text = flag(args, "--text") ?? "";
		if (!text) throw new Error("--text required");
		const ledger = open(dir);
		ledger.addHint({
			id: randomUUID(),
			content: text,
			creator: flag(args, "--by") ?? "operator",
			createdAt: Date.now(),
		});
		ledger.close();
		process.stdout.write("hint recorded\n");
		return;
	}

	if (cmd === "approve") {
		const dir = requireDir(args);
		const kind = flag(args, "--kind") ?? "step";
		const ref = flag(args, "--ref") ?? "";
		if (!ref) throw new Error("--ref required");
		const ledger = open(dir);
		ledger.approve(kind, ref, !flag(args, "--deny"), "operator");
		ledger.close();
		process.stdout.write(`approval ${kind}/${ref} recorded\n`);
		return;
	}

	if (cmd === "gate") {
		const _dir = requireDir(args);
		const phase = flag(args, "--phase") ?? "";
		const satisfy = new Set((flag(args, "--satisfy") ?? "").split(",").filter(Boolean));
		const pbPath = join(process.cwd(), "references/playbooks/reverse.yaml");
		const raw = readFileSync(pbPath, "utf8");
		// reuse test parser shape via dynamic import of playbooks helper — inline minimal:
		const { parsePlaybookYaml } = await import("./playbook-yaml.ts");
		const pb = parsePlaybookYaml(raw);
		const g = checkGateOut(pb, phase, satisfy);
		process.stdout.write(`${JSON.stringify(g, null, 2)}\n`);
		process.exitCode = g.ok ? 0 : 1;
		return;
	}

	if (cmd === "report") {
		const dir = requireDir(args);
		const ledger = open(dir);
		const md = exportReport(ledger);
		const json = exportReportJson(ledger);
		const out = flag(args, "--out") ?? join(dir, "REPORT.md");
		writeFileSync(out, md, "utf8");
		const jsonOut = `${out.replace(/\.md$/i, "")}.json`;
		writeFileSync(jsonOut, JSON.stringify(json, null, 2), "utf8");
		const findings = Number(json.findings ?? 0);
		process.stdout.write(`wrote ${out}\nwrote ${jsonOut}\nfindings=${findings}\n`);
		// strix exit semantics: 0 = clean/no findings · 2 = findings present
		process.exitCode = reportExitCode(findings);
		ledger.close();
		return;
	}

	if (cmd === "run") {
		const dir = requireDir(args);
		const ledger = open(dir);
		const proposerFile = flag(args, "--proposer-file");
		let queue: ProposeDecision[] = [];
		if (proposerFile && existsSync(proposerFile)) {
			queue = readFileSync(proposerFile, "utf8")
				.split(/\r?\n/)
				.filter(Boolean)
				.map((line) => parsePropose(JSON.parse(line)));
		}
		const result = await runLoop(ledger, {
			maxDecisions: Number(flag(args, "--max-decisions") ?? 20),
			sameKindLimit: Number(flag(args, "--same-kind") ?? 5),
			executor: new FileEchoExecutor(new Map([["*", "ok\n"]])),
			proposer: () => {
				if (queue.length > 0) return queue.shift()!;
				// default: cannot invent in-scope work without proposer — fail closed with idle
				return {
					finish: false,
					summary: "idle: no proposer decisions left",
				};
			},
		});
		// If idle proposal, runLoop marks failed — allow explicit finish-only runs
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		ledger.close();
		return;
	}

	if (cmd === "proposal") {
		// apply a single proposal (for tests/scripts)
		const dir = requireDir(args);
		const json = flag(args, "--json");
		if (!json) throw new Error("--json required");
		const ledger = open(dir);
		applyProposal(ledger, parsePropose(JSON.parse(json)));
		ledger.close();
		process.stdout.write("ok\n");
		return;
	}

	process.stdout.write(usage());
	process.exitCode = 1;
}

main().catch((e: unknown) => {
	process.stderr.write(`${String(e instanceof Error ? e.message : e)}\n`);
	process.exitCode = 1;
});
