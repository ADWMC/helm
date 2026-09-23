import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { colorToHex, type TUI } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsManager } from "../src/core/settings-manager.ts";
import {
	initTheme,
	loadThemeFromPath,
	setTerminalDefaultColors,
	type TerminalTheme,
	theme,
} from "../src/modes/interactive/theme/theme.ts";
import { InteractiveThemeController } from "../src/modes/interactive/theme/theme-controller.ts";

function createUi() {
	const queryTerminalBackgroundColor = vi.fn();
	const queryTerminalForegroundColor = vi.fn();
	const queryTerminalColorScheme = vi.fn();
	const setTerminalColorSchemeNotifications = vi.fn();
	let terminalColorSchemeListener: ((terminalTheme: TerminalTheme) => void) | undefined;
	const unsubscribeTerminalColorScheme = vi.fn();
	const ui = {
		invalidate: vi.fn(),
		requestRender: vi.fn(),
		setTerminalColorSchemeNotifications,
		onTerminalColorSchemeChange: vi.fn((listener: (terminalTheme: TerminalTheme) => void) => {
			terminalColorSchemeListener = listener;
			return unsubscribeTerminalColorScheme;
		}),
		queryTerminalBackgroundColor,
		queryTerminalForegroundColor,
		queryTerminalColorScheme,
	} as unknown as TUI;
	return {
		ui,
		queryTerminalBackgroundColor,
		queryTerminalForegroundColor,
		queryTerminalColorScheme,
		setTerminalColorSchemeNotifications,
		unsubscribeTerminalColorScheme,
		emitTerminalColorScheme: (terminalTheme: TerminalTheme) => terminalColorSchemeListener?.(terminalTheme),
	};
}

function createController(ui: TUI, getSettingsManager: () => SettingsManager, initialThemeSetting?: string) {
	return new InteractiveThemeController(ui, {
		getSettingsManager,
		showError: vi.fn(),
		onChanged: vi.fn(),
		initialThemeSetting,
	});
}

afterEach(() => {
	initTheme("dark");
	setTerminalDefaultColors({});
	vi.unstubAllEnvs();
});

describe("InteractiveThemeController", () => {
	it("uses the initial theme without persisting it", async () => {
		const { ui, queryTerminalBackgroundColor } = createUi();
		const manager = SettingsManager.inMemory({ theme: "dark" });
		const setTheme = vi.spyOn(manager, "setTheme");
		const flush = vi.spyOn(manager, "flush");
		const controller = createController(ui, () => manager, "light");

		expect(theme.name).toBe("light");
		expect(controller.getThemeSelection()).toBe("light");
		await controller.applyFromSettings();

		expect(theme.name).toBe("light");
		expect(queryTerminalBackgroundColor).toHaveBeenCalledOnce();
		expect(setTheme).not.toHaveBeenCalled();
		expect(flush).not.toHaveBeenCalled();
	});

	it("resolves a theme pair and follows terminal appearance changes", async () => {
		vi.stubEnv("COLORFGBG", "15;0");
		const { ui, queryTerminalColorScheme, setTerminalColorSchemeNotifications, emitTerminalColorScheme } = createUi();
		queryTerminalColorScheme.mockResolvedValue("light");
		const manager = SettingsManager.inMemory({ theme: "dark/light" });
		const controller = createController(ui, () => manager, "light/dark");

		expect(theme.name).toBe("dark");
		await controller.applyFromSettings();
		expect(theme.name).toBe("light");
		expect(setTerminalColorSchemeNotifications).toHaveBeenCalledWith(true);

		emitTerminalColorScheme("dark");
		expect(theme.name).toBe("dark");
	});

	it("applies the terminal default colors and reuses the background reply for detection", async () => {
		vi.stubEnv("COLORFGBG", "");
		const { ui, queryTerminalBackgroundColor, queryTerminalForegroundColor } = createUi();
		queryTerminalForegroundColor.mockResolvedValue({ r: 20, g: 20, b: 20 });
		queryTerminalBackgroundColor.mockResolvedValue({ r: 250, g: 250, b: 250 });
		const controller = createController(ui, () => SettingsManager.inMemory());

		await controller.applyFromSettings();
		await vi.waitFor(() => expect(ui.requestRender).toHaveBeenCalled());

		expect(theme.name).toBe("light");
		expect(queryTerminalBackgroundColor).toHaveBeenCalledOnce();
		expect(queryTerminalForegroundColor).toHaveBeenCalledOnce();
		expect(ui.invalidate).toHaveBeenCalled();
	});

	it("keeps reported default colors when a later query times out", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-theme-controller-"));
		try {
			const themeJson = JSON.parse(
				readFileSync(new URL("../src/modes/interactive/theme/dark.json", import.meta.url), "utf8"),
			) as { name: string; colors: Record<string, string | number> };
			themeJson.name = "terminal-defaults";
			themeJson.colors.text = "";
			const themePath = join(dir, "terminal-defaults.json");
			writeFileSync(themePath, JSON.stringify(themeJson));
			const loaded = loadThemeFromPath(themePath, "truecolor");

			const { ui, queryTerminalForegroundColor, queryTerminalBackgroundColor } = createUi();
			queryTerminalForegroundColor.mockResolvedValue({ r: 200, g: 210, b: 220 });
			queryTerminalBackgroundColor.mockResolvedValue({ r: 10, g: 20, b: 30 });
			const controller = createController(ui, () => SettingsManager.inMemory({ theme: "dark" }));
			await controller.applyFromSettings();
			await vi.waitFor(() => expect(ui.requestRender).toHaveBeenCalledTimes(1));
			expect(colorToHex(loaded.colors.text)).toBe("#c8d2dc");

			// A second query (e.g. after a settings change) times out for both colors.
			queryTerminalForegroundColor.mockResolvedValue(undefined);
			queryTerminalBackgroundColor.mockResolvedValue(undefined);
			await controller.applyFromSettings();
			await vi.waitFor(() => expect(ui.requestRender).toHaveBeenCalledTimes(2));
			expect(colorToHex(loaded.colors.text)).toBe("#c8d2dc");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("disables terminal appearance updates when disposed", async () => {
		const { ui, queryTerminalColorScheme, setTerminalColorSchemeNotifications, unsubscribeTerminalColorScheme } =
			createUi();
		queryTerminalColorScheme.mockResolvedValue("light");
		const manager = SettingsManager.inMemory({ theme: "light/dark" });
		const controller = createController(ui, () => manager);
		await controller.applyFromSettings();

		controller.dispose();

		expect(setTerminalColorSchemeNotifications).toHaveBeenLastCalledWith(false);
		expect(unsubscribeTerminalColorScheme).toHaveBeenCalledOnce();
	});

	it("detects the current terminal appearance when selecting a theme pair", async () => {
		vi.stubEnv("COLORFGBG", "");
		const { ui, queryTerminalColorScheme } = createUi();
		queryTerminalColorScheme.mockResolvedValue("light");
		const manager = SettingsManager.inMemory({ theme: "dark" });
		const controller = createController(ui, () => manager);

		expect(theme.name).toBe("dark");
		await controller.setThemeSetting("light/dark");
		expect(theme.name).toBe("light");
		expect(queryTerminalColorScheme).toHaveBeenCalledOnce();
	});

	it("lets an explicit selection replace the initial theme", async () => {
		const { ui } = createUi();
		const firstManager = SettingsManager.inMemory({ theme: "dark" });
		const secondManager = SettingsManager.inMemory({ theme: "light" });
		let manager = firstManager;
		const controller = createController(ui, () => manager, "light");
		await controller.applyFromSettings();

		expect(controller.setThemeName("dark")).toEqual({ success: true });
		manager = secondManager;
		await controller.applyFromSettings();

		expect(controller.getThemeSelection()).toBe("dark");
		expect(theme.name).toBe("dark");
	});

	it("reloads theme settings when no initial theme was supplied", async () => {
		const { ui } = createUi();
		const firstManager = SettingsManager.inMemory({ theme: "dark" });
		const secondManager = SettingsManager.inMemory({ theme: "light" });
		let manager = firstManager;
		const controller = createController(ui, () => manager);
		await controller.applyFromSettings();

		firstManager.applyOverrides({ theme: "light" });
		await controller.applyFromSettings();
		expect(theme.name).toBe("light");

		secondManager.applyOverrides({ theme: "dark" });
		manager = secondManager;
		await controller.applyFromSettings();
		expect(theme.name).toBe("dark");
	});
});
