/** Session / run helpers for evidence files on disk (M1 skeleton). */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface EvidenceEntry {
	readonly id: string;
	readonly label: string;
	readonly path: string;
}

export interface WorkspacePaths {
	readonly root: string;
	readonly sampleDir: string;
	readonly evidenceDir: string;
	readonly scriptsDir: string;
	readonly caseMd: string;
	readonly findingsMd: string;
}

export function ensureWorkspace(root: string): WorkspacePaths {
	const sampleDir = join(root, "sample");
	const evidenceDir = join(root, "evidence");
	const scriptsDir = join(root, "scripts");
	for (const d of [root, sampleDir, evidenceDir, scriptsDir]) {
		mkdirSync(d, { recursive: true });
	}
	const caseMd = join(root, "CASE.md");
	const findingsMd = join(root, "findings.md");
	if (!existsSync(caseMd)) {
		writeFileSync(
			caseMd,
			`# CASE\n\nstatus: open\n\n## resume\n1. goal:\n2. samples:\n3. key params:\n4. open questions:\n5. next:\n6. evidence ids:\n`,
			"utf8",
		);
	}
	if (!existsSync(findingsMd)) {
		writeFileSync(findingsMd, `# FINDINGS\n\n`, "utf8");
	}
	return { root, sampleDir, evidenceDir, scriptsDir, caseMd, findingsMd };
}

export function nextEvidenceId(evidenceDir: string): string {
	const files = existsSync(evidenceDir) ? readdirSync(evidenceDir).filter((f) => /^E-\d+/.test(f)) : [];
	let max = 0;
	for (const f of files) {
		const m = /^E-(\d+)/.exec(f);
		if (m) max = Math.max(max, Number(m[1]));
	}
	const next = max + 1;
	return `E-${String(next).padStart(3, "0")}`;
}

export function saveEvidence(paths: WorkspacePaths, label: string, content: string): EvidenceEntry {
	const id = nextEvidenceId(paths.evidenceDir);
	const safe = label.replace(/[^\w.-]+/g, "_").slice(0, 64) || "evidence";
	const file = join(paths.evidenceDir, `${id}-${safe}.txt`);
	writeFileSync(file, content, "utf8");
	appendFileSync(paths.caseMd, `- ${id} ${label}\n`, "utf8");
	return { id, label, path: file };
}

export function listEvidenceIds(evidenceDir: string): string[] {
	if (!existsSync(evidenceDir)) return [];
	return readdirSync(evidenceDir)
		.map((f) => /^E-\d+/.exec(f)?.[0])
		.filter((x): x is string => !!x);
}

export function validateEvidenceIds(
	evidenceDir: string,
	ids: readonly string[],
): { ok: boolean; missing: string[]; known: string[] } {
	const known = listEvidenceIds(evidenceDir);
	const missing = ids.filter((id) => !known.includes(id));
	return { ok: missing.length === 0, missing, known };
}

export function appendFinding(
	paths: WorkspacePaths,
	title: string,
	detail: string,
	evidenceIds: readonly string[],
): void {
	appendFileSync(paths.findingsMd, `## ${title}\n${detail}\nevidence: ${evidenceIds.join(", ")}\n\n`, "utf8");
}

export function countEvidence(evidenceDir: string): number {
	return listEvidenceIds(evidenceDir).length;
}

export function readCaseMd(paths: WorkspacePaths): string {
	return existsSync(paths.caseMd) ? readFileSync(paths.caseMd, "utf8") : "";
}
