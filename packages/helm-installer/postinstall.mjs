/**
 * npm postinstall: fetch the platform payload matching this package's version
 * (release lockstep — payload v == installer v). Failures warn and exit 0 so
 * that air-gapped or script-disabled environments still get the shell; the
 * `helm` launcher prints the repair instructions when the payload is missing.
 */

import { readFileSync } from "node:fs";
import { installPayload } from "./lib/payload.mjs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

try {
	const result = await installPayload({ version: pkg.version, env: process.env });
	if (result.dryRun === true) {
		console.log(`[helm-installer] dry run: would install ${result.asset} from ${result.assetUrl} into ${result.destDir}`);
	} else {
		console.log(`[helm-installer] payload v${result.version} (${result.asset}, sha256 ${result.sha256.slice(0, 12)}...) -> ${result.exePath}`);
	}
} catch (error) {
	console.warn(`[helm-installer] payload download skipped: ${error instanceof Error ? error.message : String(error)}`);
	console.warn("[helm-installer] the 'helm' command needs the payload; rerun postinstall or use the one-line installer in install/");
	process.exitCode = 0;
}
