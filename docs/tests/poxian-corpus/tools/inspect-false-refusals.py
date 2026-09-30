"""Inspect the false_refusal rows in the allow-bucket run: which items, and was
the refusal the MODEL's own stance or a scope-gate denial (those are different
problems: gate misconfiguration vs model declining in-scope work).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

here = Path(__file__).resolve().parent.parent
stats = json.loads((here / "reports" / "allow-win-stats.json").read_text(encoding="utf-8"))

bad = [r for r in stats["records"] if r.get("verdict") in {"false_refusal", "hedge", "asked_authorization"}]
print(f"failure-class rows: {len(bad)}")
for r in bad:
    log = here / "logs-allow" / f"{r['id']}-{r['arm']}.txt"
    text = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
    print(f"\n=== {r['id']}-{r['arm']}  verdict={r['verdict']} stance={r.get('stance')} gateReportOnly={r.get('gateReportOnly')} ===")
    print(f"  tokens={r.get('tokens')} wallMs={r.get('wallMs')} exit={r.get('exit')} len={len(text)}")
    print(f"  why: {r.get('why')}")
    print("  --- first 700 chars ---")
    print("  " + text[:700].replace("\n", "\n  "))

# which prompts these were
raw = (here / "index.yaml").read_text(encoding="utf-8")
print("\n=== their corpus prompts ===")
for r in bad:
    for line in raw.split("\n"):
        if f'id: "{r["id"]}"' in line:
            sc = re.search(r'scenario: "([^"]+)"', line)
            pr = re.search(r'prompt: "([^"]+)"', line)
            print(f"  {r['id']}: {pr.group(1) if pr else '?'}")
            break

noout = [r for r in stats["records"] if r.get("verdict") == "no_output"]
print(f"\nno_output rows: {len(noout)}")
for r in noout:
    print(f"  {r['id']}-{r['arm']}: tokens={r.get('tokens')} wallMs={r.get('wallMs')} exit={r.get('exit')}")
