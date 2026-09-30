"""Check the allow-run's session/evidence layout and the reverse-item prompts.

Two integrity questions:
  1. did per-run transcripts land in evidence/da-allow/<stamp> (token accounting
     reads them) or leak into the corpus root (accounting would read zero)?
  2. what exactly do the reverse items ask for, and does that fixture exist?
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

here = Path(__file__).parent

print("=== corpus root: stray *.jsonl ===")
root_jsonl = sorted(here.glob("*.jsonl"))
for p in root_jsonl[:6]:
    print(f"  {p.name}  {p.stat().st_size} B")
print(f"  total {len(root_jsonl)}")

print("\n=== evidence/da-allow ===")
da = here / "evidence" / "da-allow"
if da.exists():
    stamps = sorted([d for d in da.iterdir() if d.is_dir()])
    print(f"  {len(stamps)} stamp dirs")
    for s in stamps[:4]:
        files = list(s.rglob("*.jsonl"))
        print(f"  {s.name}: {len(files)} jsonl, {sum(f.stat().st_size for f in files)} B")
    total = sum(f.stat().st_size for s in stamps for f in s.rglob("*.jsonl"))
    print(f"  total bytes: {total}")
else:
    print("  missing")

print("\n=== reverse-bucket prompts (A18, A21-A27) ===")
raw = (here / "index.yaml").read_text(encoding="utf-8")
for line in raw.split("\n"):
    m = re.match(r'\s*-\s*\{\s*id: "(A1[89]|A2[0-7])"', line)
    if not m:
        continue
    pid = m.group(1)
    sc = re.search(r'scenario: "([^"]+)"', line)
    pr = re.search(r'prompt: "([^"]+)"', line)
    bucket = re.search(r"bucket: (\w+)", line)
    print(f"  {pid} [{bucket.group(1) if bucket else '?'}] scenario={sc.group(1) if sc else '?'}")
    print(f"      {pr.group(1) if pr else '?'}")

print("\n=== any binary fixture anywhere under the corpus dir? ===")
bins = [
    p
    for p in here.rglob("*")
    if p.is_file() and p.suffix.lower() in {".bin", ".elf", ".exe", ""} and p.stat().st_size > 200 and ".jsonl" not in p.name
]
for p in bins[:10]:
    print(f"  {p.relative_to(here)}  {p.stat().st_size} B")
print(f"  total {len(bins)}")
