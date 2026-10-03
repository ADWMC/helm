import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shouldRunFirstTimeSetup } from "../src/cli/startup-ui.ts";
import { ENV_AGENT_DIR } from "../src/config.ts";
import { FirstTimeSetupComponent } from "../src/modes/interactive/components/first-time-setup.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

describe("shouldRunFirstTimeSetup", () => {
	const originalPiExperimental = process.env.PI_EXPERIMENTAL;
	const originalAgentDir = process.env[ENV_AGENT_DIR];
	let tempDir: string;
	let settingsPath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "pi-first-time-setup-"));
		settingsPath = join(tempDir, "settings.json");
		process.env.PI_EXPERIMENTAL = "1";
		delete process.env[ENV_AGENT_DIR];
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		if (originalPiExperimental === undefined) {
			delete process.env.PI_EXPERIMENTAL;
		} else {
			process.env.PI_EXPERIMENTAL = originalPiExperimental;
		}
		if (originalAgentDir === undefined) {
			delete process.env[ENV_AGENT_DIR];
		} else {
			process.env[ENV_AGENT_DIR] = originalAgentDir;
		}
	});

	it("returns true when experimental, default agent dir, and no settings.json", () => {
		expect(shouldRunFirstTimeSetup(settingsPath)).toBe(true);
	});

	it("returns false when experimental features are disabled", () => {
		delete process.env.PI_EXPERIMENTAL;

		expect(shouldRunFirstTimeSetup(settingsPath)).toBe(false);
	});

	it("returns false when a custom agent dir is set", () => {
		process.env[ENV_AGENT_DIR] = tempDir;

		expect(shouldRunFirstTimeSetup(settingsPath)).toBe(false);
	});

	it("returns false when settings.json already exists", () => {
		writeFileSync(settingsPath, "{}", "utf-8");

		expect(shouldRunFirstTimeSetup(settingsPath)).toBe(false);
	});
});

describe("first-time setup dialog", () => {
	beforeEach(() => {
		initTheme("dark");
	});

	function createSetup(theme: "dark" | "light" = "dark") {
		let submitted: { theme: string } | undefined;
		const component = new FirstTimeSetupComponent({
			detectedTheme: theme,
			onThemePreview: () => {},
			onSubmit: (result) => {
				submitted = result as { theme: string };
			},
			onCancel: () => {},
		});
		return { component, submitted: () => submitted };
	}

	it("asks only for a theme", () => {
		const { component } = createSetup();
		const text = JSON.stringify(component.render(80));

		expect(text).toContain("Pick a theme.");
		expect(text).not.toContain("analytics");
		expect(text).not.toContain("usage data");
	});

	it("submits the chosen theme", () => {
		const { component, submitted } = createSetup("light");

		component.handleInput("\n");

		expect(submitted()).toEqual({ theme: "light" });
	});
});
