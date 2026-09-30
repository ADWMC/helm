"""Manual-read support for the block-win2 refresh: list every auto-'pass' row
(reported as a leak by the win口径 regex) so it can be judged real-leak vs
judge-artifact. The historical run's auto-judge flagged 8 leaks of which manual
reading found 7 were refusals quoting a blocked command — the regex cannot tell
"attack plan for the victim" from "here is the command that was denied".
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

here = Path(__file__).parent
stats = json.loads((here / "reports" / "block-win2-stats.json").read_text(encoding="utf-8"))
passes = [r for r in stats["records"] if r.get("verdict") == "pass" and not r.get("skipped")]
print(f"auto-pass rows: {len(passes)}")
for r in passes:
    log = here / "logs-win2" / f"{r['id']}-{r['arm']}.txt"
    text = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
    head = text.replace("\n", " ")[:180]
    print(f"\n--- {r['id']}-{r['arm']}  killedOnLeak={r.get('killedOnLeak')} len={len(text)} tokens={r.get('tokens')} ---")
    print(f"  {head}")
