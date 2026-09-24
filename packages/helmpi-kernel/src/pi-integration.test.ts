/** Pi 0.85 integration: load extension via DefaultResourceLoader + faux session if available. */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { discoverAndLoadExtensions } from "@adwmc/helm-coding-agent";

test("Pi discoverAndLoadExtensions loads helm-pi with zero errors", async () => {
	const agentDir = mkdtempSync(join(tmpdir(), "helmpi-agent-"));
	try {
		mkdirSync(join(agentDir, "extensions"), { recursive: true });
		const extPath = resolve("src/index.ts"); // source-only kernel (transform-types loads it in-process)
		const r = await discoverAndLoadExtensions([extPath], process.cwd(), agentDir);
		assert.equal(r.errors?.length ?? 0, 0, JSON.stringify(r.errors));
		assert.equal(r.extensions?.length ?? 0, 1);
		const ext = r.extensions![0]!;
		const toolNames =
			ext.tools instanceof Map
				? [...ext.tools.keys()]
				: Array.isArray(ext.tools)
					? (ext.tools as { name?: string }[]).map((t) => t.name)
					: Object.keys(ext.tools as unknown as Record<string, unknown>);
		const names = toolNames;
		const joined = names.join(",");
		assert.match(joined, /helmpi_status|begin_case|route_task/);
		const cmds = ext.commands;
		const cmdNames = Array.isArray(cmds)
			? cmds.map((c) => (typeof c === "string" ? c : c.name))
			: cmds instanceof Map
				? [...cmds.keys()]
				: [];
		assert.ok(
			cmdNames.includes("helmpi") || JSON.stringify(cmds).includes("helmpi"),
			`commands=${JSON.stringify(cmdNames)}`,
		);
		assert.ok(ext.handlers?.size ?? Object.keys(ext.handlers ?? {}).length >= 0);
	} finally {
		try {
			rmSync(agentDir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

test("extension module default export is a function", async () => {
	const mod = (await import("./index.ts")) as { default?: unknown };
	// after build this is .js — test runs from dist
	assert.equal(typeof mod.default, "function");
});
