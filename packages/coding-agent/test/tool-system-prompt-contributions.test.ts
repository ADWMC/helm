import { describe, expect, test } from "vitest";
import { bashToolSystemPromptContribution, createBashToolDefinition } from "../src/core/tools/bash.ts";
import { createEditToolDefinition, editToolSystemPromptContribution } from "../src/core/tools/edit.ts";
import { createFindToolDefinition, findToolSystemPromptContribution } from "../src/core/tools/find.ts";
import { createGrepToolDefinition, grepToolSystemPromptContribution } from "../src/core/tools/grep.ts";
import { createLsToolDefinition, lsToolSystemPromptContribution } from "../src/core/tools/ls.ts";
import {
	createPowerShellToolDefinition,
	powershellToolSystemPromptContribution,
} from "../src/core/tools/powershell.ts";
import { createReadToolDefinition, readToolSystemPromptContribution } from "../src/core/tools/read.ts";
import { createWriteToolDefinition, writeToolSystemPromptContribution } from "../src/core/tools/write.ts";

const cases = [
	["read", readToolSystemPromptContribution, createReadToolDefinition],
	["bash", bashToolSystemPromptContribution, createBashToolDefinition],
	["powershell", powershellToolSystemPromptContribution, createPowerShellToolDefinition],
	["edit", editToolSystemPromptContribution, createEditToolDefinition],
	["write", writeToolSystemPromptContribution, createWriteToolDefinition],
	["grep", grepToolSystemPromptContribution, createGrepToolDefinition],
	["find", findToolSystemPromptContribution, createFindToolDefinition],
	["ls", lsToolSystemPromptContribution, createLsToolDefinition],
] as const;

describe("built-in tool system prompt contributions", () => {
	test.each(cases)(
		"keeps the %s tool definition aligned with its contribution",
		(_name, contribution, createDefinition) => {
			const definition = createDefinition("/workspace");

			expect(definition.promptSnippet).toBe(contribution.snippet);
			const expected = [
				...("guidelines" in contribution ? (contribution.guidelines ?? []) : []),
				...("sessionEnvironmentGuidelines" in contribution
					? (contribution.sessionEnvironmentGuidelines ?? [])
					: []),
			];
			expect(definition.promptGuidelines ?? []).toEqual(expected);
		},
	);

	// Turning off PI_* injection must not strip the shell's own syntax rules.
	// That coupling is what left the model writing bash against PowerShell.
	test.each([
		["bash", createBashToolDefinition],
		["powershell", createPowerShellToolDefinition],
	] as const)("keeps %s syntax guidance when session environment is hidden", (_name, createDefinition) => {
		const shown = createDefinition("/workspace");
		const hidden = createDefinition("/workspace", { exposeSessionEnvironment: false });

		const shownLines = shown.promptGuidelines ?? [];
		const hiddenLines = hidden.promptGuidelines ?? [];

		// The PI_* guideline is the only one dropped.
		const withoutSession = shownLines.filter((g) => !g.includes("PI_*"));
		expect(hiddenLines).toEqual(withoutSession);
		// And everything that is not the PI_* guideline survives.
		expect(hiddenLines.length).toBe(shownLines.length - 1);
	});

	test("powershell keeps its syntax rules when session environment is hidden", () => {
		const hidden = createPowerShellToolDefinition("/workspace", { exposeSessionEnvironment: false });
		const lines = hidden.promptGuidelines ?? [];

		// These are the rules that stop bash syntax reaching a pwsh host.
		expect(lines.some((g) => g.includes("$ErrorActionPreference"))).toBe(true);
		expect(lines.some((g) => g.includes("-LiteralPath"))).toBe(true);
		expect(lines.some((g) => g.includes("$LASTEXITCODE"))).toBe(true);
		expect(lines.some((g) => g.includes("PI_*"))).toBe(false);
	});
});
