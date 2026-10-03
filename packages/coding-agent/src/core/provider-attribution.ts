import type { Api, Model, ProviderHeaders } from "@adwmc/helm-ai";
import { APP_NAME, PACKAGE_NAME } from "../config.ts";
import type { SettingsManager } from "./settings-manager.ts";
import { isProviderAttributionEnabled } from "./telemetry.ts";

const OPENROUTER_HOST = "openrouter.ai";
const NVIDIA_NIM_HOST = "integrate.api.nvidia.com";
const CLOUDFLARE_API_HOST = "api.cloudflare.com";
const CLOUDFLARE_AI_GATEWAY_HOST = "gateway.ai.cloudflare.com";
const OPENCODE_HOST = "opencode.ai";

/**
 * Identity this client declares to upstream providers.
 *
 * These headers tell a provider who is calling; sending upstream pi's name would
 * misattribute helm's traffic (and, for OpenRouter, publish a title that is not ours).
 * The project URL follows the repository that ships this fork.
 */
const ATTRIBUTION_PROJECT_URL = "https://github.com/ADWMC/helm";

function matchesHost(baseUrl: string, expectedHost: string): boolean {
	try {
		return new URL(baseUrl).hostname === expectedHost;
	} catch {
		return false;
	}
}

function isOpenRouterModel(model: Model<Api>): boolean {
	return model.provider === "openrouter" || model.baseUrl.includes(OPENROUTER_HOST);
}

function isNvidiaNimModel(model: Model<Api>): boolean {
	return model.provider === "nvidia" || matchesHost(model.baseUrl, NVIDIA_NIM_HOST);
}

function isCloudflareModel(model: Model<Api>): boolean {
	return (
		model.provider === "cloudflare-workers-ai" ||
		model.provider === "cloudflare-ai-gateway" ||
		matchesHost(model.baseUrl, CLOUDFLARE_API_HOST) ||
		matchesHost(model.baseUrl, CLOUDFLARE_AI_GATEWAY_HOST)
	);
}

function getDefaultAttributionHeaders(
	model: Model<Api>,
	settingsManager: SettingsManager,
): Record<string, string> | undefined {
	if (!isProviderAttributionEnabled(settingsManager)) {
		return undefined;
	}

	if (isOpenRouterModel(model)) {
		return {
			"HTTP-Referer": ATTRIBUTION_PROJECT_URL,
			"X-OpenRouter-Title": APP_NAME,
			"X-OpenRouter-Categories": "cli-agent",
		};
	}

	if (isNvidiaNimModel(model)) {
		return {
			"X-BILLING-INVOKE-ORIGIN": APP_NAME,
		};
	}

	if (isCloudflareModel(model)) {
		return {
			"User-Agent": PACKAGE_NAME,
		};
	}

	return undefined;
}

function getSessionHeaders(model: Model<Api>, sessionId: string | undefined): Record<string, string> | undefined {
	if (!sessionId) return undefined;
	if (
		model.provider !== "opencode" &&
		model.provider !== "opencode-go" &&
		!matchesHost(model.baseUrl, OPENCODE_HOST)
	) {
		return undefined;
	}
	return { "x-opencode-session": sessionId, "x-opencode-client": APP_NAME };
}

export function mergeProviderAttributionHeaders(
	model: Model<Api>,
	settingsManager: SettingsManager,
	sessionId: string | undefined,
	...headerSources: Array<ProviderHeaders | undefined>
): ProviderHeaders | undefined {
	const merged: ProviderHeaders = {
		...getSessionHeaders(model, sessionId),
		...getDefaultAttributionHeaders(model, settingsManager),
	};

	for (const headers of headerSources) {
		if (headers) {
			Object.assign(merged, headers);
		}
	}

	return Object.keys(merged).length > 0 ? merged : undefined;
}
