/**
 * `task` tool — subagent executor (W2-T03, §4.1 G3).
 *
 * Design basis: oh-my-pi task four-piece (评分#1, README.md:163-171):
 *   isolated worker + typed JSON yield + bounded lifetime + kill/reclaim.
 * MVP ships spawn/status/kill smoke (§4.1 G3 assertion); steering/revive and
 * per-worker tool surfaces extend this envelope in W3+ without schema breaks
 * (the `v:1` envelope is the contract).
 *
 * Bundle-proof: the worker source is embedded as a plain-JS string, so the
 * host bundle can spawn it without shipping a separate .ts file.
 * G3 lite self-gate: HELPI_ANALYSIS_MODE=lite rejects spawn (工具表断言 twin).
 */

import { type ChildProcess, spawn } from "node:child_process";
import type { AgentTool } from "@adwmc/helm-agent-core";
import { Type } from "typebox";

export interface TaskEnvelope {
	v: 1;
	id: string;
	kind: "started" | "progress" | "done";
	data?: Record<string, unknown>;
}

/** Child: prints typed yields, waits until killed (subagent lifetime). */
export const TASK_WORKER_SOURCE = `
const job = JSON.parse(process.argv[1] || "{}");
const send = (kind, data) => process.stdout.write(JSON.stringify({ v: 1, id: job.id, kind, data }) + "\\n");
send("started", { pid: process.pid, cwd: process.cwd(), prompt: String(job.prompt ?? "").slice(0, 200) });
let alive = true;
process.on("SIGTERM", () => { send("done", { reason: "killed" }); process.exit(0); });
process.on("SIGINT", () => { send("done", { reason: "killed" }); process.exit(0); });
setTimeout(() => { if (alive) send("done", { reason: "timeout" }); process.exit(0); }, Number(job.timeoutMs || 30000));
setInterval(() => send("progress", { beat: Date.now() }), 5000);
`;

interface Running {
	readonly id: string;
	readonly child: ChildProcess;
	readonly yields: TaskEnvelope[];
	readonly startedAt: number;
}

export function createTaskTool(cwd: string): AgentTool<any> {
	const running = new Map<string, Running>();
	let seq = 0;

	return {
		name: "task",
		label: "Subagent task",
		description:
			"Spawn/inspect/kill an isolated subagent worker (typed JSON yields, bounded lifetime). MVP envelope v:1 — spawn/status/kill; steering extends later.",
		parameters: Type.Object({
			action: Type.Union([Type.Literal("spawn"), Type.Literal("status"), Type.Literal("kill")]),
			prompt: Type.Optional(Type.String({ description: "task brief for the subagent" })),
			id: Type.Optional(Type.String({ description: "task id (status/kill)" })),
			timeoutMs: Type.Optional(Type.Number({ description: "bounded lifetime, default 30000" })),
		}),
		async execute(
			toolCallId: string,
			rawParams: unknown,
		): Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }> {
			void toolCallId;
			const params = rawParams as { action: string; prompt?: string; id?: string; timeoutMs?: number };
			const text = (
				s: string,
			): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> } => ({
				content: [{ type: "text" as const, text: s }],
				details: {},
			});

			// G3: lite tier has no subagents (tool-surface twin assertion lives in kernel GATED_TOOLS).
			if (process.env.HELPI_ANALYSIS_MODE === "lite" && params.action === "spawn") {
				return text("task spawn rejected: lite mode (G3 gating)");
			}

			if (params.action === "spawn") {
				const id = `task-${++seq}-${Date.now().toString(36)}`;
				const job = JSON.stringify({ id, prompt: params.prompt ?? "", timeoutMs: params.timeoutMs ?? 30_000 });
				const child = spawn(process.execPath, ["-e", TASK_WORKER_SOURCE, job], {
					cwd,
					stdio: ["ignore", "pipe", "pipe"],
					env: process.env,
				});
				const entry: Running = { id, child, yields: [], startedAt: Date.now() };
				running.set(id, entry);
				child.stdout?.on("data", (buf: Buffer) => {
					for (const line of buf.toString("utf8").split("\n")) {
						if (!line.trim()) continue;
						try {
							entry.yields.push(JSON.parse(line) as TaskEnvelope);
						} catch {
							/* non-envelope chatter ignored (typed yield contract) */
						}
					}
				});
				// bounded reclaim: reap on natural exit too
				child.on("exit", () => {
					running.delete(id);
				});
				await new Promise<void>((resolve) => {
					const to = setTimeout(resolve, 1500);
					entry.child.once("spawn", () => {
						clearTimeout(to);
						resolve();
					});
				});
				return text(JSON.stringify({ id, pid: entry.child.pid, running: true }));
			}

			const entry = params.id ? running.get(params.id) : undefined;
			if (params.action === "status") {
				if (!entry) return text(JSON.stringify({ error: "unknown task id", running: [...running.keys()] }));
				return text(
					JSON.stringify({
						id: entry.id,
						pid: entry.child.pid,
						alive: entry.child.exitCode === null,
						elapsedMs: Date.now() - entry.startedAt,
						yields: entry.yields,
					}),
				);
			}

			if (params.action === "kill") {
				if (!entry) return text(JSON.stringify({ error: "unknown task id" }));
				entry.child.kill("SIGTERM");
				await new Promise<void>((resolve) => {
					const to = setTimeout(resolve, 2000);
					entry.child.once("exit", () => {
						clearTimeout(to);
						resolve();
					});
				});
				const reclaimed = entry.child.exitCode !== null || !running.has(entry.id);
				running.delete(entry.id);
				return text(JSON.stringify({ id: entry.id, reclaimed }));
			}

			return text(JSON.stringify({ error: "unknown action" }));
		},
	};
}

/** Definition-only view for the host factory (createToolDefinition switch). */
export function createTaskToolDefinition(): {
	name: string;
	label: string;
	description: string;
	parameters: unknown;
} {
	const tool = createTaskTool(process.cwd());
	const { execute: _execute, ...def } = tool;
	void _execute;
	return def as { name: string; label: string; description: string; parameters: unknown };
}
