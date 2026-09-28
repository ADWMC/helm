import { getPowerShellConfig } from "../../utils/shell.ts";
import {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	type createBashTool,
	createLocalShellOperations,
	createShellToolDefinition,
	type ShellToolConfig,
} from "./bash.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const UTF8_OUTPUT_PREFIX = "try { [Console]::OutputEncoding=[System.Text.Encoding]::UTF8 } catch {}\n";

export const powershellToolSystemPromptContribution = {
	snippet: "Execute PowerShell commands",
	guidelines: [
		"You can inspect PI_* environment variables for current model and session details.",
		// The shell runs as `pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass
		// -Command` (see shell.ts POWERSHELL_ARGS). Profile aliases and functions are
		// therefore absent, and every rule below is measured against that invocation.
		"PowerShell is not bash. Write PowerShell syntax: backtick escapes characters (not backslash), single quotes do not interpolate while double quotes do, and cmdlets return objects where their Unix namesakes return text.",
		"Errors do NOT stop the script: $ErrorActionPreference defaults to 'Continue', so a failed cmdlet reports an error and the next statement still runs. To stop on first error set $ErrorActionPreference = 'Stop' at the top, or join steps with `&&` on PowerShell 7+. A command that finished is not evidence that every step inside it succeeded.",
		"Native commands (git, node, npm, curl.exe) do not throw on failure; they set $LASTEXITCODE. Check it explicitly when the exit status matters, for example `git status; $LASTEXITCODE`.",
		"Quote literal paths and arguments with single quotes so nothing is interpolated or expanded; double-quoted strings interpolate `$var`. A literal single quote inside a single-quoted string is written twice ('it''s').",
		"On Windows `curl` resolves to curl.exe, not the Invoke-WebRequest alias, so Unix-style flags such as -sL and -o behave as written.",
		"Prefer the dedicated tools when you only need to look at files: read, grep and glob over Get-Content, Select-String and Get-ChildItem. Reach for this tool when you actually need to run something.",
	],
} as const;

export type PowerShellOperations = BashOperations;
export type PowerShellSpawnContext = BashSpawnContext;
export type PowerShellSpawnHook = BashSpawnHook;
export type PowerShellToolDetails = BashToolDetails;
export type PowerShellToolInput = BashToolInput;

export interface PowerShellToolOptions
	extends Pick<BashToolOptions, "operations" | "exposeSessionEnvironment" | "spawnHook"> {}

export function createLocalPowerShellOperations(): PowerShellOperations {
	const operations = createLocalShellOperations("PowerShell", getPowerShellConfig);
	return {
		exec: (command, cwd, options) => operations.exec(`${UTF8_OUTPUT_PREFIX}${command}`, cwd, options),
	};
}

const powershellToolConfig: ShellToolConfig = {
	name: "powershell",
	label: "powershell",
	shellName: "PowerShell",
	prompt: "PS>",
	promptSnippet: powershellToolSystemPromptContribution.snippet,
	promptGuidelines: powershellToolSystemPromptContribution.guidelines,
	tempFilePrefix: "pi-powershell",
};

export function createPowerShellToolDefinition(
	cwd: string,
	options?: PowerShellToolOptions,
): ReturnType<typeof createShellToolDefinition> {
	return createShellToolDefinition(cwd, powershellToolConfig, {
		...options,
		operations: options?.operations ?? createLocalPowerShellOperations(),
	});
}

export function createPowerShellTool(cwd: string, options?: PowerShellToolOptions): ReturnType<typeof createBashTool> {
	const definition = createPowerShellToolDefinition(cwd, options);
	const tool = wrapToolDefinition(definition);
	Object.assign(tool, {
		promptSnippet: definition.promptSnippet,
		promptGuidelines: definition.promptGuidelines,
	});
	return tool;
}
