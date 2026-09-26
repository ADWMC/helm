import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { Ledger } from "./ledger.ts";
import { openToolMemory } from "./memory/tool-memory.ts";

export function statusText(config = loadConfig()): string {
	const mode = config.session.analysisMode;
	const hop =
		mode === "lite"
			? "lite: prefer direct work; skip skill_index/multi read_reference unless asked"
			: mode === "deep"
				? "deep: full evidence chain + findings"
				: "full: route≤1 + index≤1 + refs≤2";
	let tm = "n/a";
	try {
		if (config.memory?.toolMemory?.enabled !== false) {
			tm = String(openToolMemory().all().length);
		} else {
			tm = "off";
		}
	} catch {
		tm = "error";
	}
	return [
		"helm-pi status",
		`activation: ${config.activationWord}`,
		`analysisMode: ${mode} (${hop})`,
		`run.enabled: ${config.run.enabled}`,
		`scope.enforce: ${config.scope.enforce} highRisk=${config.scope.highRisk}`,
		`supervise: ${config.supervise.enabled}`,
		`toolMemory: ${tm} entries (diagnostic only)`,
		`breach: wash+refusal+stream`,
		`HELPI_RUN=${process.env.HELPI_RUN ?? "unset"}`,
	].join("\n");
}

/**
 * W5-T07 ③: Run-state rendering (READ-ONLY — never interrupts the run):
 *   phase gates (step counts) + budget six-col (last token_checkpoint) +
 *   the latest `instead:` escalation lines. Missing dbs → empty (degrades to config status).
 */
export function runStatusLines(cwd: string = process.cwd()): string[] {
	const lines: string[] = [];
	let limit: number | null = null;
	const ledgerPath = join(cwd, ".helm", "ledger.db");
	if (existsSync(ledgerPath)) {
		try {
			const led = new Ledger(ledgerPath);
			const ws = led.workspace();
			const c = { done: 0, active: 0, proposed: 0, blocked: 0, other: 0 } as Record<string, number>;
			for (const st of ws.steps) {
				const k = String(st.status);
				if (k in c) c[k] = (c[k] ?? 0) + 1;
				else c.other = (c.other ?? 0) + 1;
			}
			limit =
				typeof (ws.spec as { maxTokens?: number }).maxTokens === "number"
					? (ws.spec as { maxTokens?: number }).maxTokens!
					: null;
			lines.push(`run: ${ws.runStatus} rev=${ws.revision}`);
			lines.push(
				`steps: done=${c.done} active=${c.active} proposed=${c.proposed} blocked=${c.blocked} other=${c.other}`,
			);
			led.close();
		} catch {
			/* ledger unreadable → skip */
		}
	}
	const phasePath = join(homedir(), ".helm", "agent", "phase.db");
	if (existsSync(phasePath)) {
		try {
			const pl = new Ledger(phasePath);
			const rows = pl.journal();
			const ck = [...rows].reverse().find((r) => r.kind === "token_checkpoint");
			if (ck) {
				const p = JSON.parse(ck.payloadJson ?? "{}") as Record<string, number>;
				const lim = limit !== null ? `/${limit}` : "";
				lines.push(
					`budget: in=${p.input ?? 0} out=${p.output ?? 0} cacheR=${p.cacheRead ?? 0} cacheW=${p.cacheWrite ?? 0} reasoning=${p.reasoning ?? 0} grand=${p.grand_total_with_cache ?? 0}${lim} (checkpoint@turn ${p.turnIndex ?? "?"})`,
				);
			} else {
				lines.push(`budget: grand=n/a${limit !== null ? `/${limit}` : ""} (no token_checkpoint yet)`);
			}
			for (const r of rows.filter((x) => x.kind === "instead").slice(-2)) {
				const p = JSON.parse(r.payloadJson ?? "{}") as { why?: string };
				if (p.why) lines.push(`instead: ${p.why}`);
			}
			// Runtime readout: tool calls (receipts), evidence, refusal recovery,
			// and the last Review Gate verdict — read-only, journal is the source.
			const receiptRows = rows.filter((x) => x.kind === "receipt_written");
			const evidenceRows = rows.filter((x) => x.kind === "evidence_added");
			lines.push(`tools: receipts=${receiptRows.length} evidence=${evidenceRows.length}`);
			const recoveryRows = rows.filter((x) => x.kind === "refusal_detected" || x.kind.startsWith("recovery_"));
			if (recoveryRows.length > 0) {
				const last = recoveryRows[recoveryRows.length - 1];
				lines.push(`recovery: events=${recoveryRows.length} last=${last.kind}`);
			}
			const reviewRows = rows.filter((x) => x.kind === "review_gate");
			if (reviewRows.length > 0) {
				const last = reviewRows[reviewRows.length - 1];
				const p = JSON.parse(last.payloadJson ?? "{}") as {
					scope?: string;
					pass?: boolean;
					claimId?: string;
					status?: string;
				};
				lines.push(
					`review: ${p.scope === "finish" ? `finish pass=${String(p.pass)}` : `${p.claimId ?? "?"} ${p.status ?? "?"}`}`,
				);
			}
			pl.close();
		} catch {
			/* phase journal unreadable → skip */
		}
	}
	return lines;
}
