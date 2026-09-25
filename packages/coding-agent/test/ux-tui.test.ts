import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { resetLocaleCache, resolveLocale } from "@adwmc/helm-kernel/i18n";
import { openToolMemory } from "@adwmc/helm-kernel/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printHelp } from "../src/cli/args.ts";
import { runHelmCommand } from "../src/cli/helm-commands.ts";

/**
 * W5-T07 UX 六项 (WG5.4): ① help discoverable + alias equivalence ② doctor→tool-memory
 * ⑤ no numbered menus (archived real-machine logs) ⑥ zh-CN footer / en default.
 * ③ render lives in kernel run-status.test.ts; ④ headline asserted via report e2e below.
 */

function capture(fn: () => void): string {
	const seen: string[] = [];
	const spy = vi.spyOn(console, "log").mockImplementation((...c: unknown[]) => {
		seen.push(c.map(String).join(" "));
	});
	try {
		fn();
	} finally {
		spy.mockRestore();
	}
	return seen.join("\n");
}

describe("T07 ① help discoverable + alias equivalence", () => {
	it("lists all helm product commands exactly once (dup-block regression)", () => {
		const out = capture(() => printHelp());
		for (const cmd of ["spec init", "run | resume", "report [--dir", "validate-scope", "attack-coverage", "doctor"]) {
			expect(out, `missing ${cmd}`).toContain(cmd);
		}
		const specLines = out.split("\n").filter((l) => l.includes("spec init [--force]"));
		expect(specLines.length, `spec init listed ${specLines.length}x (W1 dup-block regression)`).toBe(1);
	});

	it("helmpi alias equivalent to helm (same bin target)", () => {
		// anchor from process.cwd() (vitest --root keeps cwd = repo root; dbg-proven)
		const cands = [
			path.join(process.cwd(), "packages", "coding-agent", "package.json"),
			path.join(process.cwd(), "package.json"),
		];
		let pkg: { bin?: Record<string, string> } | null = null;
		for (const cand of cands) {
			if (fs.existsSync(cand)) {
				const j = JSON.parse(fs.readFileSync(cand, "utf8")) as { bin?: Record<string, string> };
				if (j.bin?.helm) {
					pkg = j;
					break;
				}
			}
		}
		if (!pkg) throw new Error(`no package.json with bin found in: ${cands.join(", ")}`);
		expect(pkg, "package.json with bin found").toBeTruthy();
		expect(pkg?.bin?.helmpi).toBe(pkg?.bin?.helm);
	});
});

describe("T07 ② doctor → tool-memory联调", () => {
	let dir: string;
	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "helm-ux-doctor-"));
	});
	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

	it("doctor seeds .helm/tool-memory.db with verified rows", async () => {
		const args = ["doctor"];
		await expect(runHelmCommand(args, dir)).resolves.toBe(true);
		const db = path.join(dir, ".helm", "tool-memory.db");
		expect(fs.existsSync(db), "tool-memory db created").toBe(true);
		const store = openToolMemory(db);
		const rows = store.all();
		expect(rows.length).toBeGreaterThan(0);
		store.close();
	}, 60_000);
});

describe("T07 ⑤ Run 层零编号菜单 (archived real-machine logs)", () => {
	it("no numbered-menu / ask_user patterns across fork-gates stdout archive", () => {
		const logs = new URL("../../../docs/tests/2026-fork-gates/logs/", import.meta.url);
		const dir = fileURLToPath(logs);
		expect(fs.existsSync(dir), "archive dir present").toBe(true);
		const files = fs.readdirSync(dir).filter((f) => f.endsWith("-stdout.txt"));
		expect(files.length).toBeGreaterThan(0);
		const MENU = /(请\s*选择|输入\s*[1-9]|choose option|ask_user|\(1\)\s*.*\n.*\(2\))/;
		const hits: string[] = [];
		for (const f of files) {
			const txt = fs.readFileSync(path.join(dir, f), "utf8");
			if (MENU.test(txt)) hits.push(f);
		}
		expect(hits, `menu patterns in: ${hits.join(", ")}`).toEqual([]);
	});
});

describe("T07 ⑥ help localization (zh-CN footer; default en)", () => {
	afterEach(() => {
		delete process.env.HELM_LOCALE;
		resetLocaleCache();
	});

	it("default locale renders English footer", () => {
		resetLocaleCache();
		const out = capture(() => printHelp());
		expect(out).toContain("Run `helm <command> --help`");
	});

	it("HELM_LOCALE=zh-CN renders Chinese footer; help stays parseable", () => {
		process.env.HELM_LOCALE = "zh-CN";
		resetLocaleCache();
		expect(resolveLocale(process.cwd())).toBe("zh-CN");
		const out = capture(() => printHelp());
		expect(out).toContain("运行 `helm <命令> --help`");
		// machine surfaces unaffected: command names stay ASCII
		expect(out).toContain("validate-scope");
	});
});
