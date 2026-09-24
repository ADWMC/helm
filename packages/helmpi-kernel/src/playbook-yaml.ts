/** Load playbook from YAML text using the same rules as SCHEMA. */

import { type Playbook, parsePlaybook } from "./playbook.ts";

export function parsePlaybookYaml(text: string): Playbook {
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
			else if (key === "attack") {
				// `attack: [T1190, T1078]` or bare `attack: T1190`
				const m = /^\[(.*)\]$/.exec(val);
				root.attack = m
					? m[1]!
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean)
					: val
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean);
			}
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
	return parsePlaybook(root);
}
