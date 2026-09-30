"""Find every framing-gate decision in a helm session transcript.

The gate throws `finish_misframed` (blocked) or returns `indeterminate` (passed,
unverified). Both are answers; the question is which one a real run reaches.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

p = Path(sys.argv[1])
recs = []
for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
    line = line.strip()
    if line:
        try:
            recs.append(json.loads(line))
        except Exception:
            pass

KEYS = ("misfram", "framing", "finish", "basis", "gate", "deny", "block",
        "scope", "convergence", "review")

print(f"records: {len(recs)}")
print()

hits = 0
for i, r in enumerate(recs, 1):
    blob = json.dumps(r, ensure_ascii=False)
    low = blob.lower()
    if any(k in low for k in KEYS):
        hits += 1
        t = r.get("type")
        name = r.get("event") or r.get("name") or r.get("subtype") or t
        print(f"--- #{i} type={t} name={name} ---")
        print(blob[:700])
        print()

print(f"[{hits} framing/gate-related records]")
