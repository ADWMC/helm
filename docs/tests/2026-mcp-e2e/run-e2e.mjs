// W4-T02 MCP bridge real e2e (WG4.2): kernel McpBridge <-> REAL OGhidra FastMCP
// stdio server (python3 bridge_mcp_ghidra.py). initialize + tools/list + tools/call
// = one genuine JSON-RPC roundtrip each. Ghidra HTTP backend (:8080) status is
// probed and reported; when down the tools/call still completes (error text from
// the real server) and the Ghidra-data gap is recorded as residual per §7.2.
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SUITE = dirname(fileURLToPath(import.meta.url));
const FORK = process.env.FORK_ROOT ?? "/mnt/c/Users/Administrator/Documents/GitHub/helm";
const BRIDGE_PY =
	process.env.OGHIDRA_BRIDGE ??
	"/mnt/c/Users/Administrator/Documents/GitHub/helm-pi/reference/repos/OGhidra/src/bridge_mcp_ghidra.py";

const { McpBridge, planMcpCall } = await import(
	pathToFileURL(join(FORK, "packages/helmpi-kernel/src/host/mcp-bridge.ts")).href
);

function ghidraHttpUp() {
	const r = spawnSync("curl", ["-s", "-m", "2", "-o", "/dev/null", "-w", "%{http_code}", "http://127.0.0.1:8080/methods"], {
		encoding: "utf8",
	});
	return r.stdout?.trim() === "200";
}

const report = {
	generatedAt: new Date().toISOString(),
	transport: "stdio (newline JSON-RPC 2.0, no MCP SDK — P10)",
	server: { command: "python3", script: "OGhidra/src/bridge_mcp_ghidra.py", transport: "stdio" },
	ghidraHttp: ghidraHttpUp() ? "up" : "down",
};

const bridge = new McpBridge({ command: "python3", args: [BRIDGE_PY], risk: "low" });
try {
	await bridge.connect(20000);
	report.initialize = "OK (real FastMCP handshake)";
	const tools = await bridge.listTools();
	report.toolsListed = tools.length;
	report.toolNames = tools.slice(0, 12).map((t) => t.id);
	report.domains = [...new Set(tools.map((t) => t.domain))];
	// genuine tools/call roundtrip (backend state reflected in result text)
	const call = await bridge.callTool("list_methods", { offset: 0, limit: 5 }, 20000);
	report.call = { tool: "list_methods", isError: call.isError, text: call.text.slice(0, 300) };
	report.roundtrip = tools.length > 0 ? "PASS (initialize + tools/list + tools/call completed)" : "TOOLS_EMPTY";
} catch (e) {
	report.roundtrip = "FAIL";
	report.error = String(e);
} finally {
	bridge.close();
}

// inline ScopeGate demo with a REAL spec (fail-closed semantics unchanged, §5.2)
const spec = { goal: "mcp e2e over authorized local target with measurable call counts", allowedTargets: ["http://127.0.0.1:18081*"], highRisk: "deny", maxTokens: 100000 };
report.scopeGate = {
	evil: planMcpCall(spec, { name: "run_ghidra_cmd", risk: "high" }, { target: "http://evil.example/" }),
	evilDeny: planMcpCall(spec, { name: "decompile_fn" }, { target: "http://evil.example/" }),
	insitu: planMcpCall(spec, { name: "decompile_fn" }, { target: "http://127.0.0.1:18081/notes" }),
};
report.residual =
	report.ghidraHttp === "down"
		? "Ghidra HTTP backend (:8080) down: OGhidraMCP plugin serves only inside an open Ghidra CodeBrowser (README:149); headless GUI-less data queries deferred — MCP-transport roundtrip itself is REAL (recorded per §7.2 残余风险显式续记)."
		: "full chain live";

mkdirSync(join(SUITE, "evidence"), { recursive: true });
writeFileSync(join(SUITE, "evidence", "e2e-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.roundtrip.startsWith("PASS") ? 0 : 2);
