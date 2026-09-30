"""Recent scope_denied rows in the live phase journal: targets + matchedBy + day."""

from __future__ import annotations

import json
import sqlite3
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

db = Path.home() / ".helm" / "agent" / "phase.db"
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
rows = c.execute(
    "SELECT revision, kind, payload_json, at FROM journal WHERE kind='scope_denied' ORDER BY revision DESC LIMIT 15"
).fetchall()

today = time.strftime("%Y-%m-%d")
print(f"db={db}")
print(f"recent scope_denied rows: {len(rows)}")
n_today = 0
for rev, kind, payload, at in rows:
    j = json.loads(payload)
    day = time.strftime("%Y-%m-%d", time.localtime(at / 1000))
    if day == today:
        n_today += 1
    # mask host: keep TLD shape only
    tgt = str(j.get("target", ""))
    masked = "<target-" + tgt.split(".")[-1] + ">" if "." in tgt else "<no-host>"
    print(f"  rev={rev} day={day} src={j.get('source')} matchedBy={j.get('matchedBy')} target={masked}")
print(f"rows from today ({today}): {n_today}")

# Total counts by matchedBy ever
print("\nall-time matchedBy distribution:")
for mb, n in c.execute(
    "SELECT json_extract(payload_json,'$.matchedBy'), COUNT(*) FROM journal WHERE kind='scope_denied' GROUP BY 1 ORDER BY 2 DESC"
).fetchall():
    print(f"  {mb}: {n}")
