import { Ledger } from "../../../../dist/ledger.js";
import { homedir } from "node:os";
import { join } from "node:path";
const db = join(homedir(), ".helm-pi", "phase.db");
const led = new Ledger(db);
const rows = led.journal().filter((r) => {
  try { const p = JSON.parse(r.payloadJson); return p && p.source === "validate_scope"; }
  catch { return false; }
});
console.log(JSON.stringify(rows, null, 2));
led.close();
