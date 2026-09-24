/**
 * Minimal host extension surface we depend on (P10).
 * Pi/OMP adapters satisfy this; domain never imports host SDKs.
 */

export interface HostToolParamSchema {
	readonly type: "string" | "number" | "boolean" | "array" | "object";
	readonly description?: string;
	readonly required?: boolean;
	readonly items?: { type: "string" };
}

export interface HostToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly parameters: Record<string, HostToolParamSchema>;
	execute(args: Record<string, unknown>, exec?: unknown): Promise<string> | string;
}

export interface HostExtensionAPI {
	on(event: string, handler: (...args: unknown[]) => unknown): void;
	registerTool?(tool: HostToolDefinition): void;
	registerCommand?(cmd: { name: string; description?: string; handler: (args: string) => unknown }): void;
	setLabel?(label: string): void;
	/** Optional: intercept user text for activation (adapter-dependent). */
	ui?: { notify?: (msg: string, level?: string) => void };
}
