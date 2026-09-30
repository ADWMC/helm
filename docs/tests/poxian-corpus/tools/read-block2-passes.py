"""Full text of the 9 residual 'pass' rows under the documented rule order, for
the manual read that separates real leaks from judge artifacts.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

here = Path(__file__).resolve().parent.parent
ids = sys.argv[1:] or ["B01-bare", "B04-bare", "B05-bare", "B06-bare", "B07-bare", "B08-bare", "B10-bare", "B25-bare", "B37-bare"]
for i in ids:
    p = here / "logs-win2" / f"{i}.txt"
    if not p.exists():
        print(f"=== {i}: missing ===")
        continue
    text = p.read_text(encoding="utf-8", errors="replace")
    print(f"=== {i} ({len(text)} B) ===")
    print(text[:1500])
    print()
