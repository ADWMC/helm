import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadExtensions, loadExtensionsCached } from "../src/core/extensions/loader.ts";

/**
 * W1-T02 correction: the REAL runtime path is loadExtensions[|Cached]
 * (resource-loader.loadCurrentExtensionSet) — discoverAndLoadExtensions is
 * NOT used at runtime, so tests must pin the choke point itself.
 */

describe("builtin kernel on the runtime load path", () => {
	let cwd: string;
	let agentDir: string;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "helm-rt-"));
		agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "helm-rt-agent-"));
		fs.mkdirSync(path.join(agentDir, "extensions"), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
		fs.rmSync(agentDir, { recursive: true, force: true });
	});

	it("loadExtensions([]) prepends the builtin kernel (no settings sources at all)", async () => {
		const r = await loadExtensions([], cwd);
		expect(r.errors).toEqual([]);
		expect(r.extensions).toHaveLength(1);
		expect(r.extensions[0]?.path).toContain("helmpi-kernel");
	}, 60_000);

	it("loadExtensionsCached likewise (resource-loader hot path)", async () => {
		const r = await loadExtensionsCached([], cwd);
		expect(r.errors).toEqual([]);
		expect(r.extensions).toHaveLength(1);
		expect(r.extensions[0]?.path).toContain("helmpi-kernel");
	}, 60_000);

	it("an extra user path coexists with builtin (kernel first)", async () => {
		const dir = path.join(cwd, ".helm", "extensions");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "foo.ts"), `export default function () {}`, "utf8");
		const r = await loadExtensions([path.join(dir, "foo.ts")], cwd);
		expect(r.errors).toEqual([]);
		expect(r.extensions.length).toBe(2);
		expect(r.extensions[0]?.path).toContain("helmpi-kernel");
	}, 60_000);
});
