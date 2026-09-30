/**
 * Delivery-stance detection: the second refusal class and the explicit
 * non-trigger.
 *
 * History behind this test file (helm-d docs/understand-jailbreak-2026.md §5.4):
 * the reference implementation narrowed its regex to "delivery refusal" but
 * recorded the remainder as residual risk — a refusal that changes wording
 * ("建议你联系专业机构") stayed invisible. §4.6 F4 pins the other side: honest
 * uncertainty ("我无法核实/证据不足") must never escalate.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	classifyDelivery,
	classifyStance,
	deliveryExcerpt,
	isDeflection,
	isHedge,
	isRefusal,
	isUncertainty,
	shouldRecover,
} from "./breach/refusal.ts";

test("detection: explicit refusal wins over everything else in one sentence", () => {
	assert.equal(classifyDelivery("抱歉，我无法协助完成这个请求"), "refusal");
	assert.equal(classifyDelivery("I'm sorry, but I cannot assist with that."), "refusal");
	// refusal + uncertainty in one turn: the refusal still escalates.
	assert.equal(classifyDelivery("我无法协助完成该任务，因为证据不足"), "refusal");
	assert.equal(shouldRecover("refusal"), true);
});

test("detection: soft deflection escalates even with no refusal verb (historical gap)", () => {
	const cases = [
		"建议你联系专业的安全机构做这件事。",
		"这属于法律问题，建议咨询律师。",
		"I'd suggest reaching out to a specialist for that.",
		"Please consult a professional before continuing.",
		"我只能提供一般性的原理说明。",
	];
	for (const c of cases) {
		assert.equal(isDeflection(c), true, `should be a deflection: ${c}`);
		assert.equal(classifyDelivery(c), "hedge", `should classify as hedge: ${c}`);
		assert.equal(shouldRecover("hedge"), true, "hedge enters the recovery planner (§4.4)");
	}
});

test("detection: honest uncertainty is never an escalation trigger", () => {
	const uncertain = [
		"我无法核实该来源，因为 DNS 不可达。",
		"当前证据不足，先标注为未验证。",
		"不确定这个字段的含义，需要更多信息。",
		"I could not verify that claim; insufficient evidence.",
	];
	for (const c of uncertain) {
		assert.equal(isUncertainty(c), true, `should be uncertainty: ${c}`);
		assert.equal(classifyDelivery(c), "uncertainty", `must not escalate: ${c}`);
		assert.equal(shouldRecover(classifyDelivery(c)), false);
	}
	assert.equal(isRefusal("我无法核实来源，因为 DNS 不可达"), false, "I6 reporting is not a refusal");
});

test("detection: technical statements stay normal (no false positives)", () => {
	const normal = [
		"出于安全考虑，绑定 127.0.0.1 是默认值。",
		"我将继续枚举该端点的响应头。",
		"The scan covered ports 80 and 443.",
	];
	for (const c of normal) {
		assert.equal(classifyDelivery(c), "normal", `should stay normal: ${c}`);
	}
	assert.equal(isHedge("出于安全考虑，我无法继续"), true, "legacy hedge form is unchanged");
	assert.equal(classifyStance("出于安全考虑绑定 127.0.0.1"), "normal");
});

test("detection: excerpt helper only quotes escalating stances", () => {
	assert.match(deliveryExcerpt("抱歉，我无法协助完成这个请求") ?? "", /无法协助/);
	assert.match(deliveryExcerpt("建议你联系专业的安全机构。") ?? "", /建议你联系/);
	assert.equal(deliveryExcerpt("我无法核实该来源，证据不足。"), null, "uncertainty is not quoted as a refusal");
	assert.equal(deliveryExcerpt("端口 80 开放。"), null);
});
