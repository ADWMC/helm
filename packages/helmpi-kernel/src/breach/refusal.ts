/** Delivery-refusal detection — narrowed so technical statements do not false-positive. */

/** Strong delivery refusal (first-person / canned apology + refusal verb). */
export const REFUSAL_RE = new RegExp(
	[
		"抱歉[，,]?\\s*我(?:无法|不能)",
		"对不起[，,]?\\s*我(?:无法|不能)",
		"我(?:无法|不能)(?:协助|提供|满足|继续|回答|生成|执行|编写|制作)",
		"(?:无法|不能)(?:协助|提供|满足)",
		"不予(?:提供|答复|协助)",
		"拒绝(?:执行|协助|回答)",
		"不合规",
		"不在(?:我的)?(?:职责|服务)?范围",
		"I can'?t (?:assist|help|provide)",
		"I cannot (?:assist|help|provide)",
		"I'?m sorry, but",
		"I am sorry, but",
		"I am unable to",
		"I won'?t (?:help|assist|provide)",
		"I must decline",
	].join("|"),
	"i",
);

/** Weaker hedge markers for advisory stance — require refusal-ish verb nearby. */
export const HEDGE_RE = new RegExp(
	[
		"出于安全(?:考虑|起见)?[，,]?\\s*(?:我(?:无法|不能|不予)|这超出了)",
		"作为替代方案[，,]?\\s*我(?:建议|无法|不能)",
		"I am sorry, but",
		"against my policy",
	].join("|"),
	"i",
);

export function isRefusal(text: string): boolean {
	return REFUSAL_RE.test(text);
}

export function isHedge(text: string): boolean {
	return HEDGE_RE.test(text);
}

export type Stance = "normal" | "challenged" | "refusal";

export function classifyStance(text: string): Stance {
	if (isRefusal(text)) return "refusal";
	if (isHedge(text)) return "challenged";
	return "normal";
}

export function refusalExcerpt(text: string): string | null {
	if (!isRefusal(text)) return null;
	return text.replace(/\s+/g, " ").trim().slice(0, 240);
}
