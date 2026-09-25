import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripBom } from "../../utils/text.ts";

export interface ExternalEditorOptions {
	command: string;
	content: string;
}

export type ExternalEditorResult = { status: "complete"; content: string } | { status: "failed" };

/**
 * Split an editor commandline into argv: quoted segments stay one token, and
 * on Windows an UNQUOTED leading executable path with spaces (`C:\Program
 * Files\...`) is healed by greedily merging tokens while the prefix exists as
 * a file — same bug class as the upstream smoke failure (§8.1), which split
 * at the first space and spawned `C:\Program`.
 */
function splitCommandLine(command: string): string[] {
	const tokens: string[] = [];
	for (const m of command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
		tokens.push(m[1] ?? m[2] ?? m[3] ?? "");
	}
	if (process.platform === "win32") {
		for (let merge = 1; merge <= 4 && merge < tokens.length; merge++) {
			const candidate = tokens.slice(0, merge + 1).join(" ");
			if (existsSync(candidate)) return [candidate, ...tokens.slice(merge + 1)];
		}
	}
	return tokens;
}

export async function editInExternalEditor(options: ExternalEditorOptions): Promise<ExternalEditorResult> {
	const directory = mkdtempSync(join(tmpdir(), "helm-editor-"));
	const filePath = join(directory, "prompt.md");
	try {
		writeFileSync(filePath, options.content, "utf-8");
		const [editor, ...editorArgs] = splitCommandLine(options.command);
		process.stdout.write(`Launching external editor: ${options.command}\nhelm will resume when the editor exits.\n`);
		// Windows shell:true splits unquoted paths — `C:\Program Files\...` would break
		// at the space (same class as the upstream smoke bug, §8.1). Quote spaced argv
		// pieces that are not already quoted; POSIX spawn runs raw (no shell) — untouched.
		const quoteWin = (s: string): string =>
			process.platform === "win32" && /\s/.test(s) && !/^".*"$/.test(s) ? `"${s}"` : s;

		// Do not use spawnSync here. On Windows, synchronous child_process calls can keep
		// Node/libuv's console input read active after the parent pauses stdin, racing
		// vim/nvim for the console input buffer until Ctrl+C cancels the pending read.
		const exitCode = await new Promise<number | null>((resolve) => {
			const child = spawn(quoteWin(editor), [...editorArgs, filePath].map(quoteWin), {
				stdio: "inherit",
				shell: process.platform === "win32",
			});
			child.on("error", () => resolve(null));
			child.on("close", (code) => resolve(code));
		});

		if (exitCode !== 0) {
			return { status: "failed" };
		}

		return { status: "complete", content: stripBom(readFileSync(filePath, "utf-8")).replace(/\n$/, "") };
	} finally {
		try {
			rmSync(directory, { recursive: true, force: true });
		} catch {
			// Cleanup is best effort.
		}
	}
}
