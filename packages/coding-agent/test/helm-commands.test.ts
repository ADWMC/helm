import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHelmCommand } from "../src/cli/helm-commands.ts";

/**
 * W1-T03: helm product shell commands (PLAN §1.5 / W1-taskbook).
 * Contract: true = handled by us, false = untouched fall-through.
 */

describe("helm product commands", () => {
	let cwd: string;
	let specPath: string;
	let originalExitCode: string | number | null | undefined;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "helm-cmd-"));
		specPath = path.join(cwd, ".helm", "spec.json");
		originalExitCode = process.exitCode;
		process.exitCode = 0;
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
		process.exitCode = originalExitCode;
	});

	it("does not hijack host argv (unrelated commands fall through)", async () => {
		for (const argv of [["--help"], ["auth", "print-api-key"], ["install", "x"], ["something"], []]) {
			await expect(runHelmCommand([...argv], cwd)).resolves.toBe(false);
		}
		expect(process.exitCode ?? 0).toBe(0);
	});

	it("spec init scaffolds .helm/spec.json and refuses overwrite without --force", async () => {
		await expect(runHelmCommand(["spec", "init"], cwd)).resolves.toBe(true);
		expect(fs.existsSync(specPath)).toBe(true);
		const scaffold = JSON.parse(fs.readFileSync(specPath, "utf8")) as Record<string, unknown>;
		expect(scaffold).toHaveProperty("goal", "");
		expect(scaffold).toHaveProperty("allowedTargets");
		expect(process.exitCode).toBe(0);

		process.exitCode = 0;
		await expect(runHelmCommand(["spec", "init"], cwd)).resolves.toBe(true);
		expect(process.exitCode).toBe(1); // refuses overwrite

		process.exitCode = 0;
		await expect(runHelmCommand(["spec", "init", "--force"], cwd)).resolves.toBe(true);
		expect(process.exitCode).toBe(0);
	});

	it("spec without init argument is a usage error", async () => {
		await expect(runHelmCommand(["spec"], cwd)).resolves.toBe(true);
		expect(process.exitCode).toBe(2);
	});

	it("validate-scope: allow exits 0, deny exits 3 (fail-closed), missing target exits 2", async () => {
		// no spec at all → fail-closed deny
		await expect(runHelmCommand(["validate-scope", "http://127.0.0.1:8080"], cwd)).resolves.toBe(true);
		expect(process.exitCode).toBe(3);

		// exact allow-list hit
		fs.mkdirSync(path.dirname(specPath), { recursive: true });
		fs.writeFileSync(
			specPath,
			JSON.stringify({ goal: "t", allowedTargets: ["http://127.0.0.1:8080"], highRisk: "deny" }),
			"utf8",
		);
		process.exitCode = 0;
		await expect(runHelmCommand(["validate-scope", "http://127.0.0.1:8080"], cwd)).resolves.toBe(true);
		expect(process.exitCode).toBe(0);

		// out-of-list → deny
		process.exitCode = 0;
		await expect(runHelmCommand(["validate-scope", "http://evil.example/"], cwd)).resolves.toBe(true);
		expect(process.exitCode).toBe(3);

		process.exitCode = 0;
		await expect(runHelmCommand(["validate-scope"], cwd)).resolves.toBe(true);
		expect(process.exitCode).toBe(2);
	});

	it("report without a ledger fails honestly (exit 1)", async () => {
		await expect(runHelmCommand(["report"], cwd)).resolves.toBe(true);
		expect(process.exitCode).toBe(1);
	});

	it("doctor probes the toolchain into .helm/tool-memory.db (W1-T06) and attack-coverage stays honest", async () => {
		await expect(runHelmCommand(["doctor"], cwd)).resolves.toBe(true);
		expect(process.exitCode).toBe(0);
		const dbPath = path.join(cwd, ".helm", "tool-memory.db");
		expect(fs.existsSync(dbPath)).toBe(true);
		// same store read-back: node/npm/git must exist (env has them), ≥5 probed
		const { openToolMemory } = await import("@adwmc/helm-kernel/memory");
		const store = openToolMemory(dbPath);
		const all = store.all();
		expect(all.length).toBeGreaterThanOrEqual(5);
		expect(all.some((e) => e.name === "node" && e.status === "verified")).toBe(true);
		expect(all.every((e) => e.probe)).toBe(true);
		store.close();
		process.exitCode = 0;
		await expect(runHelmCommand(["attack-coverage"], cwd)).resolves.toBe(true);
		expect(process.exitCode).toBe(0);
	});

	it("run/resume strip the subcommand and fall through (host flow intact)", async () => {
		const args = ["run", "--name", "x"];
		await expect(runHelmCommand(args, cwd)).resolves.toBe(false);
		expect(args).toEqual(["--name", "x"]); // 'run' removed so it is not read as a prompt
		expect(process.exitCode ?? 0).toBe(0);
	});
});
