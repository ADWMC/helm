/**
 * Agent loop lifecycle integration points — pre-turn (prepareNextTurn),
 * after-stream (afterStream), before-tool (beforeToolCall), after-tool
 * (afterToolCall), finish (finishTurn) must exist and fire in order on the
 * REAL loop (REDESIGN §16.10).
 */

import {
	type AssistantMessage,
	type AssistantMessageEvent,
	EventStream,
	type Message,
	type Model,
	type UserMessage,
} from "@adwmc/helm-ai";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { agentLoop } from "../src/agent-loop.ts";
import type { AgentContext, AgentLoopConfig, AgentTool } from "../src/types.ts";

class MockAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected event type");
			},
		);
	}
}

function createUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function createModel(): Model<"openai-responses"> {
	return {
		id: "mock",
		name: "mock",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 2048,
	};
}

function createAssistantMessage(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "mock",
		usage: createUsage(),
		stopReason,
		timestamp: Date.now(),
	};
}

function createUserMessage(text: string): UserMessage {
	return { role: "user", content: text, timestamp: Date.now() };
}

function identityConverter(messages: AgentMessageLike[]): Message[] {
	return messages.filter(
		(m) => m.role === "system" || m.role === "user" || m.role === "assistant" || m.role === "toolResult",
	) as Message[];
}

type AgentMessageLike = AgentContext["messages"][number];

describe("agent loop lifecycle integration points", () => {
	it("fires pre-turn / after-stream / before-tool / after-tool / finish in order", async () => {
		const order: string[] = [];
		const toolSchema = Type.Object({ value: Type.String() });
		const tool: AgentTool<typeof toolSchema, { value: string }> = {
			name: "echo",
			label: "Echo",
			description: "Echo tool",
			parameters: toolSchema,
			async execute(_toolCallId, params) {
				order.push("tool-exec");
				return { content: [{ type: "text", text: params.value }], details: {} };
			},
		};
		const context: AgentContext = { messages: [], tools: [tool] };
		const config: AgentLoopConfig = {
			model: createModel(),
			convertToLlm: identityConverter,
			prepareNextTurn: async () => {
				order.push("pre-turn");
				return undefined;
			},
			afterStream: async ({ message }) => {
				order.push(`after-stream:${message.stopReason}`);
			},
			beforeToolCall: async () => {
				order.push("before-tool");
				return undefined;
			},
			afterToolCall: async () => {
				order.push("after-tool");
				return undefined;
			},
			finishTurn: async () => {
				order.push("finish");
				return undefined;
			},
		};

		let callIndex = 0;
		const streamFn = () => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				if (callIndex === 0) {
					const message = createAssistantMessage(
						[{ type: "toolCall", id: "tool-1", name: "echo", arguments: { value: "hello" } }],
						"toolUse",
					);
					stream.push({ type: "done", reason: "toolUse", message });
				} else {
					const message = createAssistantMessage([{ type: "text", text: "done" }]);
					stream.push({ type: "done", reason: "stop", message });
				}
				callIndex++;
			});
			return stream;
		};

		const stream = agentLoop([createUserMessage("hello")], context, config, undefined, streamFn);
		for await (const _event of stream) {
			/* drain */
		}

		expect(order).toEqual([
			"after-stream:toolUse",
			"before-tool",
			"tool-exec",
			"after-tool",
			"finish",
			"pre-turn",
			"after-stream:stop",
			"finish",
		]);
	});

	it("after-stream sees the settled message before tools dispatch and cannot block them", async () => {
		const seen: string[] = [];
		const toolSchema = Type.Object({ value: Type.String() });
		const tool: AgentTool<typeof toolSchema, { value: string }> = {
			name: "echo",
			label: "Echo",
			description: "Echo tool",
			parameters: toolSchema,
			async execute(_toolCallId, params) {
				seen.push(`exec:${params.value}`);
				return { content: [{ type: "text", text: params.value }], details: {} };
			},
		};
		const context: AgentContext = { messages: [], tools: [tool] };
		const config: AgentLoopConfig = {
			model: createModel(),
			convertToLlm: identityConverter,
			afterStream: async ({ message }) => {
				const text = message.content
					.filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
					.map((c) => c.text)
					.join("");
				seen.push(`stream:${text || "(tool-call only)"}`);
				// Observe-only contract: even "hostile" hook results must not
				// change tool execution (the hook returns void).
				return undefined;
			},
		};

		let callIndex = 0;
		const streamFn = () => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				if (callIndex === 0) {
					const message = createAssistantMessage(
						[{ type: "toolCall", id: "tool-1", name: "echo", arguments: { value: "go" } }],
						"toolUse",
					);
					stream.push({ type: "done", reason: "toolUse", message });
				} else {
					stream.push({ type: "done", reason: "stop", message: createAssistantMessage([]) });
				}
				callIndex++;
			});
			return stream;
		};

		const stream = agentLoop([createUserMessage("hi")], context, config, undefined, streamFn);
		for await (const _event of stream) {
			/* drain */
		}

		expect(seen).toEqual(["stream:(tool-call only)", "exec:go", "stream:"]);
	});
});
