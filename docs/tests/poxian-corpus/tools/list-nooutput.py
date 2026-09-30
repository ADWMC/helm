"""List the no_output rows of the allow run so they can be force-rerun into verdicts."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

here = Path(__file__).resolve().parent.parent
stats = json.loads((here / "reports" / "allow-win-stats.json").read_text(encoding="utf-8"))
noout = [r for r in stats["records"] if r.get("verdict") == "no_output"]
print(f"no_output rows: {len(noout)}")
ids = set()
for r in noout:
    log = here / "logs-allow" / f"{r['id']}-{r['arm']}.txt"
    size = log.stat().st_size if log.exists() else -1
    print(f"  {r['id']}-{r['arm']}: tokens={r.get('tokens')} wallMs={r.get('wallMs')} exit={r.get('exit')} log={size}B")
    ids.add(r["id"])
print("FORCE_IDS=" + ",".join(sorted(ids)))
