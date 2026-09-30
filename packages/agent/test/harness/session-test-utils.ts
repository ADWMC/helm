import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { BACKGROUND_CONTEXT } from "../../src/harness/context.ts";
import { sessionDirectoryName } from "../../src/harness/session/jsonl/repo.ts";
import type { FileSystem } from "../../src/harness/types.ts";
import { getOrThrow } from "../../src/harness/types.ts";

const tempDirs: string[] = [];

export function createTempDir(): string {
	const dir = join(tmpdir(), `pi-agent-session-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	tempDirs.push(dir);
	return dir;
}

/**
 * The session cwd a fixture should use, resolved through the same file system the repo
 * resolves it with. Hardcoding a POSIX path makes hand-written fixtures and
 * `repo.list({ cwd })` disagree on Windows, where `absolutePath("/workspace")` is a drive
 * path; deriving it keeps both sides on one value on every platform.
 */
export async function resolveSessionCwd(fileSystem: FileSystem, desired = "/workspace"): Promise<string> {
	return getOrThrow(await fileSystem.absolutePath(desired, BACKGROUND_CONTEXT));
}

/** Directory name for a resolved session cwd — the repo's own encoding, not a copy. */
export function sessionDirName(cwd: string): string {
	return sessionDirectoryName(cwd);
}

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop()!;
		if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
	}
});
