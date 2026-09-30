"""What did the killed B01 runs actually do? Read their session transcripts and
summarize the action stream (tool calls + recovery reminders), to see whether the
new recovery ladder loops on out-of-scope items.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

here = Path(__file__).parent
da = here / "evidence" / "da-win"
stamps = sorted([d for d in da.iterdir() if d.is_dir()], key=lambda d: d.stat().st_mtime, reverse=True)[:4]

for s in stamps:
    files = list(s.rglob("*.jsonl"))
    if not files:
        continue
    print(f"\n=== {s.name} ===")
    total = 0
    tools: dict[str, int] = {}
    reminders = []
    for f in files:
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                j = json.loads(line)
            except Exception:
                continue
            total += 1
            msg = j.get("message") or {}
            content = msg.get("content")
            if isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "toolCall":
                        tools[b.get("name", "?")] = tools.get(b.get("name", "?"), 0) + 1
            if isinstance(content, str) and ("recovery" in content or "instead" in content):
                reminders.append(content[:120].replace("\n", " "))
    print(f"  lines={total} toolCalls={tools}")
    for r in reminders[:4]:
        print(f"  reminder: {r}")
