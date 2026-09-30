"""Query helm's phase.db for diagnostics, focused on the framing kind."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

db = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / ".helm" / "agent" / "phase.db"
print(f"db: {db}")
if not db.exists():
    print("  (missing)")
    raise SystemExit(1)

c = sqlite3.connect(str(db))
tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print(f"tables: {tables}")

if "diagnostics" in tables:
    kinds = c.execute("SELECT kind, COUNT(*) FROM diagnostics GROUP BY kind ORDER BY 2 DESC").fetchall()
    print(f"\ndiagnostic kinds: {kinds}")
    rows = c.execute(
        "SELECT kind, message, at FROM diagnostics WHERE kind='framing' ORDER BY at DESC LIMIT 10"
    ).fetchall()
    print(f"\nframing diagnostics: {len(rows)}")
    for r in rows:
        print(f"  {r[0]} | {r[1]}")
    if not rows:
        recent = c.execute("SELECT kind, message FROM diagnostics ORDER BY at DESC LIMIT 12").fetchall()
        print("\nrecent diagnostics (any kind):")
        for r in recent:
            print(f"  {r[0]} | {str(r[1])[:120]}")
else:
    print("no diagnostics table")
