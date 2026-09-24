import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { loadExtensionsCached, withBuiltinKernel } from "../src/core/extensions/loader.ts";

/**
 * W1-T02 product injection: builtin kernel is prepended at PRODUCT STARTUP
 * (main.ts additionalExtensionPaths) — the generic loader stays upstream-pure
 * (fixture/noTools/defaultTools contracts intact). Live proof of production
 * loading: docs/tests/2026-fork-gates (denials=16 phaseOk).
 */

describe("withBuiltinKernel (product startup injection)", () => {
	it("prepends the builtin kernel exactly once and preserves order", () => {
		const once = withBuiltinKernel(["/tmp/user-a.ts"]);
		expect(once).toHaveLength(2);
		expect(once[0]).toContain(path.join("helmpi-kernel", "src", "index.ts"));
		expect(once[1]).toBe("/tmp/user-a.ts");
		const twice = withBuiltinKernel(once);
		expect(twice).toHaveLength(2); // idempotent
	});

	it("generic loader WITHOUT injection stays clean (upstream fixture contract)", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "helm-nobuiltin-"));
		const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "helm-nobuiltin-agent-"));
		try {
			const r = await loadExtensionsCached([], cwd);
			expect(r.errors).toEqual([]);
			expect(r.extensions).toHaveLength(0); // no forced kernel here — injection is startup's job
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
			fs.rmSync(agentDir, { recursive: true, force: true });
		}
	}, 60_000);
});
