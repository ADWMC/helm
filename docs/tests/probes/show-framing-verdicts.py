"""Show finish-scope framing verdicts, one line per decision.

Companion to show-framing-journal.py: that one prints full payloads (including
unverified claim ids) and flags entries written before the framing check existed;
this one collapses to revision + verdict + pass so a sweep of runs is scannable.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

db = Path.home() / ".helm" / "agent" / "phase.db"
c = sqlite3.connect(str(db))

rows = c.execute(
    "SELECT revision, payload_json FROM journal WHERE kind='review_gate' ORDER BY revision DESC LIMIT 40"
).fetchall()

with_framing = 0
print("recent review_gate entries carrying a framing verdict:")
for rev, payload in rows:
    try:
        j = json.loads(payload)
    except Exception:
        continue
    if "framing" not in j:
        continue
    with_framing += 1
    if j.get("scope") == "finish":
        print(
            f"  rev={rev} framing={j.get('framing')} pass={j.get('pass')} "
            f"missing={j.get('framingMissing')}"
        )

print(f"\n{with_framing} of {len(rows)} recent review_gate entries carry 'framing'")

# How many are finish-scope at all?
finish = c.execute(
    "SELECT COUNT(*) FROM journal WHERE kind='review_gate' AND payload_json LIKE '%\"scope\": \"finish\"%'"
).fetchone()[0]
print(f"finish-scope review_gate entries total: {finish}")
