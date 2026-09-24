import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverAndLoadExtensions } from "../src/core/extensions/loader.ts";

/**
 * W1-T04 双载守卫 (WG1.4): external SoL-Pi installs are dropped in favor of
 * the builtin efficiency suite and a `.helm/guard.jsonl` journal line is written.
 */

describe("solpi double-load guard", () => {
	let cwd: string;
	let agentDir: string;
	let extDir: string;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "helm-guard-"));
		agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "helm-guard-agent-"));
		extDir = path.join(agentDir, "extensions");
		fs.mkdirSync(extDir, { recursive: true });
		fs.mkdirSync(path.join(cwd, ".helm"), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
		fs.rmSync(agentDir, { recursive: true, force: true });
	});

	function makeExternalSolPi(): string {
		const dir = path.join(extDir, "sol-pi");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "sol-pi", private: true }));
		fs.writeFileSync(
			path.join(dir, "index.ts"),
			`export default function (pi) {
				pi.registerTool({ name: "EXTERNAL_SOLPI_MARKER", label: "x", description: "x", parameters: {}, execute: async () => ({ content: [] }) });
			}`,
			"utf8",
		);
		return dir;
	}

	it("drops an external sol-pi install, keeps builtin kernel, journals guard line", async () => {
		// timeout: cold vite transform under /mnt/c
		const external = makeExternalSolPi();
		const r = await discoverAndLoadExtensions([external], cwd, agentDir);
		expect(r.errors).toEqual([]);
		// builtin kernel loads; external marker must not exist anywhere in the result
		const names = JSON.stringify([...(r.extensions ?? [])].map((e) => e.path));
		expect(r.extensions).toHaveLength(1);
		expect(names).toContain("helmpi-kernel");
		expect(names).not.toContain(path.join(extDir, "sol-pi"));
		// journal line
		const guardPath = path.join(cwd, ".helm", "guard.jsonl");
		expect(fs.existsSync(guardPath)).toBe(true);
		const lines = fs
			.readFileSync(guardPath, "utf8")
			.split("\n")
			.filter(Boolean)
			.map((l) => JSON.parse(l) as { guard: string; action: string; path: string });
		expect(lines).toHaveLength(1);
		expect(lines[0]?.guard).toBe("solpi-double-load");
		expect(lines[0]?.action).toBe("dropped-external");
		expect(lines[0]?.path).toContain("sol-pi");
	}, 120_000);

	it("does not drop unrelated extensions (no false positives)", async () => {
		const dir = path.join(extDir, "some-other-tool");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "other" }));
		fs.writeFileSync(path.join(dir, "index.ts"), `export default function () {}`, "utf8");
		const r = await discoverAndLoadExtensions([dir], cwd, agentDir);
		expect(r.errors).toEqual([]);
		const paths = JSON.stringify([...(r.extensions ?? [])].map((e) => e.path));
		expect(paths).toContain("some-other-tool");
		expect(fs.existsSync(path.join(cwd, ".helm", "guard.jsonl"))).toBe(false);
	});
});
