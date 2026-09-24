import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type AnalysisMode = "lite" | "full" | "deep";

export interface McpServerConfig {
	/** Executable spawned for the server (no shell). */
	readonly command: string;
	readonly args?: readonly string[];
	/** Risk ladder: high tools require SOW approval at the bridge gate. */
	readonly risk?: "low" | "high";
}

export interface HelmPiConfig {
	readonly version: 1;
	readonly activationWord: string;
	readonly session: {
		readonly bootstrapAnchor: boolean;
		readonly persistEvidence: boolean;
		/** lite: few tool hops; full: standard; deep: full evidence chain */
		readonly analysisMode: AnalysisMode;
	};
	readonly run: {
		readonly enabled: boolean;
		readonly maxActiveSteps: number;
		readonly maxAttemptsPerStep: number;
	};
	readonly scope: {
		readonly enforce: boolean;
		readonly highRisk: "deny" | "hitl" | "allow";
	};
	readonly supervise: {
		readonly enabled: boolean;
		readonly sameToolLimit: number;
		readonly stepToolCap: number;
	};
	readonly console: {
		readonly enabled: boolean;
		readonly host: string;
		readonly port: number;
	};
	readonly memory: {
		readonly toolMemory: {
			readonly enabled: boolean;
			readonly injectOnPropose: boolean;
			readonly maxInject: number;
		};
	};
	/** Managed MCP backends (Wave 4) — reached only via host/mcp-bridge. */
	readonly mcp: {
		readonly servers: Readonly<Record<string, McpServerConfig>>;
	};
}

const DEFAULT_CONFIG_RAW = {
	version: 1,
	activationWord: "helmpi",
	session: {
		bootstrapAnchor: true,
		persistEvidence: true,
		analysisMode: "full" as const,
	},
	run: {
		enabled: true,
		maxActiveSteps: 1,
		maxAttemptsPerStep: 2,
	},
	scope: { enforce: true, highRisk: "deny" as const },
	supervise: { enabled: true, sameToolLimit: 5, stepToolCap: 100 },
	console: { enabled: false, host: "127.0.0.1", port: 7420 },
	memory: {
		toolMemory: { enabled: true, injectOnPropose: true, maxInject: 5 },
	},
	mcp: { servers: {} },
} as const satisfies HelmPiConfig;

export const DEFAULT_CONFIG: HelmPiConfig = Object.freeze(DEFAULT_CONFIG_RAW);

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

const KNOWN_TOP = new Set([
	"version",
	"activationWord",
	"session",
	"run",
	"scope",
	"supervise",
	"console",
	"memory",
	"mcp",
]);

export function parseConfig(raw: unknown): HelmPiConfig {
	if (!isPlainObject(raw)) throw new Error("helm-pi config must be an object");
	for (const k of Object.keys(raw)) {
		if (!KNOWN_TOP.has(k)) throw new Error(`Unknown helm-pi config key: ${k}`);
	}
	if (raw.version !== 1) throw new Error("helm-pi config version must be 1");
	// Shallow merge onto defaults with type checks on provided keys only.
	const cfg = structuredClone(DEFAULT_CONFIG) as {
		-readonly [K in keyof HelmPiConfig]: HelmPiConfig[K];
	};
	if (raw.activationWord !== undefined) {
		if (typeof raw.activationWord !== "string" || !raw.activationWord) {
			throw new Error("activationWord must be a non-empty string");
		}
		cfg.activationWord = raw.activationWord;
	}
	if (raw.session !== undefined) {
		if (!isPlainObject(raw.session)) throw new Error("session must be object");
		const s = raw.session as Partial<HelmPiConfig["session"]>;
		const mode = s.analysisMode;
		if (mode !== undefined && mode !== "lite" && mode !== "full" && mode !== "deep") {
			throw new Error("session.analysisMode must be lite|full|deep");
		}
		cfg.session = { ...cfg.session, ...s } as HelmPiConfig["session"];
		if (mode !== undefined) {
			cfg.session = { ...cfg.session, analysisMode: mode };
		}
	}
	if (raw.run !== undefined) {
		if (!isPlainObject(raw.run)) throw new Error("run must be object");
		cfg.run = { ...cfg.run, ...(raw.run as HelmPiConfig["run"]) };
	}
	if (raw.scope !== undefined) {
		if (!isPlainObject(raw.scope)) throw new Error("scope must be object");
		cfg.scope = { ...cfg.scope, ...(raw.scope as HelmPiConfig["scope"]) };
	}
	if (raw.supervise !== undefined) {
		if (!isPlainObject(raw.supervise)) throw new Error("supervise must be object");
		cfg.supervise = { ...cfg.supervise, ...(raw.supervise as HelmPiConfig["supervise"]) };
	}
	if (raw.console !== undefined) {
		if (!isPlainObject(raw.console)) throw new Error("console must be object");
		cfg.console = { ...cfg.console, ...(raw.console as HelmPiConfig["console"]) };
	}
	if (raw.memory !== undefined) {
		if (!isPlainObject(raw.memory)) throw new Error("memory must be object");
		const m = raw.memory as Partial<HelmPiConfig["memory"]>;
		cfg.memory = {
			toolMemory: {
				...cfg.memory.toolMemory,
				...(m.toolMemory ?? {}),
			},
		};
	}
	if (raw.mcp !== undefined) {
		if (!isPlainObject(raw.mcp)) throw new Error("mcp must be object");
		const servers = (raw.mcp as { servers?: unknown }).servers;
		if (servers !== undefined) {
			if (!isPlainObject(servers)) throw new Error("mcp.servers must be object");
			for (const [name, s] of Object.entries(servers)) {
				if (!isPlainObject(s)) throw new Error(`mcp.servers.${name} must be object`);
				const c = s as Record<string, unknown>;
				for (const k of Object.keys(c)) {
					if (!["command", "args", "risk"].includes(k)) {
						throw new Error(`Unknown mcp.servers.${name} key: ${k}`);
					}
				}
				if (typeof c.command !== "string" || !c.command) {
					throw new Error(`mcp.servers.${name}.command required`);
				}
				if (c.args !== undefined && !(Array.isArray(c.args) && c.args.every((a) => typeof a === "string"))) {
					throw new Error(`mcp.servers.${name}.args must be string[]`);
				}
				if (c.risk !== undefined && c.risk !== "low" && c.risk !== "high") {
					throw new Error(`mcp.servers.${name}.risk must be low|high`);
				}
			}
		}
		cfg.mcp = {
			servers: {
				...cfg.mcp.servers,
				...((servers ?? {}) as Record<string, McpServerConfig>),
			},
		};
	}
	return cfg;
}

export function configPaths(agentDir?: string): string[] {
	const home = agentDir ?? join(homedir(), ".pi", "agent");
	return [join(process.cwd(), ".pi", "helm-pi.json"), join(home, "helm-pi.json")];
}

export function loadConfig(agentDir?: string): HelmPiConfig {
	if (process.env.HELPI_CONFIG === "0") {
		// Not a disable of config load — emergency run stop is separate.
	}
	for (const p of configPaths(agentDir)) {
		if (existsSync(p)) {
			const text = readFileSync(p, "utf8");
			return parseConfig(JSON.parse(text));
		}
	}
	return DEFAULT_CONFIG;
}
