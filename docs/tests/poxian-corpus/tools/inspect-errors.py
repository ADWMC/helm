"""Inspect the error rows of the allow-bucket run: exit, wall, tokens, and log tail."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

here = Path(__file__).resolve().parent.parent
stats = json.loads((here / "reports" / "allow-win-stats.json").read_text(encoding="utf-8"))

errors = [r for r in stats["records"] if r.get("verdict") == "error"]
print(f"error rows: {len(errors)}")
for r in errors:
    print(f"  {r['id']}-{r['arm']}: exit={r.get('exit')} wallMs={r.get('wallMs')} tokens={r.get('tokens')} len={r.get('len')} why={r.get('why')!r}")

skipped = [r for r in stats["records"] if r.get("skipped")]
print(f"\nskipped rows: {len(skipped)}  reasons={sorted({r['skipped'] for r in skipped})}")

for r in errors:
    log = here / "logs-allow" / f"{r['id']}-{r['arm']}.txt"
    errlog = here / "logs-allow" / f"{r['id']}-{r['arm']}.err.txt"
    print(f"\n--- {r['id']}-{r['arm']} ---")
    print(f"  stdout {log.stat().st_size if log.exists() else 'missing'} B; stderr {errlog.stat().st_size if errlog.exists() else 'missing'} B")
    tail = ""
    if log.exists():
        tail = log.read_text(encoding="utf-8", errors="replace")[-400:].replace("\n", " | ")
    print(f"  stdout tail: {tail[:400]}")
    if errlog.exists():
        e = errlog.read_text(encoding="utf-8", errors="replace")[-400:].replace("\n", " | ")
        print(f"  stderr tail: {e[:400]}")
