"""Report the framing gate's verdict from a completed live run.

Reads the session transcript and the run's own diagnostic/journal surface, then
prints exactly which verdict the gate reached. Answers the question the probe
exists for: on a real run, does the gate block, pass-aligned, or pass-unverified?
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

work = Path(sys.argv[1])
recs = []
tp = work / "transcript.jsonl"
if tp.exists():
    for line in tp.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if line:
            try:
                recs.append(json.loads(line))
            except Exception:
                pass

print(f"work: {work}")
print(f"records: {len(recs)}")
print()

# 1. Any framing diagnostic the loop wrote.
framing = []
for r in recs:
    b = json.dumps(r, ensure_ascii=False)
    if '"framing"' in b or "framing" in b.lower() and "diagnostic" in b.lower():
        framing.append(b)
    for key in ("diagnostics", "diagnostic"):
        v = r.get(key)
        if isinstance(v, list):
            for d in v:
                if isinstance(d, dict) and d.get("kind") == "framing":
                    framing.append(json.dumps(d, ensure_ascii=False))

print("=== framing diagnostics seen ===")
for f in framing[:10]:
    print(f"  {f[:220]}")
if not framing:
    print("  (none in transcript)")

# 2. The status tool result carries the diagnostics list.
print()
print("=== status output containing diagnostics ===")
for r in recs:
    txt = ""
    c = r.get("content") or (r.get("message") or {}).get("content") or []
    if isinstance(c, str):
        txt = c
    elif isinstance(c, list):
        for x in c:
            if isinstance(x, dict) and x.get("type") == "text":
                txt += x.get("text", "")
    if "review:" in txt or "diagnostics" in txt.lower() or "framing" in txt.lower():
        for line in txt.splitlines():
            if any(k in line.lower() for k in ("framing", "review:", "finish", "convergence", "scope")):
                print(f"  {line.strip()[:150]}")

# 3. Final assistant answer: did the run actually finish the task?
print()
print("=== final answer ===")
assistant = []
for r in recs:
    if r.get("type") == "message" and r.get("role") == "assistant":
        c = r.get("content") or (r.get("message") or {}).get("content") or []
        if isinstance(c, str):
            t = c
        else:
            t = "\n".join(x.get("text", "") for x in c if isinstance(x, dict) and x.get("type") == "text")
        if t.strip():
            assistant.append(t)
if assistant:
    print(assistant[-1][:1800])
else:
    # --print writes the last message; fall back to stdout.txt
    so = work / "stdout.txt"
    print(so.read_text(encoding="utf-8", errors="replace")[:1800] if so.exists() else "(none)")
