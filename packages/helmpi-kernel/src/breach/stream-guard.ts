/**
 * Stream refusal guard — classify streamed text windows; provide retry ladder plan.
 * Host-agnostic: adapters feed deltas; we decide abort/retry/passthrough (P2: we propose,
 * host applies).
 */

import { isRefusal, refusalExcerpt } from "./refusal.ts";

export type StreamAction =
	| { readonly kind: "pass" }
	| { readonly kind: "abort_retry"; readonly attempt: number; readonly strategy: RetryStrategy }
	| { readonly kind: "honest_passthrough" };

export type RetryStrategy = "monitor" | "prefill_assistant" | "prefill_pair" | "passthrough";

export interface StreamGuardOptions {
	readonly maxRetries?: number;
	readonly windowChars?: number;
}

export interface StreamGuardState {
	attempt: number;
	buffer: string;
	classified: boolean;
}

export function createStreamGuard(_opts: StreamGuardOptions = {}): StreamGuardState {
	return { attempt: 0, buffer: "", classified: false };
}

const LADDER: RetryStrategy[] = ["monitor", "prefill_assistant", "prefill_pair", "passthrough"];

/**
 * Feed one content delta. Returns the action the host should take.
 * Short refusals are classified at settle() as well.
 */
export function ingest(state: StreamGuardState, delta: string, opts: StreamGuardOptions = {}): StreamAction {
	const maxRetries = opts.maxRetries ?? 3;
	const window = opts.windowChars ?? 80;
	state.buffer += delta;
	if (state.classified) return { kind: "pass" };
	if (state.buffer.length < window && !isRefusal(state.buffer)) {
		return { kind: "pass" };
	}
	return classify(state, maxRetries);
}

export function settle(state: StreamGuardState, opts: StreamGuardOptions = {}): StreamAction {
	const maxRetries = opts.maxRetries ?? 3;
	if (state.classified) return { kind: "pass" };
	return classify(state, maxRetries);
}

function classify(state: StreamGuardState, maxRetries: number): StreamAction {
	if (!isRefusal(state.buffer)) {
		state.classified = true;
		return { kind: "pass" };
	}
	state.classified = true;
	if (state.attempt >= maxRetries) {
		return { kind: "honest_passthrough" };
	}
	const strategy = LADDER[Math.min(state.attempt + 1, LADDER.length - 1)]!;
	state.attempt += 1;
	// reset buffer for nested attempt
	state.buffer = "";
	state.classified = false;
	return { kind: "abort_retry", attempt: state.attempt, strategy };
}

export function reasonFor(action: StreamAction): string {
	if (action.kind === "pass") return "ok";
	if (action.kind === "honest_passthrough") return "retry_budget_exhausted";
	return `retry:${action.strategy}`;
}

export { isRefusal, refusalExcerpt };
