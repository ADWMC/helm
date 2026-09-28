"""Summarize a helm session transcript: what the agent did and what it concluded.

The `--print` path emits nothing until the run ends, so the session jsonl is the
only window into an in-progress run. This reads it directly.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

p = Path(sys.argv[1])
if not p.exists():
    print(f"missing: {p}")
    raise SystemExit(1)

n = 0
for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
    line = line.strip()
    if not line:
        continue
    try:
        j = json.loads(line)
    except Exception:
        continue
    n += 1
    t = j.get("type")

    if t == "message":
        role = j.get("role") or (j.get("message") or {}).get("role")
        content = j.get("content") or (j.get("message") or {}).get("content") or []
        parts = []
        if isinstance(content, str):
            parts = [content]
        else:
            for c in content:
                if isinstance(c, dict):
                    if c.get("type") == "text":
                        parts.append(c.get("text", ""))
                    elif c.get("type") == "tool_use":
                        parts.append(f"[tool_use {c.get('name')}] {json.dumps(c.get('input'), ensure_ascii=False)[:300]}")
                    elif c.get("type") == "tool_result":
                        r = c.get("content")
                        if isinstance(r, list):
                            r = " ".join(x.get("text", "") for x in r if isinstance(x, dict))
                        parts.append(f"[tool_result] {str(r)[:300]}")
        blob = "\n".join(parts)
        if blob.strip():
            print(f"--- #{n} {role} ---")
            print(blob[:1400])
            print()
    elif t == "custom":
        # Journal-ish events: finish decisions, gate results, warnings.
        ev = j.get("event") or j.get("name") or "custom"
        data = j.get("data") or j.get("payload") or {}
        body = json.dumps(data, ensure_ascii=False)
        if any(k in body for k in ("finish", "fram", "gate", "deny", "block", "scope", "convergence")):
            print(f"--- #{n} EVENT {ev} ---")
            print(body[:900])
            print()

print(f"[{n} records]", file=sys.stderr)
