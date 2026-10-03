import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	checkForNewPiVersion,
	comparePackageVersions,
	formatVersionCheckError,
	getLatestPiRelease,
	getLatestPiVersion,
	isNewerPackageVersion,
} from "../src/utils/version-check.ts";
import { allowNetwork } from "./test-network-env.ts";

const originalSkipVersionCheck = process.env.HELM_SKIP_VERSION_CHECK;
const originalLegacySkipVersionCheck = process.env.PI_SKIP_VERSION_CHECK;

beforeEach(() => {
	allowNetwork();
	delete process.env.PI_SKIP_VERSION_CHECK;
});

afterEach(() => {
	vi.unstubAllGlobals();
	if (originalSkipVersionCheck === undefined) {
		delete process.env.HELM_SKIP_VERSION_CHECK;
	} else {
		process.env.HELM_SKIP_VERSION_CHECK = originalSkipVersionCheck;
	}
	if (originalLegacySkipVersionCheck === undefined) {
		delete process.env.PI_SKIP_VERSION_CHECK;
	} else {
		process.env.PI_SKIP_VERSION_CHECK = originalLegacySkipVersionCheck;
	}
});

describe("version checks", () => {
	it("compares package versions", () => {
		expect(comparePackageVersions("0.70.6", "0.70.5")).toBeGreaterThan(0);
		expect(comparePackageVersions("0.70.5", "0.70.5")).toBe(0);
		expect(comparePackageVersions("0.70.4", "0.70.5")).toBeLessThan(0);
		expect(comparePackageVersions("5.0.0-beta.20", "5.0.0-beta.9")).toBeGreaterThan(0);
		expect(isNewerPackageVersion("0.70.5", "0.70.5")).toBe(false);
		expect(isNewerPackageVersion("0.70.6", "0.70.5")).toBe(true);
	});

	it("returns only newer versions", async () => {
		const fetchMock = vi.fn(async () => Response.json({ tag_name: "v1.2.3" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(checkForNewPiVersion("1.2.3")).resolves.toBeUndefined();
		await expect(checkForNewPiVersion("1.2.2")).resolves.toEqual({ version: "1.2.3" });
	});

	it("resolves releases from helm's own release source, never upstream pi.dev", async () => {
		const fetchMock = vi.fn(async (_url: string | URL) => Response.json({ tag_name: "v1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiVersion("1.2.3")).resolves.toBe("1.2.4");
		const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
		expect(requestedUrl).toContain("ADWMC/helm");
		expect(requestedUrl).not.toContain("pi.dev");
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("ADWMC/helm"),
			expect.objectContaining({
				headers: expect.objectContaining({
					accept: "application/vnd.github+json",
				}),
			}),
		);
	});

	it("honours HELM_RELEASE_API_BASE for mirrors and private forks", async () => {
		const original = process.env.HELM_RELEASE_API_BASE;
		process.env.HELM_RELEASE_API_BASE = "https://mirror.example/releases/latest";
		try {
			const fetchMock = vi.fn(async (_url: string | URL) => Response.json({ tag_name: "v9.9.9" }));
			vi.stubGlobal("fetch", fetchMock);

			await expect(getLatestPiVersion("1.2.3")).resolves.toBe("9.9.9");
			expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://mirror.example/releases/latest");
		} finally {
			if (original === undefined) delete process.env.HELM_RELEASE_API_BASE;
			else process.env.HELM_RELEASE_API_BASE = original;
		}
	});

	it("retries a transient version request when explicitly requested", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("fetch failed"))
			.mockRejectedValueOnce(new Error("fetch failed"))
			.mockResolvedValueOnce(Response.json({ tag_name: "v1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiRelease("1.2.3", { retry: true })).resolves.toEqual({ version: "1.2.4" });
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("keeps automatic version checks to one request", async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(checkForNewPiVersion("1.2.3")).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("formats nested network error details", () => {
		const error = new Error("fetch failed", {
			cause: new AggregateError([
				Object.assign(new Error("connect timeout"), { code: "ETIMEDOUT" }),
				Object.assign(new Error("network unreachable"), { code: "ENETUNREACH" }),
			]),
		});

		expect(formatVersionCheckError(error)).toBe("fetch failed (ETIMEDOUT, ENETUNREACH)");
	});

	it("strips the v prefix from the release tag", async () => {
		const fetchMock = vi.fn(async () => Response.json({ tag_name: "v1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiRelease("1.2.3")).resolves.toEqual({ version: "1.2.4" });
	});

	it("returns the release name as an update note", async () => {
		const fetchMock = vi.fn(async () => Response.json({ tag_name: "v1.2.4", name: " **Read this** " }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiRelease("1.2.3")).resolves.toEqual({ note: "**Read this**", version: "1.2.4" });
	});

	it("ignores a release payload without a usable tag", async () => {
		const fetchMock = vi.fn(async () => Response.json({ name: "no tag here" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiRelease("1.2.3")).resolves.toBeUndefined();
	});

	it("skips automatic api calls when version checks are disabled", async () => {
		process.env.HELM_SKIP_VERSION_CHECK = "1";
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(checkForNewPiVersion("1.2.3")).resolves.toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("allows direct api calls when automatic version checks are disabled", async () => {
		process.env.HELM_SKIP_VERSION_CHECK = "1";
		const fetchMock = vi.fn(async () => Response.json({ tag_name: "v1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiVersion("1.2.3")).resolves.toBe("1.2.4");
		expect(fetchMock).toHaveBeenCalledOnce();
	});
});
