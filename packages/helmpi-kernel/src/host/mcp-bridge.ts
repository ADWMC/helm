/**
 * Managed MCP bridge — PLAN §2 Wave 4.
 *
 * Path is fixed: model → ToolSpec → ScopeGate → bridge → MCP server.
 * - The core imports NO MCP SDK (P10): raw newline-delimited JSON-RPC 2.0
 *   over stdio, which is MCP's stdio transport.
 * - Every call is scope-gated BEFORE it leaves this process (P5/I13–I14).
 * - `risk: "high"` tools require explicit approval (SOW high-risk ladder).
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import type { McpServerConfig } from "../config.ts";
import { validateScopeQuery } from "../domain/scope.ts";
import type { Spec } from "../domain/types.ts";

export interface McpToolDef {
	readonly name: string;
	readonly description?: string;
	readonly inputSchema?: unknown;
}

export interface ToolSpec {
	readonly id: string;
	readonly title: string;
	readonly domain: string;
	readonly risk: "low" | "high";
	readonly source: string;
}

/**
 * Keyword seed classifier (hexstrike-ai six-group catalog, README:83-89).
 * Heuristic by design — tools keep their server-declared schemas.
 */
export function domainForMcpTool(name: string): string {
	const n = name.toLowerCase();
	if (/(nmap|masscan|port|dns|whois|traceroute|icmp)/.test(n)) return "network";
	if (/(http|url|sqli|xss|fuzz|crawl|dirb|web|api)/.test(n)) return "web";
	if (/(binary|disasm|decomp|radare|ghidra|rop|elf|pe)/.test(n)) return "binary";
	if (/(aws|azure|gcp|cloud|s3|bucket|k8s)/.test(n)) return "cloud";
	if (/(exploit|payload|shell|revshell|msf|cve)/.test(n)) return "exploit";
	if (/(file|read|write|exec|command|process)/.test(n)) return "system";
	return "misc";
}

export type McpCallPlan =
	| { readonly allow: true; readonly tool: string }
	| {
			readonly allow: false;
			readonly tool: string;
			readonly matchedBy: string;
			readonly reason: string;
			readonly offender?: string;
	  };

/** Strings in args that look like engagement targets (URL or host[:port]). */
function targetLike(value: string): string | null {
	const v = value.trim();
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
	if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(v)) return v.split("/")[0]!;
	if (/^[a-z0-9.-]+(:\d+)?$/i.test(v) && v.includes(".")) return v; // fqdn
	return null;
}

/**
 * ScopeGate in front of every MCP call (Wave 4 acceptance):
 * - each target-like string arg must pass validateScopeQuery (fail-closed);
 * - high-risk tools need explicit approval (SOW ladder);
 * - no target-like args (e.g. stats) → pass scope, still risk-checked.
 */
export function planMcpCall(
	spec: Spec,
	tool: { readonly name: string; readonly risk?: "low" | "high" },
	args: Readonly<Record<string, unknown>>,
	opts: { readonly approvedHighRisk?: boolean } = {},
): McpCallPlan {
	if ((tool.risk ?? "low") === "high" && opts.approvedHighRisk !== true) {
		return {
			allow: false,
			tool: tool.name,
			matchedBy: "approval_required",
			reason: `high_risk_mcp:${tool.name} — needs SOW high-risk approval`,
		};
	}
	for (const v of Object.values(args)) {
		if (typeof v !== "string") continue;
		const target = targetLike(v);
		if (!target) continue;
		const d = validateScopeQuery(spec, target);
		if (!d.allow) {
			return {
				allow: false,
				tool: tool.name,
				matchedBy: d.matchedBy,
				reason: d.reason,
				offender: target,
			};
		}
	}
	return { allow: true, tool: tool.name };
}

export interface McpCallResult {
	readonly text: string;
	readonly isError: boolean;
}

interface Pending {
	resolve: (v: unknown) => void;
	reject: (e: Error) => void;
	timer: NodeJS.Timeout;
}

/** Newline-delimited JSON-RPC 2.0 client over child stdio (MCP stdio transport). */
export class McpBridge {
	private child: ChildProcessWithoutNullStreams | null = null;
	private nextId = 1;
	private pending = new Map<number, Pending>();
	private buffer = "";
	private toolSpecs: ToolSpec[] = [];
	private readonly server: McpServerConfig;

	constructor(server: McpServerConfig) {
		this.server = server;
	}

	async connect(timeoutMs = 10000): Promise<void> {
		this.child = spawn(this.server.command, [...(this.server.args ?? [])], {
			stdio: ["pipe", "pipe", "pipe"],
			shell: false,
		});
		this.child.stdout.setEncoding("utf8");
		this.child.stdout.on("data", (chunk: string) => this.onData(chunk));
		this.child.stderr.resume(); // drained, never fed to the model
		await this.request(
			"initialize",
			{
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "helm-pi", version: "0.1.0" },
			},
			timeoutMs,
		);
		this.notify("notifications/initialized", {});
	}

	private onData(chunk: string): void {
		this.buffer += chunk;
		for (let idx = this.buffer.indexOf("\n"); idx >= 0; idx = this.buffer.indexOf("\n")) {
			const line = this.buffer.slice(0, idx).trim();
			this.buffer = this.buffer.slice(idx + 1);
			if (!line) continue;
			let msg: { id?: number; result?: unknown; error?: { message?: string } };
			try {
				msg = JSON.parse(line);
			} catch {
				continue;
			}
			if (typeof msg.id !== "number") continue; // notification from server
			const p = this.pending.get(msg.id);
			if (!p) continue;
			this.pending.delete(msg.id);
			clearTimeout(p.timer);
			if (msg.error) p.reject(new Error(msg.error.message ?? "mcp error"));
			else p.resolve(msg.result);
		}
	}

	private send(msg: Record<string, unknown>): void {
		this.child?.stdin.write(`${JSON.stringify(msg)}\n`);
	}

	private notify(method: string, params: unknown): void {
		this.send({ jsonrpc: "2.0", method, params });
	}

	private request(method: string, params: unknown, timeoutMs = 10000): Promise<unknown> {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`mcp timeout: ${method}`));
			}, timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			this.send({ jsonrpc: "2.0", id, method, params });
		});
	}

	async listTools(): Promise<ToolSpec[]> {
		const res = (await this.request("tools/list", {})) as { tools?: McpToolDef[] };
		const risk = this.server.risk ?? "low";
		this.toolSpecs = (res.tools ?? []).map((t) => ({
			id: t.name,
			title: t.description ?? t.name,
			domain: domainForMcpTool(t.name),
			risk,
			source: this.server.command,
		}));
		return this.toolSpecs;
	}

	specs(): readonly ToolSpec[] {
		return this.toolSpecs;
	}

	/** Raw call — callers MUST have run planMcpCall first (gate is not here: P2). */
	async callTool(name: string, args: Readonly<Record<string, unknown>>, timeoutMs = 30000): Promise<McpCallResult> {
		const res = (await this.request("tools/call", { name, arguments: { ...args } }, timeoutMs)) as {
			content?: { type: string; text?: string }[];
			isError?: boolean;
		};
		const text = (res.content ?? [])
			.filter((c) => c.type === "text" && typeof c.text === "string")
			.map((c) => c.text)
			.join("\n");
		return { text, isError: res.isError === true };
	}

	close(): void {
		for (const [, p] of this.pending) {
			clearTimeout(p.timer);
			p.reject(new Error("bridge closed"));
		}
		this.pending.clear();
		this.child?.stdin.end();
		this.child?.kill();
		this.child = null;
	}
}
