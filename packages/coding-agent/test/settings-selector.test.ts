import { resetLocaleCache } from "@adwmc/helm-kernel/i18n";
import { setKeybindings } from "@adwmc/helm-tui";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import {
	type SettingsCallbacks,
	type SettingsConfig,
	SettingsSelectorComponent,
} from "../src/modes/interactive/components/settings-selector.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";
import { createHarness, type Harness } from "./suite/harness.ts";

describe("SettingsSelectorComponent", () => {
	let harness: Harness | undefined;
	const savedLocale = process.env.HELM_LOCALE;
	beforeAll(() => {
		initTheme("dark");
		setKeybindings(new KeybindingsManager());
		// labels are localized now — pin English for deterministic label assertions
		process.env.HELM_LOCALE = "en";
		resetLocaleCache();
	});

	afterAll(() => {
		if (savedLocale === undefined) delete process.env.HELM_LOCALE;
		else process.env.HELM_LOCALE = savedLocale;
		resetLocaleCache();
	});

	afterEach(() => {
		harness?.cleanup();
		harness = undefined;
	});

	it("cycles through fullscreen settings", () => {
		const onExitOutputChange = vi.fn();
		const onScrollbarChange = vi.fn();
		const onCopyOnSelectChange = vi.fn();
		const config = {
			fullscreenExitOutput: "transcript",
			fullscreenScrollbar: "auto",
			fullscreenCopyOnSelect: true,
			warnings: {},
			defaultModel: "not set",
			availableDefaultModels: [],
			availableThinkingLevels: [],
			modelThinkingLevels: {},
			availableThemes: [],
		} as unknown as SettingsConfig;
		const callbacks = {
			onFullscreenExitOutputChange: onExitOutputChange,
			onFullscreenScrollbarChange: onScrollbarChange,
			onFullscreenCopyOnSelectChange: onCopyOnSelectChange,
		} as unknown as SettingsCallbacks;

		const cycle = (label: string, count: number) => {
			const list = new SettingsSelectorComponent(config, callbacks).getSettingsList();
			for (const character of label) list.handleInput(character);
			for (let i = 0; i < count; i++) list.handleInput("\r");
		};

		cycle("Fullscreen exit output", 2);
		expect(onExitOutputChange.mock.calls.flat()).toEqual(["resume-hint", "transcript"]);
		cycle("Fullscreen scrollbar", 3);
		expect(onScrollbarChange.mock.calls.flat()).toEqual(["always", "hidden", "auto"]);
		cycle("Fullscreen copy on select", 2);
		expect(onCopyOnSelectChange.mock.calls.flat()).toEqual([false, true]);
	});

	it("keeps the configured fixed theme marked while browsing", () => {
		const config = {
			defaultModel: "not set",
			availableDefaultModels: [],
			modelThinkingLevels: {},
			currentTheme: "dark",
			terminalTheme: "dark",
			availableThemes: ["dark", "light"],
			warnings: {},
		} as unknown as SettingsConfig;
		const callbacks = { onThemePreview: vi.fn(), onCancel: () => {} } as unknown as SettingsCallbacks;
		const list = new SettingsSelectorComponent(config, callbacks).getSettingsList();

		list.selectItem("theme");
		list.handleInput("\r");
		let output = stripAnsi(list.render(120).join("\n"));
		expect(output).toContain("    Automatic");
		expect(output).toContain("→ ✓ dark");

		list.handleInput("\x1b[B");
		output = stripAnsi(list.render(120).join("\n"));
		expect(output).toContain("  ✓ dark");
		expect(output).toContain("→   light");
	});

	it("keeps a configured automatic theme marked while browsing", () => {
		const config = {
			defaultModel: "not set",
			availableDefaultModels: [],
			modelThinkingLevels: {},
			currentTheme: "light/dark",
			terminalTheme: "dark",
			availableThemes: ["dark", "light", "other"],
			warnings: {},
		} as unknown as SettingsConfig;
		const callbacks = { onThemePreview: vi.fn(), onCancel: () => {} } as unknown as SettingsCallbacks;
		const list = new SettingsSelectorComponent(config, callbacks).getSettingsList();

		list.selectItem("theme");
		list.handleInput("\r");
		list.handleInput("\r");
		let output = stripAnsi(list.render(120).join("\n"));
		expect(output).toContain("→ ✓ light");

		list.handleInput("\x1b[B");
		output = stripAnsi(list.render(120).join("\n"));
		expect(output).toContain("  ✓ light");
		expect(output).toContain("→   other");
	});

	it("keeps the configured per-model thinking level marked while browsing", async () => {
		harness = await createHarness({
			models: [{ id: "thinking-model", reasoning: true }],
		});
		const model = harness.getModel("thinking-model")!;
		const modelKey = `${model.provider}/${model.id}`;
		const config = {
			defaultModel: modelKey,
			availableDefaultModels: [model],
			thinkingLevel: "high",
			modelThinkingLevels: { [modelKey]: "medium" },
		} as unknown as SettingsConfig;
		const callbacks = { onCancel: () => {} } as unknown as SettingsCallbacks;
		const list = new SettingsSelectorComponent(config, callbacks).getSettingsList();

		list.selectItem("model-thinking");
		list.handleInput("\r");
		list.handleInput("\r");

		let output = stripAnsi(list.render(120).join("\n"));
		expect(output).toContain("→ ✓ medium");
		expect(output).toContain("    (clear override)");

		list.handleInput("\x1b[B");
		output = stripAnsi(list.render(120).join("\n"));
		expect(output).toContain("  ✓ medium");
		expect(output).toContain("→   high");
	});

	it("offers the Language row and reports locale changes (/settings TUI)", () => {
		const onLocaleChange = vi.fn();
		const config = {
			locale: "auto",
			defaultModel: "not set",
			availableDefaultModels: [],
			modelThinkingLevels: {},
			availableThemes: [],
			warnings: {},
		} as unknown as SettingsConfig;
		const callbacks = { onLocaleChange, onCancel: () => {} } as unknown as SettingsCallbacks;
		const list = new SettingsSelectorComponent(config, callbacks).getSettingsList();

		const output = stripAnsi(list.render(120).join("\n"));
		expect(output).toContain("Language / 语言");

		list.selectItem("language");
		list.handleInput("\r"); // Auto → English
		expect(onLocaleChange.mock.calls.flat()).toEqual(["en"]);
		list.handleInput("\r"); // English → 中文（简体）
		expect(onLocaleChange.mock.calls.flat()).toEqual(["en", "zh-CN"]);
	});

	it("offers helm rows (efficiency ×4 + budget watcher) and reports their toggles", () => {
		const onDefenseChange = vi.fn();
		const onEfficiencyChange = vi.fn();
		const config = {
			locale: "auto",
			defense: { watcher: false },
			efficiency: {
				actionFusion: true,
				observationPack: true,
				evidencePreservingReducer: true,
				onlineContextCompact: true,
			},
			defaultModel: "not set",
			availableDefaultModels: [],
			modelThinkingLevels: {},
			availableThemes: [],
			warnings: {},
		} as unknown as SettingsConfig;
		const callbacks = { onDefenseChange, onEfficiencyChange, onCancel: () => {} } as unknown as SettingsCallbacks;
		// the list caps visible rows — locate via search (same pattern as the cycle tests)
		const searchCycle = (label: string, times: number) => {
			const list = new SettingsSelectorComponent(config, callbacks).getSettingsList();
			const visible = stripAnsi(list.render(200).join("\n"));
			for (const character of label) list.handleInput(character);
			expect(stripAnsi(list.render(200).join("\n"))).toContain(label);
			for (let i = 0; i < times; i++) list.handleInput("\r");
			return visible;
		};
		void searchCycle("Budget watcher (G4)", 1);
		expect(onDefenseChange.mock.calls.flat()).toEqual([{ watcher: true }]);
		void searchCycle("Efficiency: action fusion", 1);
		expect(onEfficiencyChange.mock.calls.flat()).toEqual([{ actionFusion: false }]);
		// both rows exist in the unfiltered list too (first page renders Language row)
		const firstPage = stripAnsi(
			new SettingsSelectorComponent(config, callbacks).getSettingsList().render(200).join("\n"),
		);
		expect(firstPage).toContain("Language / 语言");
	});

	it("renders the panel in Chinese under HELM_LOCALE=zh-CN (WG1.7 human-facing)", () => {
		const config = {
			locale: "zh-CN",
			defense: { watcher: false },
			efficiency: {
				actionFusion: true,
				observationPack: true,
				evidencePreservingReducer: true,
				onlineContextCompact: true,
			},
			defaultModel: "not set",
			availableDefaultModels: [],
			modelThinkingLevels: {},
			availableThemes: [],
			warnings: {},
		} as unknown as SettingsConfig;
		const callbacks = { onCancel: () => {} } as unknown as SettingsCallbacks;
		const prev = process.env.HELM_LOCALE;
		process.env.HELM_LOCALE = "zh-CN";
		resetLocaleCache();
		try {
			const freshList = () => new SettingsSelectorComponent(config, callbacks).getSettingsList();
			// search locates rows regardless of first-page visibility
			const list1 = freshList();
			for (const character of "自动压缩") list1.handleInput(character);
			expect(stripAnsi(list1.render(200).join("\n")), "row label localized (autocompact)").toContain("自动压缩");
			const list2 = freshList();
			for (const character of "预算监视器") list2.handleInput(character);
			const filtered = stripAnsi(list2.render(200).join("\n"));
			expect(filtered).toContain("预算监视器（G4）");
			expect(filtered, "description localized").toContain("结构性巡检");
		} finally {
			if (prev === undefined) delete process.env.HELM_LOCALE;
			else process.env.HELM_LOCALE = prev;
			resetLocaleCache();
		}
	});
});
