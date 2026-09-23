import assert from "node:assert";
import { describe, it } from "node:test";
import {
	backgroundAnsi,
	colorToRgb,
	foregroundAnsi,
	indexedColor,
	mixColors,
	oklchColor,
	parseColor,
	rgbColor,
	styleText,
	styleTextWithAnsi,
} from "../src/index.ts";

describe("colors", () => {
	it("parses hex and OKLCH colors", () => {
		assert.deepStrictEqual(parseColor("#123456"), { kind: "rgb", r: 18, g: 52, b: 86 });
		assert.deepStrictEqual(parseColor("#abc"), { kind: "rgb", r: 170, g: 187, b: 204 });
		assert.deepStrictEqual(parseColor("oklch(62% 0.1 200)"), { kind: "oklch", l: 0.62, c: 0.1, h: 200 });
	});

	it("rejects values that are not concrete colors", () => {
		assert.throws(() => parseColor(""), /Invalid color value/);
		assert.throws(() => parseColor("red"), /Invalid color value/);
	});

	it("converts OKLCH to sRGB with gamut mapping", () => {
		const red = colorToRgb(oklchColor(0.627955, 0.257683, 29.2339));
		assert.ok(red.r >= 254);
		assert.ok(red.g <= 1);
		assert.ok(red.b <= 1);
	});

	it("mixes colors in OKLCH", () => {
		const mixed = mixColors(rgbColor(255, 0, 0), rgbColor(0, 0, 255), 0.5);
		assert.strictEqual(mixed.kind, "oklch");
		assert.ok(mixed.l > 0 && mixed.l < 1);
	});

	it("serializes colors for terminal color modes", () => {
		assert.strictEqual(foregroundAnsi(rgbColor(18, 52, 86), "truecolor"), "\x1b[38;2;18;52;86m");
		assert.match(foregroundAnsi(rgbColor(18, 52, 86), "256color"), /^\x1b\[38;5;\d+m$/);
		assert.strictEqual(backgroundAnsi(indexedColor(9), "truecolor"), "\x1b[48;5;9m");
	});

	it("applies a complete text style", () => {
		assert.strictEqual(
			styleText("Ready", { fg: rgbColor(18, 52, 86), bg: indexedColor(9), bold: true }, "truecolor"),
			"\x1b[38;2;18;52;86m\x1b[48;5;9m\x1b[1mReady\x1b[22m\x1b[49m\x1b[39m",
		);
	});

	it("closes attributes in reverse order", () => {
		assert.strictEqual(
			styleTextWithAnsi("Ready", undefined, undefined, { bold: true, italic: true, strikethrough: true }),
			"\x1b[1m\x1b[3m\x1b[9mReady\x1b[29m\x1b[23m\x1b[22m",
		);
		assert.strictEqual(
			styleTextWithAnsi("Ready", "\x1b[39m", "\x1b[48;5;9m", { bold: true }),
			"\x1b[39m\x1b[48;5;9m\x1b[1mReady\x1b[22m\x1b[49m\x1b[39m",
		);
	});

	it("gamut-maps OKLCH colors at the lightness limits to achromatic colors", () => {
		assert.deepStrictEqual(colorToRgb(oklchColor(1, 0.3, 150)), { r: 255, g: 255, b: 255 });
		assert.deepStrictEqual(colorToRgb(oklchColor(0, 0.3, 150)), { r: 0, g: 0, b: 0 });
	});
});
