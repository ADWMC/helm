import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const telemetrySrcIndex = fileURLToPath(new URL("../telemetry/src/index.ts", import.meta.url));
const aiSrcIndex = fileURLToPath(new URL("../ai/src/index.ts", import.meta.url));
const aiSrcCompat = fileURLToPath(new URL("../ai/src/compat.ts", import.meta.url));

export default defineConfig({
	test: {
		environment: "node",
		benchmark: {
			include: ["benchmark/session/**/*.bench.ts"],
			reporters: ["verbose"],
		},
	},
	resolve: {
		alias: [
			{ find: /^@adwmc\/helm-telemetry$/, replacement: telemetrySrcIndex },
			{ find: /^@adwmc\/helm-ai$/, replacement: aiSrcIndex },
			{ find: /^@adwmc\/helm-ai\/compat$/, replacement: aiSrcCompat },
		],
	},
});
