/**
 * Slash-command i18n contract (P0/P1 of the i18n design):
 *  1) every builtin command carries `slash.<name>.desc` in BOTH catalogs
 *  2) localizedBuiltinSlashCommands() returns Chinese descriptions under zh-CN
 *     while command names + argumentHint stay technical English (typed verbatim)
 *  3) `{{app}}` in slash.quit.desc is substituted (no raw placeholder escapes)
 */

import { catalog, resetLocaleCache } from "@adwmc/helm-kernel/i18n";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUILTIN_SLASH_COMMANDS, localizedBuiltinSlashCommands } from "../src/core/slash-commands.ts";

describe("slash command i18n", () => {
	const saved = process.env.HELM_LOCALE;

	beforeAll(() => {
		process.env.HELM_LOCALE = "zh-CN";
		resetLocaleCache();
	});

	afterAll(() => {
		if (saved === undefined) delete process.env.HELM_LOCALE;
		else process.env.HELM_LOCALE = saved;
		resetLocaleCache();
	});

	it("every builtin command has slash.<name>.desc in both catalogs", () => {
		const en = catalog("en");
		const zh = catalog("zh-CN");
		expect(BUILTIN_SLASH_COMMANDS.length).toBeGreaterThanOrEqual(20);
		for (const command of BUILTIN_SLASH_COMMANDS) {
			expect(en[`slash.${command.name}.desc`], `en desc for /${command.name}`).toBeTruthy();
			expect(zh[`slash.${command.name}.desc`], `zh desc for /${command.name}`).toBeTruthy();
		}
	});

	it("localized list renders Chinese descriptions; names + argumentHint stay English", () => {
		const list = localizedBuiltinSlashCommands();
		expect(list).toHaveLength(BUILTIN_SLASH_COMMANDS.length);
		const settings = list.find((c) => c.name === "settings")!;
		expect(settings.description).toBe("打开设置菜单");
		const model = list.find((c) => c.name === "model")!;
		expect(model.argumentHint, "technical hint untouched").toBe("<provider/model>");
		const quit = list.find((c) => c.name === "quit")!;
		expect(quit.description).toContain("退出");
		expect(quit.description, "{{app}} substituted").not.toContain("{{app}}");
	});
});
