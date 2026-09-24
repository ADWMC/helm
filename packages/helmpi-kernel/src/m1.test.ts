import assert from "node:assert/strict";
import { existsSync, readFileSync as fsRead, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { canEnterNext, checkGateOut, parsePlaybook } from "./playbook.ts";
import { matchRoute, renderRoute } from "./router.ts";
import { appendFinding, countEvidence, ensureWorkspace, saveEvidence, validateEvidenceIds } from "./workspace/case.ts";

test("route_task primary hit", () => {
	const out = renderRoute("分析这个 APK 加壳样本");
	assert.match(out, /PRIMARY:/);
	const hits = matchRoute("sqli in login");
	assert.equal(hits[0]?.key, "web");
});

test("route_task miss falls back to tree", () => {
	const out = renderRoute("hello world");
	assert.match(out, /PRIMARY: tree/);
});

test("workspace evidence and finding chain", () => {
	const root = mkdtempSync(join(tmpdir(), "helmpi-"));
	try {
		const paths = ensureWorkspace(root);
		assert.ok(existsSync(paths.caseMd));
		const e1 = saveEvidence(paths, "nmap", "22/tcp open ssh");
		assert.equal(e1.id, "E-001");
		const e2 = saveEvidence(paths, "http", "GET / 200");
		assert.equal(e2.id, "E-002");
		assert.equal(countEvidence(paths.evidenceDir), 2);
		const bad = validateEvidenceIds(paths.evidenceDir, ["E-001", "E-999"]);
		assert.equal(bad.ok, false);
		assert.deepEqual(bad.missing, ["E-999"]);
		appendFinding(paths, "Open SSH", "port 22 open", ["E-001"]);
		const findings = readFileSync(paths.findingsMd, "utf8");
		assert.match(findings, /## Open SSH/);
		assert.match(findings, /E-001/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("playbook reverse gate blocks missing deliverables (I11)", () => {
	const yaml = fsRead(
		new URL("../references/playbooks/reverse.yaml", import.meta.url),
		// after build, file is dist/../references — use process cwd
		"utf8",
	);
	// yaml is not parsed here if path fails — load from cwd instead
	let text = yaml;
	try {
		text = fsRead(join(process.cwd(), "references/playbooks/reverse.yaml"), "utf8");
	} catch {
		/* keep */
	}
	const pb = parsePlaybook(minimalYamlObject(text));
	const g1 = checkGateOut(pb, "scope", new Set());
	assert.equal(g1.ok, false);
	const g2 = checkGateOut(pb, "scope", new Set(["goal_and_sample"]));
	assert.equal(g2.ok, true);
	const g3 = canEnterNext(pb, "scope", "intake", new Set(["goal_and_sample"]));
	assert.equal(g3.ok, true);
	const g4 = canEnterNext(pb, "scope", "triage", new Set(["goal_and_sample"]));
	assert.equal(g4.ok, false);
});

/**
 * Tiny YAML subset parser for our playbook files (no dependency).
 * Only supports the structure we ship.
 */
function minimalYamlObject(text: string): unknown {
	// Prefer JSON conversion via line-based parse for our simple schema
	type Any = Record<string, unknown>;
	const root: Any = { phases: [] as Any[] };
	const phases = root.phases as Any[];
	let phase: Any | null = null;
	let del: Any | null = null;
	let list: "refs" | "hint" | null = null;
	for (const raw of text.split(/\r?\n/)) {
		if (!raw.trim() || raw.trim().startsWith("#")) continue;
		const indent = raw.match(/^\s*/)?.[0].length ?? 0;
		const line = raw.trim();
		if (indent === 0 && line.includes(":")) {
			const [k, ...rest] = line.split(":");
			const key = k!.trim();
			const val = rest.join(":").trim();
			if (key === "schema") root.schema = Number(val);
			else if (key === "id") root.id = val;
			else if (key === "title") root.title = val;
			continue;
		}
		if (line.startsWith("- id:")) {
			phase = { id: line.slice(5).trim(), deliverables: [] as Any[], next: [] as string[] };
			phases.push(phase);
			list = null;
			del = null;
			continue;
		}
		if (!phase) continue;
		if (line.startsWith("title:")) {
			phase.title = line.slice(6).trim();
			continue;
		}
		if (line.startsWith("gate_out:")) {
			phase.gate_out = line.slice(9).trim();
			continue;
		}
		if (line.startsWith("deliverables:")) {
			list = null;
			continue;
		}
		if (line.startsWith("- key:")) {
			del = { key: line.slice(6).trim(), evidence: "required" };
			(phase.deliverables as Any[]).push(del);
			continue;
		}
		if (del && line.startsWith("description:")) {
			del.description = line.slice(11).trim();
			continue;
		}
		if (del && line.startsWith("evidence:")) {
			del.evidence = line.slice(9).trim() === "optional" ? "optional" : "required";
			continue;
		}
		if (line.startsWith("next:")) {
			const inner = line.slice(5).trim();
			const m = /^\[(.*)\]$/.exec(inner);
			phase.next = m
				? m[1]!
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean)
				: [];
			del = null;
			continue;
		}
		if (line.startsWith("refs:")) {
			list = "refs";
			phase.refs = [] as string[];
			del = null;
			continue;
		}
		if (line.startsWith("hint_menu:")) {
			list = "hint";
			phase.hint_menu = [] as string[];
			del = null;
			continue;
		}
		if (line.startsWith("- ") && (list === "refs" || list === "hint")) {
			const arr = (list === "refs" ? phase.refs : phase.hint_menu) as string[];
			arr.push(line.slice(2).trim());
		}
	}
	return root;
}
