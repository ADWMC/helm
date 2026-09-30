import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { validateHelmSpec } from "@adwmc/helm-kernel/config";
import { lintHelmSpec } from "@adwmc/helm-kernel/spec-lint";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHelmCommand } from "../src/cli/helm-commands.ts";
import { initSummary, parseInitFlags, runHelmInit, verifySpec } from "../src/cli/helm-init.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";

/**
 * helm init wizard contract: it produces a workspace whose Spec passes the same
 * checkers the run gate uses (validateHelmSpec + lintHelmSpec), and it refuses
 * to write anything that would die at `helm run` with an opaque failure.
 */

const GOAL = "Enumerate the endpoints of http://127.0.0.1:18081/ and report their status codes";
const TARGETS = "http://127.0.0.1:18081*";

describe("helm init wizard", () => {
	let cwd: string;
	let agentDir: string;
	let modePath: string;
	let originalExitCode: string | number | null | undefined;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "helm-init-"));
		agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "helm-init-agent-"));
		modePath = path.join(agentDir, "analysis-mode");
		originalExitCode = process.exitCode;
		process.exitCode = 0;
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
		fs.rmSync(agentDir, { recursive: true, force: true });
		process.exitCode = originalExitCode;
	});

	function settings(): SettingsManager {
		return SettingsManager.create(cwd, agentDir);
	}

	it("writes a Spec that passes the run gate, plus mode and default model", async () => {
		const r = await runHelmInit(
			[
				"--goal",
				GOAL,
				"--targets",
				TARGETS,
				"--diagnostics",
				"status codes",
				"--mode",
				"full",
				"--model",
				"xiaomi/mimo-v2.6-flash",
			],
			cwd,
			{ interactive: false, modePath, settings: settings() },
		);
		expect(r.ok, r.errors.join(" | ")).toBe(true);
		expect(r.exitCode).toBe(0);

		const spec = JSON.parse(fs.readFileSync(path.join(cwd, ".helm", "spec.json"), "utf8")) as Record<string, unknown>;
		expect(validateHelmSpec(spec).ok).toBe(true);
		expect(lintHelmSpec(spec as Parameters<typeof lintHelmSpec>[0])).toEqual([]);
		expect(spec.goal).toBe(GOAL);
		expect(spec.allowedTargets).toEqual([TARGETS]);
		expect(spec.highRisk).toBe("deny");
		expect(spec.maxTokens).toBe(500_000);
		expect(spec.diagnosticSet).toEqual(["status codes"]);

		expect(fs.readFileSync(modePath, "utf8").trim()).toBe("full");
		const s = settings();
		expect(s.getDefaultModel()).toBe("mimo-v2.6-flash");
		expect(s.getDefaultProvider()).toBe("xiaomi");

		expect(initSummary(r, cwd)).toContain("helm run");
	});

	it("refuses with the missing pieces named and writes nothing", async () => {
		const r = await runHelmInit(["--targets", TARGETS], cwd, { interactive: false, modePath, settings: settings() });
		expect(r.ok).toBe(false);
		expect(r.exitCode).toBe(2);
		expect(r.errors.join(" | ")).toContain("missing --goal");
		expect(fs.existsSync(path.join(cwd, ".helm", "spec.json"))).toBe(false);
		expect(r.written).toEqual([]);
	});

	it("blocks on lint with the failing rule named (L1: goal lacks a measurable anchor)", async () => {
		const r = await runHelmInit(["--goal", "check the system", "--targets", TARGETS], cwd, {
			interactive: false,
			modePath,
			settings: settings(),
		});
		expect(r.ok).toBe(false);
		expect(r.errors.join(" | ")).toContain("spec lint [L1]");
		expect(fs.existsSync(path.join(cwd, ".helm", "spec.json"))).toBe(false);
	});

	it("blocks on L3 when the diagnostic set never appears in the goal", async () => {
		const r = await runHelmInit(
			["--goal", GOAL, "--targets", TARGETS, "--diagnostics", "quantum-flux-capacitor"],
			cwd,
			{ interactive: false, modePath, settings: settings() },
		);
		expect(r.ok).toBe(false);
		expect(r.errors.join(" | ")).toContain("spec lint [L3]");
	});

	it("rejects a malformed model value before writing anything", async () => {
		const r = await runHelmInit(["--goal", GOAL, "--targets", TARGETS, "--model", "nonsense-without-slash"], cwd, {
			interactive: false,
			modePath,
			settings: settings(),
		});
		expect(r.ok).toBe(false);
		expect(r.errors.join(" | ")).toContain("provider/modelId");
		expect(fs.existsSync(path.join(cwd, ".helm", "spec.json"))).toBe(false);
	});

	it("refuses to overwrite an existing spec without --force", async () => {
		const args = ["--goal", GOAL, "--targets", TARGETS, "--diagnostics", "status codes"];
		await runHelmInit(args, cwd, { interactive: false, modePath, settings: settings() });
		const again = await runHelmInit(args, cwd, { interactive: false, modePath, settings: settings() });
		expect(again.ok).toBe(false);
		expect(again.errors.join(" | ")).toContain("--force");

		const forced = await runHelmInit([...args, "--force"], cwd, {
			interactive: false,
			modePath,
			settings: settings(),
		});
		expect(forced.ok, forced.errors.join(" | ")).toBe(true);
	});

	it("fills only the missing values in interactive mode", async () => {
		const answers = [GOAL, TARGETS, "deny", "600000", "status codes", "n", "lite", ""];
		const r = await runHelmInit([], cwd, {
			interactive: true,
			ask: async () => answers.shift() ?? "",
			modePath,
			settings: settings(),
		});
		expect(r.ok, r.errors.join(" | ")).toBe(true);
		const spec = JSON.parse(fs.readFileSync(path.join(cwd, ".helm", "spec.json"), "utf8")) as Record<string, unknown>;
		expect(spec.maxTokens).toBe(600_000);
		expect(spec.diagnosticSet).toEqual(["status codes"]);
		expect(fs.readFileSync(modePath, "utf8").trim()).toBe("lite");
		expect(settings().getDefaultModel()).toBeUndefined();
	});

	it("parses flags and validates specs with the same checkers as the gate", () => {
		expect(parseInitFlags(["--goal", "g", "--targets", "a,b", "--force"])).toMatchObject({
			goal: "g",
			targets: ["a", "b"],
			force: true,
		});
		const bad = verifySpec({ goal: "x" });
		expect(bad.errors.length).toBeGreaterThan(0);
	});

	it("is dispatched by runHelmCommand as a product command", async () => {
		await expect(
			runHelmCommand(["init", "--goal", GOAL, "--targets", TARGETS, "--diagnostics", "status codes"], cwd),
		).resolves.toBe(true);
		expect(fs.existsSync(path.join(cwd, ".helm", "spec.json"))).toBe(true);
	});
});
