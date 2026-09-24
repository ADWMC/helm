// STANDARD §6: grand_total_with_cache = input+output+cacheRead+cacheWrite+reasoning
// (excludes provider totalTokens — that is a duplicate projection, not an extra field)
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const root = join(homedir(), ".pi", "agent", "sessions");
const cutoff = Number(process.argv[2] ?? 0);
const FIVE = ["input", "output", "cacheRead", "cacheWrite", "reasoning"];

function walk(d, out = []) {
  if (!existsSync(d)) return out;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".jsonl") && statSync(p).mtimeMs >= cutoff) out.push(p);
  }
  return out;
}

const files = walk(root).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
const perFile = [];
for (const f of files) {
  const sums = Object.fromEntries(FIVE.map((k) => [k, 0]));
  let messages = 0;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    const u = j?.message?.usage;
    if (!u || typeof u !== "object") continue;
    messages += 1;
    for (const k of FIVE) if (typeof u[k] === "number") sums[k] += u[k];
  }
  if (messages > 0) {
    perFile.push({
      file: f,
      messages,
      ...sums,
      grand_total_with_cache: FIVE.reduce((a, k) => a + sums[k], 0),
    });
  }
}
console.log(JSON.stringify(perFile, null, 2));
