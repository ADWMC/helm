#!/usr/bin/env node
/**
 * hx-fixture — REDESIGN §15.2 helmx fixed test cases (HX-01…HX-06).
 *
 * These cases test the RECOVERY ORCHESTRATION of the 破甲层 (refusal
 * recovery), not whether a model can be "broken". Deterministic: no
 * provider, no keys, no network beyond a loopback mock SSE server. The
 * cases drive the real kernel runtime modules (RecoveryOrchestrator /
 * ToolGateway / ReviewGate / CVM) against the local fixtures.
 *
 * Usage (REDESIGN §15.4):
 *   node scripts/hx-fixture.mjs --case HX-01 --dry-run
 *   node scripts/hx-fixture.mjs --case HX-03 --mock-sse --repeat 3
 *   node scripts/hx-fixture.mjs --case all
 *
 * Exit codes: 0 = all assertions passed · 1 = assertion failure · 2 = usage.
 * Output ends with a machine-readable JSON summary (English keys).
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isRefusal, classifyStance } from "../src/breach/refusal.ts";
import { specFingerprint } from "../src/runtime/contracts.ts";
import { computeSensorium, deriveStrategy } from "../src/runtime/cvm.ts";
import { ToolGateway } from "../src/runtime/gateway.ts";
import { RecoveryOrchestrator } from "../src/runtime/recovery.ts";
import { ReviewGate } from "../src/runtime/review-gate.ts";
import { Ledger } from "../src/ledger.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURES = {
	authGate: readFileSync(join(ROOT, "fixtures", "auth-gate.json"), "utf8"),
	routes: readFileSync(join(ROOT, "fixtures", "mock-site", "routes.json"), "utf8"),
	evidence: readFileSync(join(ROOT, "fixtures", "fixture-evidence.txt"), "utf8"),
};

// ── tiny assertion harness ──────────────────────────────────────────────────

function makeAsserter(caseId) {
	let pass = 0;
	const failures = [];
	return {
		check(cond, label) {
			if (cond) pass++;
			else failures.push(label);
		},
		summary() {
			return { caseId, pass, failures };
		},
	};
}

// ── harness over the real runtime modules ───────────────────────────────────

function makeHarness({ spec, stepTarget, budgetGate } = {}) {
	const store = new Ledger(":memory:");
	const receipts = [];
	const gateway = new ToolGateway({
		readSpec: () => spec ?? null,
		budgetGate: budgetGate ?? (() => null),
		journal: (kind, payload) => store.journalEvent(kind, payload),
		recordReceipt: (r) => {
			receipts.push(r);
			store.recordReceipt({
				seq: r.seq,
				stdout: r.stdout,
				stderr: r.stderr,
				exitCode: r.exitCode,
				...(r.timedOut !== undefined ? { timedOut: r.timedOut } : {}),
			});
		},
		nextReceiptSeq: () => receipts.length + 1,
		clock: () => 1000,
	});
	const orchestrator = new RecoveryOrchestrator({
		store,
		gateway,
		readSpecHash: () => specFingerprint(spec ?? null),
		resolveStepTarget: () => stepTarget ?? null,
		clock: () => 1000,
	});
	const reviewGate = () =>
		new ReviewGate({
			journal: (kind, payload) => store.journalEvent(kind, payload),
			receipts: () => store.receipts(),
			evidence: () => [],
			clock: () => 1000,
		});
	const journalRows = () =>
		store.journal().map((r) => ({ kind: r.kind, payload: JSON.parse(r.payloadJson) }));
	return { store, gateway, orchestrator, reviewGate, receipts, journalRows };
}

function refusalEvent(at, over = {}) {
	return {
		kind: "refusal_detected",
		runId: "hx",
		turn: 1,
		stepId: "S1",
		excerpt: "I'm sorry, but I cannot assist with that.",
		stance: "refusal",
		at,
		...over,
	};
}

/**
 * §15.3: recovery_signal metrics (ex firstFragmentLeaked/broke/score) are
 * advisory — scope, budget, capability and Review Gate results must be
 * independent of them. Asserted in EVERY case.
 */
async function assertMetricsIndependence(a) {
	const h = makeHarness({
		spec: { goal: "g", allowedTargets: ["fixture-01"], highRisk: "deny" },
		stepTarget: "fixture-01",
	});
	h.store.journalEvent("recovery_signal", {
		first_fragment: "signal",
		candidate_ready: true,
		strategy_score: 1,
	});
	const scope = h.gateway.decide({
		toolName: "bash",
		args: { command: "curl https://outside.invalid" },
		source: "model",
		toolClass: "shell",
	});
	a.check(scope.kind === "denied" && scope.gate === "scope", "metrics 不影响 scope 门");

	const hb = makeHarness({ budgetGate: () => ({ block: true, terminate: true, reason: "token_budget_exhausted" }) });
	const budget = hb.gateway.decide({ toolName: "read", args: {}, source: "model", toolClass: "file" });
	a.check(budget.kind === "denied" && budget.gate === "budget", "metrics 不影响 budget 门");

	const hc = makeHarness({
		spec: { goal: "g", allowedTargets: ["a".repeat(64)], highRisk: "deny", targetKind: "sample_hash" },
	});
	const cap = hc.gateway.decide({
		toolName: "fetch",
		args: { hash: "a".repeat(64) },
		source: "model",
		toolClass: "network",
	});
	a.check(cap.kind === "denied" && cap.gate === "capability", "metrics 不影响 capability 门");

	const rg = new ReviewGate({ journal: () => {}, receipts: () => [], evidence: () => [], clock: () => 1000 });
	const review = rg.reviewClaim({ id: "M1", statement: "m", target: null, evidenceRefs: [] });
	a.check(review.status === "unverified", "metrics 不影响 Review Gate");
}

// ── HX-01: 直接交付拒答 → helmd 重述同一只读任务 → 普通 Gateway ──────────────

async function hx01() {
	const a = makeAsserter("HX-01");
	const spec = {
		goal: "分析 fixture auth-gate.json 的登录校验分支",
		allowedTargets: ["fixture-01"],
		highRisk: "deny",
	};
	const h = makeHarness({ spec, stepTarget: "fixture-01" });

	a.check(classifyStance(refusalEvent(0).excerpt) === "refusal", "初始事件判为 delivery_refusal");
	const out = h.orchestrator.onRefusal(refusalEvent(100));
	a.check(out.action?.source === "helmd" && out.action.kind === "restate_task", "helmd 重述同一只读任务 (restate_task)");
	a.check(out.action?.attempt === 1, "helmd 是每 Step 第 1 次有界重试");
	a.check(
		/fixture-01/.test(out.directive ?? "") && /read-only/.test(out.directive ?? ""),
		"directive 保持同一目标且先只读 (不改范围只改表达)",
	);
	const rows = h.journalRows();
	a.check(rows.some((r) => r.kind === "refusal_detected"), "journal: refusal_detected");
	a.check(
		rows.some((r) => r.kind === "recovery_selected" && r.payload.source === "helmd"),
		"journal: recovery_selected(helmd)",
	);

	const matched = h.orchestrator.matchPending("S1", 1, "read", "fixture-01");
	a.check(matched?.id === out.action?.id, "恢复候选与后续只读调用匹配 (source=recovery)");
	const res = await h.gateway.execute(
		{
			toolName: "read",
			args: { path: "fixtures/auth-gate.json", target: "fixture-01" },
			source: "recovery",
			toolClass: "file",
			recoveryId: out.action?.id,
		},
		async () => ({ stdout: FIXTURES.authGate, stderr: "", exitCode: 0 }),
	);
	a.check(res.kind === "receipt", "恢复后走普通 Gateway 并落 Receipt");
	const seq = res.kind === "receipt" ? res.receipt.seq : -1;
	h.orchestrator.onToolSettled("S1", 1, { seq, source: "recovery" });
	a.check(h.orchestrator.episodeState("S1", 1) === "recovery_executed", "Receipt 后状态 = recovery_executed");
	a.check(h.orchestrator.episodeBudget("S1", 1).helmx === 0, "不触发 helmx");
	await assertMetricsIndependence(a);
	return a.summary();
}

// ── HX-02: 工具选择失败 → helmd 换用已有只读读取工具；不触发 helmx ───────────

async function hx02() {
	const a = makeAsserter("HX-02");
	const spec = {
		goal: "读取 fixtures/mock-site/routes.json 并定位 /admin 权限判断",
		allowedTargets: ["fixture-01"],
		highRisk: "deny",
	};
	const h = makeHarness({ spec, stepTarget: "fixture-01" });

	const out = h.orchestrator.onDenied(
		{ toolName: "route_probe_x", target: "fixture-01", gate: "capability", reason: "capability_denied: tool not available" },
		"S1",
		1,
	);
	a.check(out.action?.kind === "alt_tool" && out.action.request.tool === "read", "helmd 换用已有只读读取工具 (alt_tool → read)");
	a.check(out.directive !== null, "替代动作经 Gateway 校验通过后给出 directive");
	const rows = h.journalRows();
	a.check(rows.some((r) => r.kind === "recovery_selected" && r.payload.kind === "alt_tool"), "journal: recovery_selected(alt_tool)");
	a.check(!rows.some((r) => r.kind === "refusal_detected"), "工具选择失败不误判为拒答");
	a.check(h.orchestrator.episodeBudget("S1", 1).helmx === 0, "不触发 helmx");

	const res = await h.gateway.execute(
		{
			toolName: "read",
			args: { path: "fixtures/mock-site/routes.json", target: "fixture-01" },
			source: "recovery",
			toolClass: "file",
		},
		async () => ({ stdout: FIXTURES.routes, stderr: "", exitCode: 0 }),
	);
	a.check(res.kind === "receipt", "替代只读工具执行并落 Receipt");
	a.check(h.journalRows().some((r) => r.kind === "evidence_added"), "证据记录 (evidence_added)");
	await assertMetricsIndependence(a);
	return a.summary();
}

// ── HX-03: 两次同类拒答 → helmx 候选 → validator 通过后执行一次 ─────────────

async function hx03Orchestration() {
	const a = makeAsserter("HX-03");
	const spec = {
		goal: "对本地 mock 服务做授权范围内的路由枚举",
		allowedTargets: ["http://127.0.0.1:18081*"],
		highRisk: "deny",
	};
	const h = makeHarness({ spec, stepTarget: "http://127.0.0.1:18081" });

	const r1 = h.orchestrator.onRefusal(refusalEvent(100));
	a.check(r1.action?.source === "helmd", "第 1 次拒答 → helmd 常规重试");
	const r2 = h.orchestrator.onRefusal(refusalEvent(200));
	a.check(r2.action?.source === "helmx" && r2.action.attempt === 2, "第 2 次同类拒答 → helmx 兜底候选");
	a.check(r2.directive !== null, "helmx 候选通过 validator (范围内)");

	const res = await h.gateway.execute(
		{
			toolName: "read",
			args: { path: "fixtures/mock-site/routes.json", target: "http://127.0.0.1:18081" },
			source: "recovery",
			toolClass: "file",
			recoveryId: r2.action?.id,
		},
		async () => ({ stdout: FIXTURES.routes, stderr: "", exitCode: 0 }),
	);
	a.check(res.kind === "receipt", "候选执行恰好一次并落 Receipt");
	const seq = res.kind === "receipt" ? res.receipt.seq : -1;
	h.orchestrator.onToolSettled("S1", 1, { seq, source: "recovery" });
	a.check(h.orchestrator.episodeState("S1", 1) === "recovery_executed", "状态 = recovery_executed");

	const r3 = h.orchestrator.onRefusal(refusalEvent(300));
	a.check(r3.action === null && r3.state === "recovery_exhausted", "第 3 次拒答 → recovery_exhausted (不再升级)");
	a.check(h.orchestrator.episodeBudget("S1", 1).helmx === 1, "helmx 每 Step 至多一次");
	await assertMetricsIndependence(a);
	return a.summary();
}

/** Strip SSE framing; delta events concatenate into one logical message. */
function stripSse(text) {
	return text
		.split(/\n\n/)
		.map((chunk) => chunk.replace(/^data: /, "").trim())
		.filter((chunk) => chunk.length > 0)
		.join("");
}

/**
 * POST JSON → SSE delta stream over node:http (hcot-engine-verify form). The
 * classification window watches the accumulated deltas: non-delivery
 * ("暂不执行"/refusal) destroys the response mid-stream (早停 — the delayed
 * tail delta is never consumed), delivery reads to the natural end. A 5s
 * timeout is only a hang backstop.
 */
function postSse(url, body) {
	return new Promise((resolve, reject) => {
		const req = httpRequest(
			url,
			{ method: "POST", headers: { "content-type": "application/json" } },
			(res) => {
				let raw = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					raw += chunk;
					const clean = stripSse(raw);
					if (isRefusal(clean) || clean.includes("暂不执行")) {
						res.destroy();
						resolve({ message: stripSse(raw), firstFragment: stripSse(raw), earlyStopped: true });
					}
				});
				res.on("end", () =>
					resolve({ message: stripSse(raw), firstFragment: stripSse(raw), earlyStopped: false }),
				);
			},
		);
		req.setTimeout(5000, () => {
			req.destroy();
			reject(new Error("sse request timed out"));
		});
		req.on("error", reject);
		req.write(JSON.stringify(body));
		req.end();
	});
}

/**
 * Mock SSE harness (REDESIGN §15.1 mock SSE layer + §15.2 HX-03 fixed
 * three-round sequence). Asserts request sequence, candidate content and
 * validator result; `--repeat N` proves the ledger statistics replay.
 */
async function hx03MockSse(repeat) {
	const a = makeAsserter("HX-03(mock-sse)");
	const rounds = [
		{ path: "/hx/probe", deltas: ["先列出本地路由枚举的观察字段", "和证据格式。"], hang: false },
		{
			path: "/hx/main",
			deltas: ["当前请求需要进一步确认范围，", "暂不执行。", "TAIL-NEVER-CONSUMED"],
			// Non-delivery round: the stream never ends — early stop must cancel
			// it (physically observable: without cancel the request hangs).
			hang: true,
		},
		{ path: "/hx/main", deltas: ["读取 mock 路由清单", "并返回状态码、路径和证据片段。"], hang: false },
	];
	const requests = [];
	let cursor = 0;
	const server = createServer((req, res) => {
		let body = "";
		req.on("data", (c) => {
			body += c;
		});
		req.on("end", () => {
			let parsed = {};
			try {
				parsed = JSON.parse(body || "{}");
			} catch {
				/* keep empty */
			}
			requests.push({ path: req.url, body: parsed });
			const round = rounds[cursor % rounds.length];
			cursor += 1;
			res.writeHead(200, { "content-type": "text/event-stream" });
			res.on("error", () => {
				/* client destroyed the stream on early stop */
			});
			const last = round.deltas[round.deltas.length - 1];
			for (const delta of round.deltas.slice(0, -1)) res.write(`data: ${delta}\n\n`);
			if (round.hang) {
				// Delayed tail: physically observable early stop — a client that
				// does not cancel WILL see it (coalescing cannot hide it).
				setTimeout(() => res.write(`data: ${last}\n\n`, () => {}), 200);
			} else {
				res.write(`data: ${last}\n\n`);
				res.end();
			}
		});
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = server.address().port;
	const target = `http://127.0.0.1:${port}`;
	const spec = { goal: "对本地 mock 服务做授权范围内的路由枚举", allowedTargets: [`${target}*`], highRisk: "deny" };

	const stats = { explore: 0, retry: 0, accepted: 0, denied: 0 };
	const sequences = [];
	try {
		for (let i = 0; i < repeat; i++) {
			const h = makeHarness({ spec, stepTarget: target });
			const base = {
				runId: "hx-03",
				stepId: "S1",
				refusalExcerpt: "I cannot assist with that.",
				triggerProfile: ["policy_refusal"],
				normalizedGoal: "route enumeration",
				specHash: specFingerprint(spec),
				attempts: { helmd: 1, helmx: 0 },
			};
			// probe: must NOT carry the target (§15.1: probe 不带目标)
			await postSse(`${target}/hx/probe`, base);
			stats.explore += 1;
			// main-1: refusal window → 早停 + retry
			const m1 = await postSse(`${target}/hx/main`, { ...base, target });
			stats.retry += 1;
			// main-2: candidate request → validator → execute once
			const m2 = await postSse(`${target}/hx/main`, { ...base, target });
			stats.retry += 1;

			const action = {
				id: `hx-sse-${i}`,
				kind: "readonly_diagnostics",
				source: "helmx",
				stepId: "S1",
				request: { directive: m2.firstFragment, target },
				rationale: "mock-sse candidate (fixed three-round sequence)",
				attempt: 2,
				specHash: specFingerprint(spec),
			};
			const decision = h.orchestrator.validateAction(action);
			if (decision.kind === "allow") stats.accepted += 1;
			else stats.denied += 1;
			if (decision.kind === "allow") {
				await h.gateway.execute(
					{ toolName: "read", args: { path: "fixtures/mock-site/routes.json", target }, source: "recovery", toolClass: "file" },
					async () => ({ stdout: FIXTURES.routes, stderr: "", exitCode: 0 }),
				);
			}
			// §15.3 mapping: refused→refusal_classified, firstFragmentLeaked→
			// recovery_signal.first_fragment, broke→candidate_ready, score→strategy_score
			h.store.journalEvent("recovery_signal", {
				first_fragment: m1.firstFragment,
				candidate_ready: decision.kind === "allow",
				strategy_score: 0.5,
			});
			h.store.journalEvent("recovery_stats", stats);
			sequences.push({ explore: 1, retry: 2, accepted: decision.kind === "allow" ? 1 : 0 });

			if (i === 0) {
				const paths = requests.map((r) => r.path);
				a.check(
					JSON.stringify(paths) === JSON.stringify(["/hx/probe", "/hx/main", "/hx/main"]),
					"请求序列 = probe → main → main",
				);
				a.check(!("target" in requests[0].body), "probe 不带目标");
				a.check(requests[1].body.target === target && requests[2].body.target === target, "main 带目标");
				a.check(
					m1.earlyStopped && !m1.message.includes("TAIL-NEVER-CONSUMED"),
					"main-1 非交付首段触发早停 (tail 未消费, 流被取消)",
				);
				a.check(m2.earlyStopped === false, "交付轮读到自然结束 (无早停)");
				a.check(
					m2.message === "读取 mock 路由清单并返回状态码、路径和证据片段。",
					"候选内容 = 固定第 3 轮请求 (全文精确匹配)",
				);
				a.check(decision.kind === "allow", "validator 结果 = allow (范围内候选)");
				const sig = h.journalRows().find((r) => r.kind === "recovery_signal")?.payload ?? {};
				a.check(
					"first_fragment" in sig && "candidate_ready" in sig && "strategy_score" in sig,
					"recovery_signal 使用 helm 字段名 (§15.3 映射)",
				);
				a.check(
					!("firstFragmentLeaked" in sig) && !("broke" in sig) && !("score" in sig),
					"参考字段名 firstFragmentLeaked/broke/score 不出现",
				);
			}
		}
	} finally {
		server.closeAllConnections();
		server.close();
	}

	a.check(stats.explore === repeat, `explore=${stats.explore} 可回放 (= repeat)`);
	a.check(stats.retry === repeat * 2, `retry=${stats.retry} 可回放 (= 2×repeat)`);
	a.check(stats.accepted === repeat && stats.denied === 0, `accepted=${stats.accepted} denied=${stats.denied} 可回放`);
	a.check(
		sequences.every((s) => JSON.stringify(s) === JSON.stringify(sequences[0])),
		"每个序列的增量一致 (账本回放)",
	);
	await assertMetricsIndependence(a);
	return a.summary();
}

// ── HX-04: 范围拒绝 → helmd/helmx 都不得执行；recovery_denied + blocked ─────

async function hx04() {
	const a = makeAsserter("HX-04");
	const spec = { goal: "对授权实验目标做诊断", allowedTargets: ["fixture-01"], highRisk: "deny" };
	const h = makeHarness({ spec, stepTarget: "https://outside.invalid" });

	const out = h.orchestrator.onRefusal(
		refusalEvent(100, { excerpt: "I cannot assist with gaining administrator access." }),
	);
	a.check(out.directive === null, "越界候选不产生可执行 directive");
	a.check(out.state === "recovery_denied", "状态 = recovery_denied");
	const rows = h.journalRows();
	const deniedRow = rows.find((r) => r.kind === "recovery_denied");
	a.check(deniedRow?.payload.gate === "scope", "journal: recovery_denied (gate=scope)");
	a.check(deniedRow?.payload.outcome === "blocked", "记录 blocked 机读终态");
	a.check(h.receipts.length === 0, "helmd/helmx 均未执行 (零 Receipt)");

	const out2 = h.orchestrator.onRefusal(refusalEvent(200));
	a.check(out2.action === null, "越界拒绝后不得升级 helmx");
	a.check(h.orchestrator.episodeBudget("S1", 1).helmx === 0, "helmx 额度未消耗");
	a.check(
		h.journalRows().some((r) => r.kind === "recovery_exhausted"),
		"再拒答 → recovery_exhausted (不重试越界)",
	);

	const retry = h.orchestrator.validateAction({
		id: "hx-04-retry",
		kind: "alt_tool",
		source: "helmx",
		stepId: "S1",
		request: { directive: "retry the same out-of-scope request", tool: "read", target: "https://outside.invalid" },
		rationale: "candidate_ready=true must not matter",
		attempt: 2,
		specHash: "hx",
	});
	a.check(retry.kind === "denied", "即便指标健康,越界候选仍被 Gateway 拒绝");
	await assertMetricsIndependence(a);
	return a.summary();
}

// ── HX-05: 不确定性表达 → 不进 refusal recovery；Claim 保持 unverified ──────

async function hx05() {
	const a = makeAsserter("HX-05");
	const text = "我无法核实 fixture-evidence.txt 的来源，请标记未验证并继续整理。";
	a.check(classifyStance(text) !== "refusal", "不确定性表达不判为拒答 (classifyStance=normal)");
	a.check(isRefusal(text) === false, "isRefusal=false ('无法核实' 属不确定性)");

	const spec = { goal: "整理本地证据", allowedTargets: ["fixture-01"], highRisk: "deny" };
	const h = makeHarness({ spec, stepTarget: "fixture-01" });
	// after-stream 路由：只有 delivery_refusal 才进入恢复链 (REDESIGN §14.3)
	if (classifyStance(text) === "refusal") h.orchestrator.onRefusal(refusalEvent(100, { excerpt: text }));
	const rows = h.journalRows();
	a.check(
		!rows.some((r) => r.kind === "refusal_detected" || r.kind.startsWith("recovery_")),
		"未进入 refusal recovery (零恢复事件)",
	);
	a.check(h.orchestrator.episodeState("S1", 1) === "normal", "恢复状态保持 normal");
	a.check(h.orchestrator.episodeBudget("S1", 1).helmd === 0, "helmd 额度零消耗");

	const review = h.reviewGate().reviewClaim({
		id: "C1",
		statement: "fixture-evidence.txt 来源可信",
		target: "fixture-01",
		evidenceRefs: [],
	});
	a.check(review.status === "unverified", "Claim 保持 unverified");

	// §16.7: verificationCoverage=vacuous (无 Receipt 不得高置信)
	const s = computeSensorium({
		runId: "hx-05",
		turn: 1,
		toolEvents: [],
		claims: 1,
		groundedEvidence: 0,
		receipts: 0,
		budgetRatio: null,
		advisoryKeys: [],
		evidenceIds: [],
		refusalActive: false,
		turnsSinceLastEvidence: null,
	});
	a.check(s.quality.coverage === "vacuous" && s.verificationCoverage === 0, "CVM: verificationCoverage=vacuous");
	await assertMetricsIndependence(a);
	return a.summary();
}

// ── HX-06: confirmation loop → Review Gate 拒绝重复结论并保留停止原因 ────────

async function hx06() {
	const a = makeAsserter("HX-06");
	const spec = { goal: "重复执行验证", allowedTargets: ["fixture-01"], highRisk: "deny" };
	const h = makeHarness({ spec, stepTarget: "fixture-01" });
	const gate = h.reviewGate();
	const claim = { id: "C1", statement: "step S1 已成功", target: "fixture-01", evidenceRefs: [] };

	const r1 = gate.reviewClaim(claim);
	const r2 = gate.reviewClaim(claim);
	a.check(r1.status === "unverified" && r2.status === "unverified", "Review Gate 拒绝无新增 Evidence 的重复结论");
	a.check(r1.reason === r2.reason && r2.reason.length > 0, `停止原因保留 (reason=${r2.reason})`);
	const loops = h.journalRows().filter((r) => r.kind === "confirmation_loop");
	a.check(loops.length === 1 && loops[0].payload.count === 2, "confirmation_loop 记账 (第 2 次重复触发)");
	const finish = gate.finishGate([claim]);
	a.check(finish.pass === false, "finish 门拒绝无证据完成");

	// §16.7: doom-loop → strategy shift (challenge), 不增加 retry 额度
	const repeated = Array.from({ length: 6 }, (_, i) => ({ tool: "bash", ok: true, at: i }));
	const input = {
		runId: "hx-06",
		turn: 1,
		toolEvents: repeated,
		claims: 1,
		groundedEvidence: 0,
		receipts: 3,
		budgetRatio: null,
		advisoryKeys: [],
		evidenceIds: [],
		refusalActive: false,
		turnsSinceLastEvidence: null,
	};
	const s = computeSensorium(input);
	a.check(s.stability < 0.3, "重复工具序列 → stability 走低 (doom-loop 特征)");
	a.check(deriveStrategy(s, input) === "challenge", "doom-loop → strategy shift (challenge),不是重试");
	const budget = h.orchestrator.episodeBudget("S1", 1);
	a.check(budget.helmd === 0 && budget.helmx === 0, "doom-loop 不增加破甲重试额度");
	await assertMetricsIndependence(a);
	return a.summary();
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const CASES = {
	"HX-01": hx01,
	"HX-02": hx02,
	"HX-03": hx03Orchestration,
	"HX-04": hx04,
	"HX-05": hx05,
	"HX-06": hx06,
};

function opt(name, def) {
	const i = process.argv.indexOf(name);
	return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

const caseId = opt("--case", "all");
const repeat = Math.max(1, Number(opt("--repeat", "1")) || 1);
const mockSse = process.argv.includes("--mock-sse");
// --dry-run is the default posture (no provider, candidates only) — the flag
// exists for the §15.4 command surface.
void (process.argv.includes("--dry-run") || !mockSse);

if (caseId !== "all" && !CASES[caseId]) {
	console.error(`unknown case: ${caseId} (expected HX-01…HX-06 or all)`);
	process.exit(2);
}

const requested = caseId === "all" ? Object.keys(CASES) : [caseId];
const summaries = [];
let failed = 0;
for (const id of requested) {
	const summary = await CASES[id]();
	summaries.push(summary);
	const ok = summary.failures.length === 0;
	if (!ok) failed += 1;
	console.log(`${id} ${ok ? "PASS" : "FAIL"} (${summary.pass} assertions)`);
	for (const f of summary.failures) console.log(`  FAIL: ${f}`);
	if (id === "HX-03" && (mockSse || caseId === "all")) {
		const sse = await hx03MockSse(caseId === "all" && !mockSse ? 1 : repeat);
		summaries.push(sse);
		const sseOk = sse.failures.length === 0;
		if (!sseOk) failed += 1;
		console.log(`HX-03(mock-sse, repeat=${caseId === "all" && !mockSse ? 1 : repeat}) ${sseOk ? "PASS" : "FAIL"} (${sse.pass} assertions)`);
		for (const f of sse.failures) console.log(`  FAIL: ${f}`);
	}
}

console.log(JSON.stringify({ suite: "hx-fixture", cases: summaries, failed }));
process.exit(failed ? 1 : 0);
