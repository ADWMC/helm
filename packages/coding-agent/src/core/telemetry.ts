import type { SettingsManager } from "./settings-manager.ts";

function isTruthyEnvFlag(value: string | undefined): boolean {
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes";
}

/**
 * Whether outbound provider-attribution headers are declared.
 *
 * This module used to gate an install-reporting ping to upstream. That ping is gone: helm
 * has no endpoint to receive it, and the setting that advertised it was removed with it.
 * What remains is the attribution decision — whether requests may carry an identifying
 * `HTTP-Referer`/title/user-agent so third-party providers can attribute the traffic.
 *
 * HELM_TELEMETRY overrides the stored setting; the legacy PI_TELEMETRY name is still read
 * so existing configurations keep behaving the same way.
 */
export function isProviderAttributionEnabled(
	settingsManager: SettingsManager,
	telemetryEnv: string | undefined = process.env.HELM_TELEMETRY ?? process.env.PI_TELEMETRY,
): boolean {
	return telemetryEnv !== undefined ? isTruthyEnvFlag(telemetryEnv) : settingsManager.getEnableInstallTelemetry();
}
