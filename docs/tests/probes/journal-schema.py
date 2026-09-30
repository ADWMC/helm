"""Dump the helm journal schema so the dashboard reads the right columns."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

db = Path.home() / ".helm" / "agent" / "phase.db"
c = sqlite3.connect(str(db))

row = c.execute("SELECT sql FROM sqlite_master WHERE name='journal'").fetchone()
print("journal schema:")
print(row[0] if row else "(none)")
print()

idx = c.execute(
    "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='journal'"
).fetchall()
print("indexes:")
for name, sql in idx:
    print(f"  {name}: {sql}")
print()

cols = [r[1] for r in c.execute("PRAGMA table_info(journal)").fetchall()]
print("columns:", cols)
print()

print("kind distribution (all time):")
for kind, n in c.execute(
    "SELECT kind, COUNT(*) FROM journal GROUP BY kind ORDER BY 2 DESC"
).fetchall():
    print(f"  {kind:<24} {n}")

print()
print("latest 5 entries:")
for rev, kind, at in c.execute(
    "SELECT revision, kind, at FROM journal ORDER BY revision DESC LIMIT 5"
).fetchall():
    print(f"  rev={rev} kind={kind} at={at}")
