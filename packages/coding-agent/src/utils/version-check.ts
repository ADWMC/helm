import { compare, valid } from "semver";
import { fetchWithRetry } from "./management-http.ts";
import { getPiUserAgent } from "./pi-user-agent.ts";

/**
 * Release source for update checks.
 *
 * This fork does not run the upstream pi.dev API, and pointing at it would be worse than
 * useless: the endpoint reports *pi's* version, so helm would either announce a version it
 * can never be, or (via `helm update`) install the upstream package over itself. The check
 * therefore resolves helm releases from the repository that publishes them.
 *
 * Overridable for mirrors/private forks via HELM_RELEASE_API_BASE.
 */
const DEFAULT_RELEASE_API_BASE = "https://api.github.com/repos/ADWMC/helm/releases/latest";
const DEFAULT_VERSION_CHECK_TIMEOUT_MS = 10000;

function releaseApiUrl(): string {
	const override = process.env.HELM_RELEASE_API_BASE?.trim();
	return override && override.length > 0 ? override : DEFAULT_RELEASE_API_BASE;
}

export interface LatestPiRelease {
	version: string;
	packageName?: string;
	note?: string;
}

/** Include useful errno details hidden behind Node's generic "fetch failed" error. */
export function formatVersionCheckError(error: unknown): string {
	const rootMessage = error instanceof Error && error.message ? error.message : String(error);
	const cause = error instanceof Error ? error.cause : undefined;
	const causes = cause instanceof AggregateError ? cause.errors : cause === undefined ? [] : [cause];
	const codes = causes
		.map((value) =>
			typeof value === "object" && value !== null && "code" in value && typeof value.code === "string"
				? value.code
				: undefined,
		)
		.filter((code): code is string => code !== undefined);

	if (codes.length > 0) return `${rootMessage} (${[...new Set(codes)].join(", ")})`;
	const causeMessage = causes.find(
		(value): value is Error => value instanceof Error && Boolean(value.message),
	)?.message;
	return causeMessage ? `${rootMessage} (cause: ${causeMessage})` : rootMessage;
}

export function comparePackageVersions(leftVersion: string, rightVersion: string): number | undefined {
	const left = valid(leftVersion.trim());
	const right = valid(rightVersion.trim());
	if (!left || !right) {
		return undefined;
	}
	return compare(left, right);
}

export function isNewerPackageVersion(candidateVersion: string, currentVersion: string): boolean {
	const comparison = comparePackageVersions(candidateVersion, currentVersion);
	if (comparison !== undefined) {
		return comparison > 0;
	}
	return candidateVersion.trim() !== currentVersion.trim();
}

export async function getLatestPiRelease(
	currentVersion: string,
	options: { timeoutMs?: number; retry?: boolean } = {},
): Promise<LatestPiRelease | undefined> {
	if (process.env.HELM_OFFLINE) return undefined;

	const response = await fetchWithRetry(
		releaseApiUrl(),
		{
			headers: {
				"User-Agent": getPiUserAgent(currentVersion),
				accept: "application/vnd.github+json",
			},
		},
		{
			maxRetries: options.retry ? 2 : 0,
			timeoutMs: options.timeoutMs ?? DEFAULT_VERSION_CHECK_TIMEOUT_MS,
		},
	);
	if (!response.ok) return undefined;

	const data = (await response.json()) as {
		tag_name?: unknown;
		name?: unknown;
		body?: unknown;
	};
	// GitHub releases carry the version in tag_name; strip a leading v.
	const rawTag = typeof data.tag_name === "string" ? data.tag_name.trim() : "";
	const version = rawTag.startsWith("v") ? rawTag.slice(1) : rawTag;
	if (!version) {
		return undefined;
	}
	const note = typeof data.name === "string" && data.name.trim() ? data.name.trim() : undefined;
	return {
		version,
		...(note ? { note } : {}),
	};
}

export async function getLatestPiVersion(
	currentVersion: string,
	options: { timeoutMs?: number; retry?: boolean } = {},
): Promise<string | undefined> {
	return (await getLatestPiRelease(currentVersion, options))?.version;
}

export async function checkForNewPiVersion(currentVersion: string): Promise<LatestPiRelease | undefined> {
	if (process.env.HELM_SKIP_VERSION_CHECK) return undefined;

	try {
		const latestRelease = await getLatestPiRelease(currentVersion);
		if (latestRelease && isNewerPackageVersion(latestRelease.version, currentVersion)) {
			return latestRelease;
		}
		return undefined;
	} catch {
		return undefined;
	}
}
