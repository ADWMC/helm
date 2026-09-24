import { defineConfig } from "vitest/config";

// Bare legacy builtin specifiers (no node: prefix) appear somewhere in the ported
// test dependency chains; map every node builtin so vite SSR externalizes them.
const NODE_BUILTINS = [
	"async_hooks", "assert", "buffer", "child_process", "cluster", "console", "constants", "crypto",
	"dgram", "diagnostics_channel", "dns", "domain", "events", "fs", "http", "http2", "https",
	"inspector", "module", "net", "os", "path", "perf_hooks", "process", "punycode", "querystring",
	"readline", "repl", "stream", "string_decoder", "timers", "tls", "tty", "url", "util", "v8",
	"vm", "worker_threads", "zlib",
];

// SoL-Pi ported efficiency tests (W1-T04) run under vitest; everything else in
// this package runs under node:test (see package.json "test").
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/efficiency/sol-pi/tests/**/*.test.ts"],
	},
	resolve: {
		alias: NODE_BUILTINS.map((n) => ({ find: new RegExp(`^${n}(/.*)?$`), replacement: `node:${n}$1` })),
	},
	ssr: { resolve: { conditions: ["source"] } },
});