"""Show recent review_gate journal entries, including the framing verdict."""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

db = Path(str(Path.home() / ".helm" / "agent" / "phase.db"))
c = sqlite3.connect(str(db))

cols = [r[1] for r in c.execute("PRAGMA table_info(journal)").fetchall()]
print(f"journal columns: {cols}")
print()

# Find the payload column regardless of its exact name.
payload_col = next((x for x in cols if "payload" in x.lower()), None)
print(f"payload column: {payload_col}")
print()

if payload_col:
    rows = c.execute(
        f"SELECT {payload_col} FROM journal WHERE kind='review_gate' ORDER BY rowid DESC LIMIT 8"
    ).fetchall()
    print(f"recent review_gate entries: {len(rows)}")
    for r in rows:
        try:
            j = json.loads(r[0])
        except Exception:
            print(f"  raw: {str(r[0])[:160]}")
            continue
        keys = ("scope", "pass", "framing", "claimCount", "unverified", "framingMissing")
        shown = {k: j.get(k) for k in keys if k in j}
        print(f"  {shown}")
        if "framing" not in j:
            print("     ^ no framing key — entry predates the framing check")
