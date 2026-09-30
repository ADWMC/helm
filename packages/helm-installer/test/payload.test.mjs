import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
	DEFAULT_RELEASE_BASE,
	installPayload,
	installSkills,
	parseSha256Sums,
	platformAsset,
	resolveAgentDir,
	resolveInstallDir,
	resolvePayloadPath,
	resolveVersion,
	sha256,
} from "../lib/payload.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const roots = [];

function tempRoot(label) {
	const dir = mkdtempSync(join(tmpdir(), `helm-installer-${label}-`));
	roots.push(dir);
	return dir;
}

afterAll(() => {
	for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

/** Build a real tar.gz fixture shaped like the Build Binaries payload. */
function buildFixture() {
	const root = tempRoot("fixture");
	const payloadDir = join(root, "helm");
	mkdirSync(join(payloadDir, "theme"), { recursive: true });
	mkdirSync(join(payloadDir, "native", "linux-x64", "prebuilds"), { recursive: true });
	mkdirSync(join(payloadDir, "skills"), { recursive: true });
	writeFileSync(join(payloadDir, "helm"), "HELM PAYLOAD BYTES");
	writeFileSync(join(payloadDir, "package.json"), JSON.stringify({ version: "9.9.9" }));
	writeFileSync(join(payloadDir, "theme", "colors.json"), '{"bg":"#000"}');
	writeFileSync(join(payloadDir, "native", "linux-x64", "prebuilds", "helper.node"), "NATIVE");
	writeFileSync(join(payloadDir, "skills", "sample-intake.md"), "---\nname: sample-intake\n---\nv1\n");
	writeFileSync(join(payloadDir, "skills", "release.md"), "---\nname: release\n---\nstable\n");
	const archive = join(root, "helm-linux-x64.tar.gz");
	const tar = spawnSync("tar", ["-czf", archive, "-C", root, "helm"], { encoding: "utf8" });
	if (tar.status !== 0) throw new Error(`tar fixture failed: ${tar.stderr}`);
	return { archive, bytes: readFileSync(archive), asset: "helm-linux-x64.tar.gz" };
}

function fetchStub(routes) {
	const calls = [];
	const impl = async (url) => {
		calls.push(String(url));
		const hit = routes[String(url)];
		if (!hit) return { ok: false, status: 404, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
		return {
			ok: true,
			status: 200,
			text: async () => (typeof hit === "string" ? hit : hit.text ?? ""),
			arrayBuffer: async () => {
				const buf = typeof hit === "string" ? Buffer.from(hit) : hit.bytes;
				return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			},
		};
	};
	impl.calls = calls;
	return impl;
}

describe("helm-installer payload logic", () => {
	it("maps platforms to the Build Binaries asset names", () => {
		expect(platformAsset("darwin", "arm64")).toEqual({ platform: "darwin-arm64", file: "helm-darwin-arm64.tar.gz" });
		expect(platformAsset("linux", "x64").file).toBe("helm-linux-x64.tar.gz");
		expect(platformAsset("win32", "x64")).toEqual({ platform: "windows-x64", file: "helm-windows-x64.zip" });
		expect(platformAsset("win32", "arm64").file).toBe("helm-windows-arm64.zip");
		expect(() => platformAsset("sunos", "x64")).toThrow(/unsupported platform/);
		expect(() => platformAsset("linux", "ia32")).toThrow(/unsupported arch/);
	});

	it("parses SHA256SUMS in both plain and binary-marker forms", () => {
		const hex = "a".repeat(64);
		const map = parseSha256Sums(`${hex}  helm-linux-x64.tar.gz\r\n${"b".repeat(64)} *helm-windows-x64.zip\n`);
		expect(map.get("helm-linux-x64.tar.gz")).toBe(hex);
		expect(map.get("helm-windows-x64.zip")).toBe("b".repeat(64));
	});

	it("resolves version from env without touching the network", async () => {
		const boom = fetchStub({});
		boom.calls.length = 0;
		await expect(resolveVersion({ HELM_VERSION: "v3.1.4" }, boom)).resolves.toBe("3.1.4");
		expect(boom.calls).toEqual([]);
		const api = fetchStub({ "https://api.github.com/repos/ADWMC/helm/releases/latest": '{"tag_name":"v2.0.0"}' });
		await expect(resolveVersion({}, api)).resolves.toBe("2.0.0");
	});

	it("installs the payload: verify sha, copy siblings, place the helm binary", async () => {
		const fixture = buildFixture();
		const dest = join(tempRoot("dest"), "bin");
		const home = tempRoot("dest-home");
		const sums = `${sha256(fixture.bytes)}  ${fixture.asset}\n`;
		const assetUrl = `${DEFAULT_RELEASE_BASE}/v1.2.3/${fixture.asset}`;
		const sumsUrl = `${DEFAULT_RELEASE_BASE}/v1.2.3/SHA256SUMS`;
		const fetchImpl = fetchStub({ [assetUrl]: { bytes: fixture.bytes }, [sumsUrl]: sums });

		const result = await installPayload({
			platform: "linux",
			arch: "x64",
			version: "1.2.3",
			destDir: dest,
			home,
			env: {},
			fetchImpl,
		});

		expect(fetchImpl.calls).toEqual([assetUrl, sumsUrl]);
		expect(result.version).toBe("1.2.3");
		expect(result.sha256).toBe(sha256(fixture.bytes));
		const exe = join(dest, "helm");
		expect(existsSync(exe)).toBe(true);
		expect(readFileSync(exe, "utf8")).toBe("HELM PAYLOAD BYTES");
		expect(existsSync(join(dest, "package.json"))).toBe(true);
		expect(existsSync(join(dest, "theme", "colors.json"))).toBe(true);
		expect(existsSync(join(dest, "native", "linux-x64", "prebuilds", "helper.node"))).toBe(true);
		// the payload binary itself is not duplicated as a sibling copy
		expect(existsSync(join(dest, "helm"))).toBe(true);
		expect(JSON.parse(readFileSync(join(dest, "package.json"), "utf8")).version).toBe("9.9.9");
		// product skills land in the user-level skills dir, not the install dir
		const skillsDir = join(home, ".helm", "agent", "skills");
		expect(result.skills).toEqual({ dir: skillsDir, updated: 2, unchanged: 0 });
		expect(readFileSync(join(skillsDir, "sample-intake.md"), "utf8")).toContain("v1");
		expect(existsSync(join(skillsDir, "release.md"))).toBe(true);
	});

	it("keeps skill installs idempotent and refreshes only changed files", async () => {
		const fixture = buildFixture();
		const dest = join(tempRoot("skills-dest"), "bin");
		const home = tempRoot("skills-home");
		const assetUrl = `${DEFAULT_RELEASE_BASE}/v1.2.3/${fixture.asset}`;
		const sumsUrl = `${DEFAULT_RELEASE_BASE}/v1.2.3/SHA256SUMS`;
		const first = fetchStub({ [assetUrl]: { bytes: fixture.bytes }, [sumsUrl]: `${sha256(fixture.bytes)}  ${fixture.asset}\n` });
		const opts = { platform: "linux", arch: "x64", version: "1.2.3", destDir: dest, home, env: {} };

		const run1 = await installPayload({ ...opts, fetchImpl: first });
		expect(run1.skills).toEqual({ dir: join(home, ".helm", "agent", "skills"), updated: 2, unchanged: 0 });

		const second = fetchStub({ [assetUrl]: { bytes: fixture.bytes }, [sumsUrl]: `${sha256(fixture.bytes)}  ${fixture.asset}\n` });
		const run2 = await installPayload({ ...opts, fetchImpl: second });
		expect(run2.skills.updated).toBe(0);
		expect(run2.skills.unchanged).toBe(2);

		// operator edited one skill: a payload refresh must overwrite it, leave the other
		writeFileSync(join(home, ".helm", "agent", "skills", "release.md"), "local tweak\n");
		const third = fetchStub({ [assetUrl]: { bytes: fixture.bytes }, [sumsUrl]: `${sha256(fixture.bytes)}  ${fixture.asset}\n` });
		const run3 = await installPayload({ ...opts, fetchImpl: third });
		expect(run3.skills.updated).toBe(1);
		expect(run3.skills.unchanged).toBe(1);
		expect(readFileSync(join(home, ".helm", "agent", "skills", "release.md"), "utf8")).toContain("stable");
	});

	it("skips skills when HELM_INSTALL_SKILLS=0 and reports missing payload skills", async () => {
		const fixture = buildFixture();
		const dest = join(tempRoot("noskills-dest"), "bin");
		const home = tempRoot("noskills-home");
		const assetUrl = `${DEFAULT_RELEASE_BASE}/v1.2.3/${fixture.asset}`;
		const sumsUrl = `${DEFAULT_RELEASE_BASE}/v1.2.3/SHA256SUMS`;
		const fetchImpl = fetchStub({ [assetUrl]: { bytes: fixture.bytes }, [sumsUrl]: `${sha256(fixture.bytes)}  ${fixture.asset}\n` });

		const result = await installPayload({
			platform: "linux",
			arch: "x64",
			version: "1.2.3",
			destDir: dest,
			home,
			env: { HELM_INSTALL_SKILLS: "0" },
			fetchImpl,
		});
		expect(result.skills.skipped).toBe("disabled");
		expect(existsSync(join(home, ".helm", "agent", "skills"))).toBe(false);

		expect(installSkills({}, home, tempRoot("empty-install"))).toMatchObject({ skipped: "no-payload-skills", updated: 0 });
	});

	it("resolves the agent dir with the HELM_CODING_AGENT_DIR override", () => {
		const home = tempRoot("agent-home");
		expect(resolveAgentDir({}, home)).toBe(join(home, ".helm", "agent"));
		const custom = join(home, "custom-agent");
		expect(resolveAgentDir({ HELM_CODING_AGENT_DIR: custom }, home)).toBe(custom);
	});

	it("refuses a tampered archive (sha256 mismatch)", async () => {
		const fixture = buildFixture();
		const dest = join(tempRoot("tamper"), "bin");
		const badSums = `${"0".repeat(64)}  ${fixture.asset}\n`;
		const assetUrl = `${DEFAULT_RELEASE_BASE}/v1.2.3/${fixture.asset}`;
		const sumsUrl = `${DEFAULT_RELEASE_BASE}/v1.2.3/SHA256SUMS`;
		const fetchImpl = fetchStub({ [assetUrl]: { bytes: fixture.bytes }, [sumsUrl]: badSums });
		await expect(
			installPayload({ platform: "linux", arch: "x64", version: "1.2.3", destDir: dest, env: {}, fetchImpl }),
		).rejects.toThrow(/sha256 mismatch/);
		expect(existsSync(join(dest, "helm"))).toBe(false);
	});

	it("dry run prints the plan without a single fetch", async () => {
		const fetchImpl = fetchStub({});
		const result = await installPayload({
			platform: "linux",
			arch: "x64",
			version: "1.2.3",
			env: {},
			fetchImpl,
			dryRun: true,
		});
		expect(result.dryRun).toBe(true);
		expect(result.assetUrl).toBe(`${DEFAULT_RELEASE_BASE}/v1.2.3/helm-linux-x64.tar.gz`);
		expect(fetchImpl.calls).toEqual([]);
	});

	it("resolves payload paths with env overrides", () => {
		expect(resolvePayloadPath({ HELM_BIN_PATH: "/x/y/helm" })).toBe("/x/y/helm");
		const dir = resolveInstallDir({ HELM_INSTALL_DIR: join(tempRoot("envdir"), "custom") });
		expect(dir).toContain("custom");
		const exe = process.platform === "win32" ? "helm.exe" : "helm";
		expect(resolvePayloadPath({ HELM_INSTALL_DIR: dir })).toBe(join(dir, exe));
	});

	it("launcher exits 1 with repair instructions when the payload is missing", () => {
		const launcher = fileURLToPath(new URL("../bin/helm.js", import.meta.url));
		const missing = join(tempRoot("launch"), "no-such-helm");
		const run = spawnSync(process.execPath, [launcher], {
			env: { ...process.env, HELM_BIN_PATH: missing },
			encoding: "utf8",
		});
		expect(run.status).toBe(1);
		expect(run.stderr).toContain("payload not found");
		expect(run.stderr).toContain("npm i -g @adwmc/helm-installer");
	});
});
