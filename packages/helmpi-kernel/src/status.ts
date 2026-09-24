import { loadConfig } from "./config.ts";
import { openToolMemory } from "./memory/tool-memory.ts";

export function statusText(config = loadConfig()): string {
	const mode = config.session.analysisMode;
	const hop =
		mode === "lite"
			? "lite: prefer direct work; skip skill_index/multi read_reference unless asked"
			: mode === "deep"
				? "deep: full evidence chain + findings"
				: "full: route≤1 + index≤1 + refs≤2";
	let tm = "n/a";
	try {
		if (config.memory?.toolMemory?.enabled !== false) {
			tm = String(openToolMemory().all().length);
		} else {
			tm = "off";
		}
	} catch {
		tm = "error";
	}
	return [
		"helm-pi status",
		`activation: ${config.activationWord}`,
		`analysisMode: ${mode} (${hop})`,
		`run.enabled: ${config.run.enabled}`,
		`scope.enforce: ${config.scope.enforce} highRisk=${config.scope.highRisk}`,
		`supervise: ${config.supervise.enabled}`,
		`toolMemory: ${tm} entries (diagnostic only)`,
		`breach: wash+refusal+stream`,
		`HELPI_RUN=${process.env.HELPI_RUN ?? "unset"}`,
	].join("\n");
}
