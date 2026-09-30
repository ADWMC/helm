"""Provenance of today's scope_denied rows: timestamps, source, unmasked target
shape (last 60 chars), and whether the reported TARGET_HOST appears at all."""

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
    "SELECT revision, payload_json, at FROM journal WHERE kind='scope_denied' ORDER BY revision DESC LIMIT 30"
).fetchall()

print("recent scope_denied (time + source + tail of target):")
for rev, payload, at in rows:
    j = json.loads(payload)
    tgt = str(j.get("target", ""))
    # keep the reported target domain out of printed output
    tgt_disp = tgt.replace("nappig.com", "<target-domain>")
    ts = time.strftime("%H:%M:%S", time.localtime(at / 1000))
    print(f"  rev={rev} {ts} src={str(j.get('source')):15} mb={str(j.get('matchedBy')):10} tail=...{tgt_disp[-52:]}")

# Does the reported target domain appear anywhere in scope_denied payloads?
needle = "nappig"
hits = [r for r in rows if needle in json.loads(r[1]).get("target", "")]
print(f"\nrows whose target contains the reported target domain: {len(hits)} (of {len(rows)} recent)")
for rev, payload, at in hits:
    j = json.loads(payload)
    print(f"  rev={rev} {time.strftime('%H:%M:%S', time.localtime(at/1000))} src={j.get('source')} mb={j.get('matchedBy')}")

# All-time sources
print("\nall-time source distribution:")
for src, n in c.execute(
    "SELECT json_extract(payload_json,'$.source'), COUNT(*) FROM journal WHERE kind='scope_denied' GROUP BY 1 ORDER BY 2 DESC"
).fetchall():
    print(f"  source={src}: {n}")

# Any validate_scope rows ever?
vs = c.execute(
    "SELECT COUNT(*) FROM journal WHERE kind='scope_denied' AND json_extract(payload_json,'$.source')='validate_scope'"
).fetchone()[0]
print(f"\nvalidate_scope-sourced denials ever: {vs}")
