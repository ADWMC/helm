import assert from "node:assert/strict";
import { test } from "node:test";
import type { Spec } from "./domain/types.ts";
import { domainForMcpTool, McpBridge, planMcpCall } from "./host/mcp-bridge.ts";

const spec: Spec = {
	goal: "bridge scope probe",
	// I13 discipline: path-bearing targets need an explicit glob rule —
	// a bare origin entry would byte-match only the origin itself.
	allowedTargets: ["http://127.0.0.1:18081*", "https://example.com"],
	highRisk: "deny",
};

/** Fake MCP server: newline JSON-RPC over stdio, no SDK (same transport as real). */
const FAKE_SERVER = `
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\\n");
  if (msg.method === "initialize") return reply({ protocolVersion: "2024-11-05", serverInfo: { name: "fake", version: "0" } });
  if (msg.method === "tools/list") return reply({ tools: [
    { name: "nmap_scan", description: "network scan", inputSchema: { type: "object" } },
    { name: "http_fuzz", description: "web fuzz", inputSchema: { type: "object" } },
    { name: "ai_generate_payload", description: "payload gen", inputSchema: { type: "object" } }
  ]});
  if (msg.method === "tools/call") {
    return reply({ content: [{ type: "text", text: "22/tcp open\\n" + JSON.stringify(msg.params.arguments) }], isError: false });
  }
  if (typeof msg.id === "number") return reply({});
});
`;

test("mcp bridge: connect + listTools classifies six-group domains", async () => {
	const bridge = new McpBridge({ command: process.execPath, args: ["-e", FAKE_SERVER] });
	try {
		await bridge.connect();
		const specs = await bridge.listTools();
		assert.equal(specs.length, 3);
		const byId = new Map(specs.map((s) => [s.id, s]));
		assert.equal(byId.get("nmap_scan")?.domain, "network");
		assert.equal(byId.get("http_fuzz")?.domain, "web");
		assert.equal(byId.get("ai_generate_payload")?.domain, "exploit");
		// raw call round-trip (gate lives outside callTool — P2)
		const r = await bridge.callTool("nmap_scan", { target: "127.0.0.1" });
		assert.match(r.text, /22\/tcp open/);
		assert.equal(r.isError, false);
	} finally {
		bridge.close();
	}
});

test("mcp scope gate: in-scope URL passes, out-of-scope denied before dispatch", () => {
	const ok = planMcpCall(spec, { name: "http_get" }, { url: "http://127.0.0.1:18081/login" });
	assert.equal(ok.allow, true);

	const ext = planMcpCall(spec, { name: "http_get" }, { url: "https://example.com" });
	assert.equal(ext.allow, false);
	if (!ext.allow) {
		assert.equal(ext.matchedBy, "fail_closed");
		assert.equal(ext.offender, "https://example.com");
	}

	const notListed = planMcpCall(spec, { name: "nmap_scan" }, { target: "192.168.77.1" });
	assert.equal(notListed.allow, false);

	// no target-like args (stats) → scope passes
	const stats = planMcpCall(spec, { name: "stats" }, { since: "1h" });
	assert.equal(stats.allow, true);
});

test("mcp risk ladder: high-risk tool needs explicit approval", () => {
	const denied = planMcpCall(spec, { name: "ai_generate_payload", risk: "high" }, { rce: "x" });
	assert.equal(denied.allow, false);
	if (!denied.allow) assert.equal(denied.matchedBy, "approval_required");
	const approved = planMcpCall(
		spec,
		{ name: "ai_generate_payload", risk: "high" },
		{ rce: "x" },
		{ approvedHighRisk: true },
	);
	assert.equal(approved.allow, true);
});

test("domainForMcpTool keyword seed covers hexstrike groups", () => {
	assert.equal(domainForMcpTool("masscan_scan"), "network");
	assert.equal(domainForMcpTool("sqli_inject"), "web");
	assert.equal(domainForMcpTool("aws_enum"), "cloud");
	assert.equal(domainForMcpTool("elf_disasm"), "binary");
	assert.equal(domainForMcpTool("delete_file"), "system");
	assert.equal(domainForMcpTool("unknown_thing"), "misc");
});
