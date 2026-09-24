/** Activation — E1. Exact word only; no second protocol. */

import { ACTIVATION_REPLY, ACTIVATION_WORD } from "./domain/types.ts";

export function isActivation(text: string): boolean {
	return text.trim() === ACTIVATION_WORD;
}

export function activationReply(): string {
	return ACTIVATION_REPLY;
}

/** Returns reply if activation, else null. */
export function matchActivation(text: string): string | null {
	return isActivation(text) ? activationReply() : null;
}
