import { afterEach, describe, expect, it } from "vitest";
import { findEnvKeys, getEnvApiKey } from "../src/env-api-keys.ts";
import { hasApi } from "../src/models.ts";
import { builtinModels } from "../src/providers/all.ts";

// Together's catalog is loaded from runtime provider data (providers/data/together.json),
// not the generated static table, so read it through Models rather than the static getter.
const models = builtinModels();

const originalTogetherApiKey = process.env.TOGETHER_API_KEY;

afterEach(() => {
	if (originalTogetherApiKey === undefined) {
		delete process.env.TOGETHER_API_KEY;
	} else {
		process.env.TOGETHER_API_KEY = originalTogetherApiKey;
	}
});

describe("Together models", () => {
	it("registers the default Kimi K3 model via OpenAI-compatible Chat Completions API", () => {
		const model = models.getModel("together", "moonshotai/Kimi-K3")!;

		expect(model).toBeDefined();
		expect(model.api).toBe("openai-completions");
		expect(model.provider).toBe("together");
		expect(model.baseUrl).toBe("https://api.together.ai/v1");
		expect(model.reasoning).toBe(true);
		expect(model.thinkingLevelMap).toEqual({ minimal: null, low: null, medium: null });
		expect(model.input).toEqual(["text", "image"]);
		expect(model.contextWindow).toBe(1048576);
		expect(model.maxTokens).toBe(131072);
		expect(model.cost).toEqual({
			input: 3,
			output: 15,
			cacheRead: 0.3,
			cacheWrite: 0,
		});
		expect(model.compat).toEqual({
			supportsStore: false,
			supportsDeveloperRole: false,
			supportsReasoningEffort: false,
			maxTokensField: "max_tokens",
			thinkingFormat: "together",
			supportsStrictMode: false,
			supportsLongCacheRetention: false,
		});
	});

	it("models Together reasoning controls from the Together API surface", () => {
		const gptOss = models.getModel("together", "openai/gpt-oss-120b")!;
		expect(gptOss.thinkingLevelMap).toEqual({
			off: null,
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			max: null,
			xhigh: null,
		});
		// Runtime lookups are typed Model<Api>; narrow before reading api-specific compat.
		expect(hasApi(gptOss, "openai-completions")).toBe(true);
		if (!hasApi(gptOss, "openai-completions")) throw new Error("unreachable");
		expect(gptOss.compat).toMatchObject({
			supportsReasoningEffort: true,
			thinkingFormat: "openai",
		});

		// The deepseek-ai/DeepSeek-V4-Pro entry this block used to assert is no longer in
		// Together's catalog data, so there is nothing to read.

		const minimax = models.getModel("together", "MiniMaxAI/MiniMax-M2.7")!;
		expect(minimax.thinkingLevelMap).toEqual({ off: null, minimal: null, low: null, medium: null });
		if (!hasApi(minimax, "openai-completions")) throw new Error("unreachable");
		expect(minimax.compat?.thinkingFormat).toBeUndefined();
		expect(minimax.compat?.supportsReasoningEffort).toBe(false);
	});

	it("resolves TOGETHER_API_KEY from the environment", () => {
		process.env.TOGETHER_API_KEY = "test-together-key";

		expect(findEnvKeys("together")).toEqual(["TOGETHER_API_KEY"]);
		expect(getEnvApiKey("together")).toBe("test-together-key");
	});
});
