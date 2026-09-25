/**
 * 沙箱执行器 (W3-T02, §3.6.1/§3.6.2 W3 行) — A/B 选型结果见 docs/tests/2026-fork-gates/sandbox-ab-selection.md.
 *
 * Chosen: A (Docker ephemeral container) — B (in-process loopback bridge,
 * oh-my-pi README.md:135) provides NO isolation (kernel calls agent tools in
 * the same process), so it cannot pass the escape-negatives criterion at all.
 *
 * Enforcement at THIS layer:
 *   host path deny — only the workdir is mounted (/workspace); no other host
 *                    path is visible inside the container.
 *   network       — `--network none`: egress denied at the container netns
 *                    (defense-in-depth beside G2's host-side allow-list, which
 *                    stays the positive lane).
 *   bounded       — pids/memory/time limits; daemon absent → fail-closed
 *                    (sandbox_unavailable, never a silent host fallback).
 * Machine surface = frozen English (WG1.7).
 */

import { spawnSync } from "node:child_process";
import type { AgentTool } from "@adwmc/helm-agent-core";
import { Type } from "typebox";

export interface SandboxResult {
	readonly ok: boolean;
	readonly exitCode?: number;
	readonly stdout?: string;
	readonly stderr?: string;
	readonly error?: string;
	readonly elapsedMs?: number;
}

const IMAGE = process.env.HELM_SANDBOX_IMAGE ?? "alpine:3.20";

export function dockerAvailable(): boolean {
	const r = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8", timeout: 8000 });
	return r.status === 0;
}

export function runInSandbox(opts: {
	workdir: string;
	command: string;
	timeoutMs?: number;
	image?: string;
}): SandboxResult {
	if (!dockerAvailable()) {
		return { ok: false, error: "sandbox_unavailable: docker daemon not reachable (fail-closed, no host fallback)" };
	}
	const started = Date.now();
	const r = spawnSync(
		"docker",
		[
			"run",
			"--rm",
			"--network",
			"none",
			"--pids-limit",
			"64",
			"--memory",
			"512m",
			"--read-only",
			"--tmpfs",
			"/tmp:rw,noexec,nosuid,size=64m",
			"-v",
			`${opts.workdir}:/workspace:rw`,
			"-w",
			"/workspace",
			opts.image ?? IMAGE,
			"sh",
			"-c",
			opts.command,
		],
		{ encoding: "utf8", timeout: opts.timeoutMs ?? 30_000 },
	);
	return {
		ok: r.status === 0,
		exitCode: r.status ?? -1,
		stdout: r.stdout ?? "",
		stderr: r.stderr ?? "",
		elapsedMs: Date.now() - started,
		...(r.error ? { error: String(r.error) } : {}),
	};
}

export function createSandboxTool(cwd: string): AgentTool<any> {
	return {
		name: "sandbox",
		label: "Isolated sandbox",
		description:
			"Run a shell command inside an ephemeral container: workdir-only mount (host path deny), --network none, bounded resources. Fails closed when the daemon is unavailable.",
		parameters: Type.Object({
			command: Type.String({ description: "shell command to run in the sandbox" }),
			timeoutMs: Type.Optional(Type.Number()),
		}),
		async execute(
			_toolCallId: string,
			rawParams: unknown,
		): Promise<{
			content: Array<{ type: "text"; text: string }>;
			details: Record<string, unknown>;
		}> {
			const params = rawParams as { command: string; timeoutMs?: number };
			const res = runInSandbox({
				workdir: cwd,
				command: params.command,
				...(params.timeoutMs ? { timeoutMs: params.timeoutMs } : {}),
			});
			return {
				content: [{ type: "text" as const, text: JSON.stringify(res) }],
				details: {},
			};
		},
	};
}
