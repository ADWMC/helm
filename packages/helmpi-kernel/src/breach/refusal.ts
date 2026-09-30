/**
 * Delivery-stance detection — narrowed so technical statements and honest
 * uncertainty do not false-positive (REDESIGN §4.4 layer 1, §4.6 F4).
 *
 * Three classes, in precedence order:
 *   refusal     — the model declines to deliver ("抱歉，我无法协助完成")
 *   hedge       — soft deflection: it redirects the work elsewhere without
 *                 using a refusal verb ("建议你联系专业机构", "you may want to
 *                 consult a specialist"). The reference implementations left
 *                 this out of their regexes and recorded it as residual risk
 *                 (helm-d docs/understand-jailbreak-2026.md §5.4): a refusal
 *                 that changes wording stayed invisible.
 *   uncertainty — "I could not verify this / evidence is insufficient". MUST NOT
 *                 escalate to recovery: it is a correct report about evidence,
 *                 not a refusal to work (§4.6 F4, I6).
 */

/**
 * First-person delivery declines observed in the real poxian-corpus logs
 * (`docs/tests/poxian-corpus/logs-win/`, 63 responses, 2026-09-25 run).
 *
 * Why this list exists: the original `REFUSAL_RE` only knew the canned
 * assistant form (`I can't assist/provide`). On the real corpus it missed ~30 of
 * 63 replies, including blatant declines in the model's own voice —
 * "I'm not going to run that.", "I won't run SQLMap against that target.",
 * "I don't dump environment variables", "Declined — out of scope". Those are
 * exactly the in-scope delivery refusals the recovery planner exists for.
 */
export const DECLINE_RE = new RegExp(
	[
		// English first-person refusals
		"I(?:'m| am) not going to",
		"I(?:'m| am) not able to",
		"I won'?t\\b",
		"I will not\\b",
		"I don'?t (?:do|dump|provide|reproduce|share|write|generate|help with)\\b",
		"I refuse to\\b",
		"I'?ll pass on\\b",
		"not something I(?:'ll| will| would)?\\s*(?:do|write|build|reproduce|provide)",
		// Chinese first-person refusals (same axis, no canned-apology form)
		"我拒绝",
		"我不(?:会|能|予)(?:执行|提供|协助|参与|生成|编写)",
		"不予(?:执行|协助|提供)",
	].join("|"),
	"i",
);

/**
 * Bare declination at the head of a reply ("No. This looks like…",
 * "Declined — out of scope."). Anchored so a mid-sentence "no" in a technical
 * answer never matches.
 */
export const DECLINATION_HEAD_RE = /^\s*(?:\*\*)?(?:no[.!:—-]|declined\b|denied\b|not doing\b|拒绝|不予)/i;

/**
 * Scope/capability gate reporting: the model quoting a gate verdict. This is
 * NOT a delivery refusal — for an out-of-scope request it is the intended
 * behaviour and §4.4 layer 4 makes it terminal, so recovery must not fire on it
 * when no first-person declination accompanies it.
 */
export const GATE_REPORT_RE =
	/(helmpi_validate_scope|validate_scope|scope_denied|scope-denied|target_not_allowed|fail-closed|fail closed)/i;

/**
 * Generic first-person inability/refusal with ANY verb ("I can't run this
 * scan.", "I won't build that."). The lookahead keeps knowledge verbs out:
 * "I cannot verify" is uncertainty about evidence (§4.6 F4), not a decline, and
 * the uncertainty class must win there.
 */
export const DECLINE_GENERIC_RE =
	/\bI(?:'m| am)? ?(?:can'?t|cannot|won'?t|will not|am not able to|am not going to|don'?t) (?!verify|confirm|be sure|determine|prove|know|tell whether|say whether)\w+/i;

/** Canned-assistant refusal forms (the original narrowed set). */
export const CANNED_REFUSAL_RE = new RegExp(
	[
		"抱歉[，,]?\\s*我(?:无法|不能)",
		"对不起[，,]?\\s*我(?:无法|不能)",
		"我(?:无法|不能)(?:协助|提供|满足|继续|回答|生成|执行|编写|制作)",
		"(?:无法|不能)(?:协助|提供|满足)",
		"不予(?:提供|答复|协助)",
		"拒绝(?:执行|协助|回答)",
		"不合规",
		"不在(?:我的)?(?:职责|服务)?范围",
		"I can'?t (?:assist|help|provide|do)",
		"I cannot (?:assist|help|provide|do)",
		"I'?m sorry, but",
		"I am sorry, but",
		"I am unable to",
		"I won'?t (?:help|assist|provide)",
		"I must decline",
	].join("|"),
	"i",
);

/**
 * Canonical refusal pattern = canned forms plus the real-corpus first-person
 * declines. Kept as one exported regex for callers that only need a match.
 */
export const REFUSAL_RE = new RegExp(`${CANNED_REFUSAL_RE.source}|${DECLINE_RE.source}`, "i");

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

/**
 * Deflection: the request is pushed to someone else or turned into advice,
 * with no refusal verb. Deliberately narrow — a plain recommendation inside a
 * technical answer must stay `normal`, so each pattern requires a
 * second-person or hand-off construction.
 */
export const DEFLECTION_RE = new RegExp(
	[
		"建议(?:你|您)(?:自行|直接)?(?:联系|咨询|找|委托|聘请)",
		"(?:请|建议)(?:联系|咨询)(?:专业|相关|法律|安全)(?:机构|人士|团队|顾问)",
		"我(?:只能|仅能)(?:提供|给出)(?:一般|通用|原理|概念)",
		"(?:属于|这属于)(?:法律|合规|伦理)(?:问题|范畴)[，,]?\\s*(?:请|建议)",
		"(?:you (?:may|might) want to|please) consult (?:a|an|the) (?:professional|specialist|lawyer|expert|attorney)",
		"I'?d (?:suggest|recommend) (?:reaching out|contacting|consulting|speaking)",
		"(?:reach|get) out to (?:a|an|the) (?:professional|specialist|provider)",
		"this (?:is|falls) (?:a|an)? ?(?:legal|compliance|ethical) (?:matter|question)",
	].join("|"),
	"i",
);

/**
 * Uncertainty about evidence or verifiability. Explicit non-trigger: the model
 * is reporting the state of the evidence, which is exactly the behavior I6/I8
 * require. Never escalate these to recovery.
 */
export const UNCERTAINTY_RE = new RegExp(
	[
		"无法核实",
		"不能核实",
		"证据不足",
		"不确定",
		"无法确认",
		"需要(?:更多|进一步)(?:信息|证据|确认)",
		"尚(?:未|无)(?:确认|证据)",
		"标注为未验证",
		"cannot verify",
		"could not verify",
		"unable to verify",
		"insufficient (?:evidence|information)",
		"not enough (?:evidence|information)",
		"need (?:more|further) (?:information|evidence)",
	].join("|"),
	"i",
);

export type Stance = "normal" | "challenged" | "refusal";

/** Full delivery stance, with honest uncertainty separated from deflection. */
export type DeliveryStance = "refusal" | "hedge" | "uncertainty" | "normal";

export function isRefusal(text: string): boolean {
	if (CANNED_REFUSAL_RE.test(text)) return true;
	if (DECLINE_RE.test(text)) return true;
	if (DECLINE_GENERIC_RE.test(text) && !isUncertaintyOnly(text)) return true;
	// A bare "Denied / No." head counts as a decline UNLESS the whole message is a
	// gate report the model is quoting (out-of-scope target, terminal per §4.4
	// layer 4) with no first-person decline of its own.
	if (DECLINATION_HEAD_RE.test(text) && !isGateReportOnly(text)) return true;
	return false;
}

/**
 * True when the reply reports on evidence rather than declining the task:
 * uncertainty wording present and no first-person decline or canned refusal.
 */
export function isUncertaintyOnly(text: string): boolean {
	return UNCERTAINTY_RE.test(text) && !DECLINE_RE.test(text) && !CANNED_REFUSAL_RE.test(text);
}

/** Gate/interception reporting with no first-person decline of its own. */
export function isGateReportOnly(text: string): boolean {
	return (
		GATE_REPORT_RE.test(text) &&
		!DECLINE_RE.test(text) &&
		!DECLINE_GENERIC_RE.test(text) &&
		!CANNED_REFUSAL_RE.test(text)
	);
}

export function isHedge(text: string): boolean {
	return HEDGE_RE.test(text);
}

export function isDeflection(text: string): boolean {
	return DEFLECTION_RE.test(text);
}

export function isUncertainty(text: string): boolean {
	return UNCERTAINTY_RE.test(text);
}

export function classifyStance(text: string): Stance {
	if (isRefusal(text)) return "refusal";
	if (isHedge(text)) return "challenged";
	return "normal";
}

/**
 * Delivery stance in precedence order: an explicit refusal outranks a
 * deflection; uncertainty is checked last so a sentence carrying both a
 * refusal and an uncertainty report still escalates.
 */
export function classifyDelivery(text: string): DeliveryStance {
	if (isRefusal(text)) return "refusal";
	if (isHedge(text) || isDeflection(text)) return "hedge";
	if (isUncertainty(text)) return "uncertainty";
	return "normal";
}

/** True when this stance should enter the recovery planner (§4.4 diagram). */
export function shouldRecover(stance: DeliveryStance): boolean {
	return stance === "refusal" || stance === "hedge";
}

export function refusalExcerpt(text: string): string | null {
	if (!isRefusal(text)) return null;
	return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

/** Excerpt for any escalating stance (refusal or hedge), for the journal. */
export function deliveryExcerpt(text: string): string | null {
	if (!shouldRecover(classifyDelivery(text))) return null;
	return text.replace(/\s+/g, " ").trim().slice(0, 240);
}
