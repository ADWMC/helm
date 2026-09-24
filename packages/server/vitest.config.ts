import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * Exact matches for bare specifiers, plus one rule per package for subpath exports such as
 * `@adwmc/helm-ai/utils/uuid`. A prefix alias would rewrite those onto `index.ts/utils/uuid`.
 */
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		reporters: process.env.GITHUB_ACTIONS ? ["dot", "github-actions"] : ["dot"],
	},
	resolve: {
		conditions: ["source"],
		alias: [
			{ find: /^@adwmc\/helm-agent-core$/, replacement: src("../agent/src/index.ts") },
			{ find: /^@adwmc\/helm-agent-core\/(.+)$/, replacement: `${src("../agent/src/")}$1.ts` },
			{ find: /^@adwmc\/helm-ai$/, replacement: src("../ai/src/index.ts") },
			{ find: /^@adwmc\/helm-ai\/(.+)$/, replacement: `${src("../ai/src/")}$1.ts` },
			{ find: /^@adwmc\/helm-telemetry$/, replacement: src("../telemetry/src/index.ts") },
			{ find: /^@adwmc\/helm-protocol$/, replacement: src("../protocol/src/index.ts") },
		],
	},
	ssr: { resolve: { conditions: ["source"] } },
});
