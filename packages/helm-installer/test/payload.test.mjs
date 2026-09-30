import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
	DEFAULT_RELEASE_BASE,
	installPayload,
	parseSha256Sums,
	platformAsset,
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
	const payloadDir = join(root, "pi");
	mkdirSync(join(payloadDir, "theme"), { recursive: true });
	mkdirSync(join(payloadDir, "native", "linux-x64", "prebuilds"), { recursive: true });
	writeFileSync(join(payloadDir, "pi"), "PI PAYLOAD BYTES");
	writeFileSync(join(payloadDir, "package.json"), JSON.stringify({ version: "9.9.9" }));
	writeFileSync(join(payloadDir, "theme", "colors.json"), '{"bg":"#000"}');
	writeFileSync(join(payloadDir, "native", "linux-x64", "prebuilds", "helper.node"), "NATIVE");
	const archive = join(root, "pi-linux-x64.tar.gz");
	const tar = spawnSync("tar", ["-czf", archive, "-C", root, "pi"], { encoding: "utf8" });
	if (tar.status !== 0) throw new Error(`tar fixture failed: ${tar.stderr}`);
	return { archive, bytes: readFileSync(archive), asset: "pi-linux-x64.tar.gz" };
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
		expect(platformAsset("darwin", "arm64")).toEqual({ platform: "darwin-arm64", file: "pi-darwin-arm64.tar.gz" });
		expect(platformAsset("linux", "x64").file).toBe("pi-linux-x64.tar.gz");
		expect(platformAsset("win32", "x64")).toEqual({ platform: "windows-x64", file: "pi-windows-x64.zip" });
		expect(platformAsset("win32", "arm64").file).toBe("pi-windows-arm64.zip");
		expect(() => platformAsset("sunos", "x64")).toThrow(/unsupported platform/);
		expect(() => platformAsset("linux", "ia32")).toThrow(/unsupported arch/);
	});

	it("parses SHA256SUMS in both plain and binary-marker forms", () => {
		const hex = "a".repeat(64);
		const map = parseSha256Sums(`${hex}  pi-linux-x64.tar.gz\r\n${"b".repeat(64)} *pi-windows-x64.zip\n`);
		expect(map.get("pi-linux-x64.tar.gz")).toBe(hex);
		expect(map.get("pi-windows-x64.zip")).toBe("b".repeat(64));
	});

	it("resolves version from env without touching the network", async () => {
		const boom = fetchStub({});
		boom.calls.length = 0;
		await expect(resolveVersion({ HELM_VERSION: "v3.1.4" }, boom)).resolves.toBe("3.1.4");
		expect(boom.calls).toEqual([]);
		const api = fetchStub({ "https://api.github.com/repos/ADWMC/helm/releases/latest": '{"tag_name":"v2.0.0"}' });
		await expect(resolveVersion({}, api)).resolves.toBe("2.0.0");
	});

	it("installs the payload: verify sha, copy siblings, rename pi -> helm", async () => {
		const fixture = buildFixture();
		const dest = join(tempRoot("dest"), "bin");
		const sums = `${sha256(fixture.bytes)}  ${fixture.asset}\n`;
		const assetUrl = `${DEFAULT_RELEASE_BASE}/v1.2.3/${fixture.asset}`;
		const sumsUrl = `${DEFAULT_RELEASE_BASE}/v1.2.3/SHA256SUMS`;
		const fetchImpl = fetchStub({ [assetUrl]: { bytes: fixture.bytes }, [sumsUrl]: sums });

		const result = await installPayload({
			platform: "linux",
			arch: "x64",
			version: "1.2.3",
			destDir: dest,
			env: {},
			fetchImpl,
		});

		expect(fetchImpl.calls).toEqual([assetUrl, sumsUrl]);
		expect(result.version).toBe("1.2.3");
		expect(result.sha256).toBe(sha256(fixture.bytes));
		const exe = join(dest, "helm");
		expect(existsSync(exe)).toBe(true);
		expect(readFileSync(exe, "utf8")).toBe("PI PAYLOAD BYTES");
		expect(existsSync(join(dest, "package.json"))).toBe(true);
		expect(existsSync(join(dest, "theme", "colors.json"))).toBe(true);
		expect(existsSync(join(dest, "native", "linux-x64", "prebuilds", "helper.node"))).toBe(true);
		expect(existsSync(join(dest, "pi"))).toBe(false);
		expect(JSON.parse(readFileSync(join(dest, "package.json"), "utf8")).version).toBe("9.9.9");
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
		expect(result.assetUrl).toBe(`${DEFAULT_RELEASE_BASE}/v1.2.3/pi-linux-x64.tar.gz`);
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
