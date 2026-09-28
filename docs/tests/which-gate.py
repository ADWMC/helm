"""Which finish gate does a real `helm --print` run actually go through?

Two candidate gates exist:
  A. reviewGate().finishGate(claims)   — index.ts:993, the path a live run used
  B. compileFinish(...)                — loop.ts -> propose.ts, the autonomous loop

The framing check was added to B. This script decides whether B is on the path a
real run takes, because if it is not, the new check never executes in production.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(r"C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\src")


def scan(name: str, pattern: str) -> list[tuple[str, int, str]]:
    out = []
    for p in ROOT.rglob("*.ts"):
        if p.name.endswith(".test.ts"):
            continue
        for i, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if re.search(pattern, line):
                out.append((str(p.relative_to(ROOT)), i, line.strip()))
    return out


print("=== compileFinish call sites (non-test) ===")
for f, i, l in scan("compileFinish", r"\bcompileFinish\b"):
    print(f"  {f}:{i}  {l[:90]}")

print()
print("=== runLoop call sites (non-test) ===")
for f, i, l in scan("runLoop", r"\brunLoop\b"):
    print(f"  {f}:{i}  {l[:90]}")

print()
print("=== reviewGate / finishGate (non-test) ===")
for f, i, l in scan("finishGate", r"finishGate|reviewGate"):
    print(f"  {f}:{i}  {l[:90]}")

print()
print("=== does index.ts reach runLoop at all? ===")
idx = (ROOT / "index.ts").read_text(encoding="utf-8", errors="replace")
print(f"  index.ts mentions runLoop: {'runLoop' in idx}")
print(f"  index.ts mentions compileFinish: {'compileFinish' in idx}")
print(f"  index.ts mentions finishGate: {'finishGate' in idx}")

print()
print("=== does loop.ts reach index.ts, or vice versa? (entry direction) ===")
loop = (ROOT / "loop.ts").read_text(encoding="utf-8", errors="replace")
print(f"  loop.ts imports index: {'from \"./index' in loop}")
