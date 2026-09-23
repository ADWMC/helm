import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { colorToHex, mixColors, resetCapabilitiesCache, setCapabilities, styleText } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it } from "vitest";
import {
	initTheme,
	loadThemeFromPath,
	setTerminalDefaultColors,
	type ThemeToken,
	theme,
} from "../src/modes/interactive/theme/theme.ts";

const tempDirs: string[] = [];

type ThemeFile = { name: string; appearance?: "dark" | "light"; colors: Record<string, string | number> };

/** Write a copy of a built-in theme, modified by `edit`, and return its path. */
function writeTheme(base: "dark" | "light", edit: (theme: ThemeFile) => void): string {
	const themeJson = JSON.parse(
		readFileSync(new URL(`../src/modes/interactive/theme/${base}.json`, import.meta.url), "utf8"),
	) as ThemeFile;
	edit(themeJson);
	const dir = mkdtempSync(join(tmpdir(), "pi-theme-style-"));
	tempDirs.push(dir);
	const path = join(dir, `${themeJson.name}.json`);
	writeFileSync(path, JSON.stringify(themeJson));
	return path;
}

afterEach(() => {
	resetCapabilitiesCache();
	setTerminalDefaultColors({});
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("theme styles", () => {
	it("accepts theme tokens and concrete colors", () => {
		setCapabilities({ images: null, trueColor: true, hyperlinks: false });
		initTheme("dark");

		expect(theme.style("Ready", { fg: "toolSuccessBg" })).toBe(
			theme.style("Ready", { fg: theme.colors.toolSuccessBg }),
		);
		expect(theme.style("Ready", { fg: "success", bg: "toolSuccessBg", bold: true })).toContain("Ready");
	});

	it("renders theme tokens the same as the generic text styler", () => {
		for (const mode of ["truecolor", "256color"] as const) {
			const loaded = loadThemeFromPath(
				new URL("../src/modes/interactive/theme/dark.json", import.meta.url).pathname,
				mode,
			);
			const expected = styleText(
				"Ready",
				{ fg: loaded.colors.success, bg: loaded.colors.toolSuccessBg, bold: true, italic: true },
				mode,
			);
			expect(loaded.style("Ready", { fg: "success", bg: "toolSuccessBg", bold: true, italic: true })).toBe(expected);
			expect(loaded.style("Ready", { bg: "success" })).toBe(styleText("Ready", { bg: loaded.colors.success }, mode));
		}
	});

	it("rejects unknown style tokens", () => {
		const loaded = loadThemeFromPath(
			new URL("../src/modes/interactive/theme/dark.json", import.meta.url).pathname,
			"truecolor",
		);
		const unknownToken = "notAToken" as unknown as ThemeToken;
		expect(() => loaded.style("Ready", { fg: unknownToken })).toThrow("Unknown theme color: notAToken");
		expect(() => loaded.style("Ready", { bg: unknownToken })).toThrow("Unknown theme color: notAToken");
	});

	it("keeps the legacy foreground and background helpers", () => {
		setCapabilities({ images: null, trueColor: true, hyperlinks: false });
		initTheme("dark");

		expect(theme.fg("success", "Ready")).toBe(`${theme.getFgAnsi("success")}Ready\x1b[39m`);
		expect(theme.bg("toolSuccessBg", "Ready")).toBe(`${theme.getBgAnsi("toolSuccessBg")}Ready\x1b[49m`);
	});

	it("loads OKLCH theme values", () => {
		const path = writeTheme("dark", (themeJson) => {
			themeJson.name = "oklch-theme";
			themeJson.colors.accent = "oklch(62% 0.1 200)";
		});

		const loaded = loadThemeFromPath(path, "truecolor");
		expect(loaded.colors.accent).toEqual({ kind: "oklch", l: 0.62, c: 0.1, h: 200 });
		expect(loaded.style("Accent", { fg: "accent" })).toMatch(/^\x1b\[38;2;\d+;\d+;\d+mAccent\x1b\[39m$/);
	});

	it("detects the appearance from the theme colors unless it is declared", () => {
		const builtin = (name: string) =>
			loadThemeFromPath(
				new URL(`../src/modes/interactive/theme/${name}.json`, import.meta.url).pathname,
				"truecolor",
			);
		expect(builtin("dark").appearance).toBe("dark");
		expect(builtin("light").appearance).toBe("light");

		const declared = writeTheme("dark", (themeJson) => {
			themeJson.name = "declared-light";
			themeJson.appearance = "light";
		});
		expect(loadThemeFromPath(declared, "truecolor").appearance).toBe("light");
	});

	it("uses the terminal background for the appearance of palette-only themes", () => {
		// Palette colors 0-15 follow the terminal palette, so they cannot tell dark from light.
		const path = writeTheme("dark", (themeJson) => {
			themeJson.name = "palette-only";
			for (const key of Object.keys(themeJson.colors)) themeJson.colors[key] = key.endsWith("Bg") ? 0 : 7;
		});
		const loaded = loadThemeFromPath(path, "truecolor");

		expect(loaded.appearance).toBe("dark");
		setTerminalDefaultColors({ background: { r: 250, g: 250, b: 250 } });
		expect(loaded.appearance).toBe("light");
	});

	it("keeps terminal default escapes for empty tokens and exposes concrete colors for them", () => {
		const path = writeTheme("dark", (themeJson) => {
			themeJson.name = "terminal-defaults";
			themeJson.colors.text = "";
			themeJson.colors.userMessageBg = "";
		});
		const loaded = loadThemeFromPath(path, "truecolor");

		expect(loaded.fg("text", "Ready")).toBe("\x1b[39mReady\x1b[39m");
		expect(loaded.bg("userMessageBg", "Ready")).toBe("\x1b[49mReady\x1b[49m");
		// Without terminal replies, the colors are guessed from the appearance.
		expect(colorToHex(loaded.colors.text)).toBe("#e5e5e7");
		expect(colorToHex(loaded.colors.userMessageBg)).toBe("#000000");
		expect(() => mixColors(loaded.colors.text, loaded.colors.accent, 0.5)).not.toThrow();

		setTerminalDefaultColors({ foreground: { r: 200, g: 210, b: 220 }, background: { r: 10, g: 20, b: 30 } });
		expect(colorToHex(loaded.colors.text)).toBe("#c8d2dc");
		expect(colorToHex(loaded.colors.userMessageBg)).toBe("#0a141e");
		expect(loaded.fg("text", "Ready")).toBe("\x1b[39mReady\x1b[39m");
	});
});
