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
	// Language and behavior rules. Not gated by exposeSessionEnvironment: these
	// must reach the model whether or not PI_* variables are injected.
	guidelines: [
		// Measured against `pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass
		// -Command` (shell.ts POWERSHELL_ARGS). Profile aliases and functions are
		// absent under -NoProfile, so nothing below assumes a user profile.
		"PowerShell is not bash. Backtick escapes characters (not backslash); single quotes are literal while double quotes interpolate; cmdlets return objects where their Unix namesakes return text. `&&` and `||` are version-sensitive: they work on PowerShell 7 but not on Windows PowerShell 5.1, so prefer `;` plus an explicit check when the host version is unknown.",
		"Errors do NOT stop the script: $ErrorActionPreference defaults to 'Continue', so a failing cmdlet reports an error and the next statement still runs. To stop on first error set $ErrorActionPreference = 'Stop' at the top. A command that finished is not evidence that every step inside it succeeded — check the output, not just the absence of a thrown exception.",
		"Native commands (git, node, npm, curl.exe) do not throw on failure; they set $LASTEXITCODE. Read it explicitly when the exit status matters, for example `git status; $LASTEXITCODE`.",
		"Use -LiteralPath for exact local paths. Plain path parameters treat [ ] and * as wildcards, so a directory named with brackets or a path built from user text silently resolves to something else. Verify with `Test-Path -LiteralPath` before relying on a path.",
		"Quote literal paths and arguments with single quotes so nothing is interpolated or expanded; double-quoted strings interpolate $var. Write a literal single quote inside a single-quoted string twice ('it''s').",
		"A foreach statement cannot be piped directly. `foreach ($x in $items) { ... } | Format-Table` fails with 'An empty pipe element is not allowed'. Assign to a variable first, then pipe the variable.",
		"On Windows `curl` resolves to curl.exe, not the Invoke-WebRequest alias, so Unix-style flags such as -sL and -o behave as written. Confirm an external tool exists with `Get-Command <name>` before depending on it.",
		"Non-ASCII output from a child process (Python, Node) can arrive as mojibake even though this tool sets [Console]::OutputEncoding to UTF-8: that affects PowerShell's own output, not the child's locale. For Python set PYTHONIOENCODING=utf-8 and PYTHONUTF8=1 in the same command.",
		"When a path may contain spaces, prefer Join-Path and quote the result. A bare unquoted path with spaces is split into several arguments.",
		"Prefer the dedicated tools when you only need to look at files: read, grep and glob over Get-Content, Select-String and Get-ChildItem. Reach for this tool when you actually need to run something.",
	],
	sessionEnvironmentGuidelines: ["You can inspect PI_* environment variables for current model and session details."],
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
	sessionEnvironmentGuidelines: powershellToolSystemPromptContribution.sessionEnvironmentGuidelines,
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
