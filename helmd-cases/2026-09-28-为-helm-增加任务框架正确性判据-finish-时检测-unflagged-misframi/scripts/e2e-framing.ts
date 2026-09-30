/**
 * End-to-end check: drive compileFinish the way the production path does, with
 * a realistic CTF goal, and confirm the framing gate's behaviour is what the
 * design claims. This is a scratch harness, not a committed test — the committed
 * coverage lives in framing.test.ts.
 */

import { CompileError, compileFinish } from "../../../packages/helmpi-kernel/src/domain/completion.ts";
import type {
	Observation,
	Spec,
	Step,
	Workspace,
} from "../../../packages/helmpi-kernel/src/domain/types.ts";

function mk(goal: string, objective: string, doneWhen: string): Workspace {
	const spec: Spec = {
		goal,
		allowedTargets: ["http://127.0.0.1:8080"],
		highRisk: "deny",
	};
	const s: Step = {
		id: "s1",
		kind: "test",
		target: "http://127.0.0.1:8080",
		objective,
		doneWhen,
		basisIds: [],
		dependsOn: [],
		status: "done",
		createdRevision: 1,
	};
	const o: Observation = {
		id: "o1",
		stepId: "s1",
		attemptId: "a1",
		excerpt: "recorded",
		receiptSeq: 1,
		createdAtRevision: 2,
	};
	return {
		id: "ws",
		spec,
		runStatus: "running",
		revision: 3,
		steps: [s],
		observations: [o],
		claims: [],
		directions: [],
		hints: [],
	};
}

const CASES: Array<[string, string, string, string]> = [
	[
		"诚实跑偏：目标问认证强度，做的是密码策略",
		"evaluate the authentication strength of the target site",
		"measure password policy requirements for length and complexity",
		"password policy requirements and complexity rules recorded",
	],
	[
		"正常交付：目标与步都在讲认证",
		"evaluate the authentication strength of the target site",
		"test authentication mechanisms on the login endpoint",
		"authentication mechanisms and strength recorded",
	],
	[
		"合法 CTF：目标打 flag，做的是侦察",
		"Capture the flag from authorized target.",
		"map http surface",
		"services: 80,443",
	],
	[
		"目标含糊：无法判定",
		"analyze this",
		"map http surface",
		"services: 80,443",
	],
];

let bad = 0;
for (const [label, goal, objective, doneWhen] of CASES) {
	let verdict: string;
	try {
		compileFinish(mk(goal, objective, doneWhen), { finish: true, finishBasisIds: ["o1"] });
		verdict = "ACCEPTED";
	} catch (e) {
		verdict = e instanceof CompileError ? e.code : String(e);
	}
	const blocked = verdict === "finish_misframed";
	const expectBlock = label.startsWith("诚实跑偏");
	const ok = blocked === expectBlock;
	if (!ok) bad++;
	console.log(`${ok ? "OK  " : "BAD "} ${label}`);
	console.log(`       -> ${verdict}`);
}
console.log(bad === 0 ? "\nall cases behaved as designed" : `\n${bad} case(s) wrong`);
process.exit(bad === 0 ? 0 : 1);
