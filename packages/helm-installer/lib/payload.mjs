/**
 * helm payload installer — shared logic for the npm thin shell and its tests.
 *
 * The payload is the platform binary archive produced by
 * scripts/build-binaries.sh and published by the tag-triggered Build Binaries
 * workflow: `helm-<platform>.tar.gz` (unix, wrapper dir `helm/`) or
 * `helm-<platform>.zip` (windows, flat), plus a `SHA256SUMS` asset. The archive
 * carries the compiled executable `helm`/`helm.exe` plus its runtime siblings
 * (package.json, theme/, assets/, native prebuilds, wasm); the installer copies
 * the whole set into the install dir and renames the command to
 * `helm`/`helm.exe`. The payload's `skills/*.md` are copied into the user-level
 * skills dir (<agentDir>/skills) where the host discovers them.
 *
 * Every network step is injectable so tests run fully offline.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const DEFAULT_REPO = "ADWMC/helm";
export const DEFAULT_RELEASE_BASE = "https://github.com/ADWMC/helm/releases/download";

/** Map the runtime to the release asset naming used by build-binaries.sh. */
export function platformAsset(platform, arch) {
	const plat = platform === "win32" ? "windows" : platform;
	if (plat !== "darwin" && plat !== "linux" && plat !== "windows") {
		throw new Error(`unsupported platform: ${platform}`);
	}
	if (arch !== "x64" && arch !== "arm64") throw new Error(`unsupported arch: ${arch}`);
	const assetPlatform = `${plat}-${arch}`;
	return { platform: assetPlatform, file: `helm-${assetPlatform}.${plat === "windows" ? "zip" : "tar.gz"}` };
}

/**
 * Install dir: HELM_INSTALL_DIR or <home>/.helm/bin — the payload lives inside
 * the project's existing ~/.helm state dir (state files at the root, bin/ for
 * the executable tree, like ~/.cargo/bin).
 */
export function resolveInstallDir(env = process.env, home = homedir()) {
	return env.HELM_INSTALL_DIR ? resolve(env.HELM_INSTALL_DIR) : join(home, ".helm", "bin");
}

/** Payload executable: HELM_BIN_PATH override or <installDir>/helm[.exe]. */
export function resolvePayloadPath(env = process.env, home = homedir()) {
	if (env.HELM_BIN_PATH) return env.HELM_BIN_PATH;
	const exe = process.platform === "win32" ? "helm.exe" : "helm";
	return join(resolveInstallDir(env, home), exe);
}

/**
 * Agent dir: HELM_CODING_AGENT_DIR or <home>/.helm/agent — mirrors the host's
 * getAgentDir() (env override, else <home>/<configDir>/agent).
 */
export function resolveAgentDir(env = process.env, home = homedir()) {
	return env.HELM_CODING_AGENT_DIR ? resolve(env.HELM_CODING_AGENT_DIR) : join(home, ".helm", "agent");
}

/**
 * Install the product skills shipped in the payload into the user-level skills
 * dir (<agentDir>/skills), where the host discovers them. Content-addressed:
 * only files whose bytes differ are rewritten, so reruns are idempotent and
 * local edits to an unchanged skill survive. Disabled by HELM_INSTALL_SKILLS=0.
 */
export function installSkills(env = process.env, home = homedir(), installDir = resolveInstallDir(env, home)) {
	const dir = join(resolveAgentDir(env, home), "skills");
	if (env.HELM_INSTALL_SKILLS === "0") return { dir, skipped: "disabled", updated: 0, unchanged: 0 };
	const srcDir = join(installDir, "skills");
	if (!existsSync(srcDir)) return { dir, skipped: "no-payload-skills", updated: 0, unchanged: 0 };
	let updated = 0;
	let unchanged = 0;
	mkdirSync(dir, { recursive: true });
	for (const name of readdirSync(srcDir)) {
		if (!name.endsWith(".md")) continue;
		const src = join(srcDir, name);
		if (!statSync(src).isFile()) continue;
		const dest = join(dir, name);
		const bytes = readFileSync(src);
		if (existsSync(dest) && sha256(readFileSync(dest)) === sha256(bytes)) {
			unchanged += 1;
			continue;
		}
		writeFileSync(dest, bytes);
		updated += 1;
	}
	return { dir, updated, unchanged };
}

export function sha256(data) {
	return createHash("sha256").update(data).digest("hex");
}

/** Parse coreutils `sha256sum` output ("<hex>  <name>" or "<hex> *<name>"). */
export function parseSha256Sums(text) {
	const map = new Map();
	for (const line of text.split(/\r?\n/)) {
		const m = /^([0-9a-fA-F]{64})[ \t]+\*?(.+?)\s*$/.exec(line);
		if (m) map.set(m[2], m[1].toLowerCase());
	}
	return map;
}

async function fetchText(url, fetchImpl) {
	const res = await fetchImpl(url);
	if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
	return res.text();
}

async function fetchBytes(url, fetchImpl) {
	const res = await fetchImpl(url);
	if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
}

/** Version resolution: explicit > HELM_VERSION > GitHub `releases/latest` tag. */
export async function resolveVersion(env = process.env, fetchImpl = globalThis.fetch) {
	if (env.HELM_VERSION) return String(env.HELM_VERSION).replace(/^v/, "");
	const repo = env.HELM_REPO ?? DEFAULT_REPO;
	const body = await fetchText(`https://api.github.com/repos/${repo}/releases/latest`, fetchImpl);
	const tag = JSON.parse(body).tag_name;
	if (typeof tag !== "string" || !/^v?\d/.test(tag)) throw new Error(`unexpected latest release tag: ${String(tag)}`);
	return tag.replace(/^v/, "");
}

function findFile(dir, name) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) {
			const hit = findFile(p, name);
			if (hit) return hit;
		} else if (entry.name === name) {
			return p;
		}
	}
	return null;
}

function copyTree(src, dest) {
	if (statSync(src).isDirectory()) {
		mkdirSync(dest, { recursive: true });
		for (const entry of readdirSync(src)) copyTree(join(src, entry), join(dest, entry));
		return;
	}
	mkdirSync(dirname(dest), { recursive: true });
	copyFileSync(src, dest);
}

/**
 * Download, verify and install the payload.
 * opts: env, fetchImpl, platform, arch, version, destDir, assetUrl, sumsUrl,
 *       expectSha256 (skip the SHA256SUMS fetch), dryRun
 */
export async function installPayload(opts = {}) {
	const env = opts.env ?? process.env;
	const platform = opts.platform ?? process.platform;
	const arch = opts.arch ?? process.arch;
	const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
	const asset = platformAsset(platform, arch);
	const base = env.HELM_RELEASE_BASE ?? DEFAULT_RELEASE_BASE;
	const destDir = opts.destDir ?? resolveInstallDir(env);

	if (opts.dryRun === true || env.HELM_DRY_RUN === "1") {
		const version = opts.version ?? env.HELM_VERSION ?? "latest";
		return {
			dryRun: true,
			version,
			asset: asset.file,
			assetUrl: opts.assetUrl ?? `${base}/v${version}/${asset.file}`,
			destDir,
		};
	}

	const version = (opts.version ?? (await resolveVersion(env, fetchImpl))).replace(/^v/, "");
	const assetUrl = opts.assetUrl ?? `${base}/v${version}/${asset.file}`;
	const bytes = await fetchBytes(assetUrl, fetchImpl);

	let expected;
	if (opts.expectSha256) expected = String(opts.expectSha256).toLowerCase();
	else {
		const sumsUrl = opts.sumsUrl ?? `${base}/v${version}/SHA256SUMS`;
		expected = parseSha256Sums(await fetchText(sumsUrl, fetchImpl)).get(asset.file);
		if (!expected) throw new Error(`SHA256SUMS has no entry for ${asset.file}`);
	}
	const actual = sha256(bytes);
	if (actual !== expected) throw new Error(`sha256 mismatch for ${asset.file}: expected ${expected}, got ${actual}`);

	const work = mkdtempSync(join(tmpdir(), "helmd-install-"));
	try {
		const archivePath = join(work, asset.file);
		writeFileSync(archivePath, bytes);
		// bsdtar ships with Windows 10+ and handles both .zip and .tar.gz, so one
		// extraction path covers every platform.
		const extracted = spawnSync("tar", ["-xf", archivePath, "-C", work], { stdio: "pipe", encoding: "utf8" });
		if (extracted.status !== 0) {
			throw new Error(`tar -xf ${asset.file} failed (${String(extracted.status)}): ${extracted.stderr ?? ""}`);
		}
		const exeName = platform === "win32" ? "helm.exe" : "helm";
		const exeSrc = findFile(work, exeName);
		if (!exeSrc) throw new Error(`${exeName} not found inside ${asset.file}`);
		const payloadDir = dirname(exeSrc);

		mkdirSync(destDir, { recursive: true });
		for (const entry of readdirSync(payloadDir)) {
			if (entry === exeName) continue;
			copyTree(join(payloadDir, entry), join(destDir, entry));
		}
		const exeDest = join(destDir, platform === "win32" ? "helm.exe" : "helm");
		if (existsSync(exeDest)) unlinkSync(exeDest);
		copyFileSync(exeSrc, exeDest);
		if (platform !== "win32") chmodSync(exeDest, 0o755);
		const skills = installSkills(env, opts.home ?? homedir(), destDir);
		return { version, asset: asset.file, exePath: exeDest, sha256: actual, destDir, skills };
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
}

/** Version marker shipped next to the payload (the archive's package.json). */
export function readInstalledVersion(destDir) {
	try {
		const data = JSON.parse(readFileSync(join(destDir, "package.json"), "utf8"));
		return typeof data.version === "string" ? data.version : null;
	} catch {
		return null;
	}
}
