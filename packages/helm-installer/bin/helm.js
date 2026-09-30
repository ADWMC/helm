#!/usr/bin/env node
/**
 * `helm` thin-shell launcher (mimocode @mimo-ai/cli pattern): resolve the
 * payload installed by postinstall.mjs or the one-line installer and exec it
 * with the original argv. HELM_BIN_PATH overrides the payload location for
 * development and for pointing at a side-loaded binary.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolvePayloadPath } from "../lib/payload.mjs";

const exe = resolvePayloadPath();
if (!existsSync(exe)) {
	console.error(`helm: payload not found at ${exe}`);
	console.error("helm: install it with:  npm i -g @adwmc/helm-installer   (postinstall downloads the payload)");
	console.error("helm: or use the one-line installer (see the repository install/ README)");
	process.exit(1);
}
const result = spawnSync(exe, process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
	console.error(`helm: failed to start payload: ${result.error.message}`);
	process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
