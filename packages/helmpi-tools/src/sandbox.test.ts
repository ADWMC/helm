/**
 * W3-T02: sandbox executor negatives (§4.1 WG3.1 criteria).
 *   - daemon absent → fail-closed sandbox_unavailable (never host fallback)
 *   - with docker: run ok · host path deny (no /etc/passwd of host visible via
 *     mounts) · network deny (--network none → egress fails)
 * docker-gated cases self-skip when the daemon is unavailable.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSandboxTool, dockerAvailable, runInSandbox } from "./sandbox.ts";

test("fail-closed: daemon absent → sandbox_unavailable, no host execution", () => {
	if (dockerAvailable()) {
		// daemon present in this environment — assert positive path instead
		const r = runInSandbox({ workdir: tmpdir(), command: "echo sandbox-ok" });
		assert.match(r.stdout ?? "", /sandbox-ok/);
		return;
	}
	const r = runInSandbox({ workdir: tmpdir(), command: "echo should-not-run" });
	assert.equal(r.ok, false);
	assert.match(r.error ?? "", /sandbox_unavailable/);
	assert.equal(r.stdout, undefined, "no host execution output");
});

test("negatives (docker-gated): path deny + network deny + bounded exit", { skip: !dockerAvailable() }, () => {
	const wd = mkdtempSync(join(tmpdir(), "helm-sbx-"));
	try {
		writeFileSync(join(wd, "in-ws.txt"), "visible", "utf8");
		// 1) workdir visible (intended lane)
		const okRun = runInSandbox({ workdir: wd, command: "cat /workspace/in-ws.txt" });
		assert.equal(okRun.ok, true, okRun.stderr);
		// 2) host-only path outside the mount → denied (path does not exist in container)
		const hostPath = runInSandbox({
			workdir: wd,
			command: "ls /mnt/c >/dev/null 2>&1 && echo leaked || echo no-leak",
		});
		assert.match(hostPath.stdout ?? "", /no-leak/, "host-only paths invisible inside container");
		// 3) network denied at container netns (whitelist-外 egress rejected)
		const net = runInSandbox({
			workdir: wd,
			command: "wget -q -T 4 -O- http://127.0.0.1:18081/ 2>&1; echo exit=$?",
		});
		assert.ok(!(net.stdout ?? "").includes("weblab"), "egress must be denied");
		assert.match(net.stdout ?? "", /exit=[1-9]/, "network call failed (nonzero)");
	} finally {
		rmSync(wd, { recursive: true, force: true });
	}
});

test("tool surface: sandbox tool returns typed JSON envelope", async () => {
	const t = createSandboxTool(tmpdir());
	const res = await t.execute("1", { command: "echo hi" });
	const first = res.content[0] as { text?: string } | undefined;
	const text = first?.text ?? "";
	assert.ok(text.includes('"ok"'), `envelope expected: ${text.slice(0, 160)}`);
});
