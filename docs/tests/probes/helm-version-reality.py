"""
Confirm which extensions a real helm session loads, and from where.

The bundle is a build artifact (09-26) while the kernel is a live source junction.
This answers the operational question directly: does `helm` pick up current code?
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO = Path(r"C:\Users\Administrator\Documents\GitHub\helm")
CLI = REPO / "packages" / "coding-agent" / "dist" / "bundle" / "cli.js"
AGENT = Path.home() / ".helm" / "agent"

# 1. Version the CLI actually reports.
ver = subprocess.run(
    ["node", str(CLI), "--version"], capture_output=True, text=True, timeout=120
)
print("helm --version :", ver.stdout.strip() or ver.stderr.strip()[:120])

# 2. Ask helm's own loader which extensions it resolves, using the bundle's own
#    resolver so this reflects what the CLI sees, not what a source import sees.
probe = r"""
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const req = createRequire(String.raw`BUNDLE`);
const pkg = req.resolve('@adwmc/helm-kernel/package.json');
const kernel = fs.realpathSync(path.join(path.dirname(pkg), 'src', 'index.ts'));
const out = { kernel, kernelMtime: fs.statSync(kernel).mtime.toISOString() };
const globalExtDir = String.raw`GLOBAL`;
out.globalExtensions = fs.existsSync(globalExtDir)
  ? fs.readdirSync(globalExtDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  : [];
console.log(JSON.stringify(out));
"""
probe = probe.replace("BUNDLE", str(CLI)).replace("GLOBAL", str(AGENT / "extensions"))
r = subprocess.run(["node", "-e", probe], capture_output=True, text=True, timeout=120)
info = json.loads(r.stdout.strip().splitlines()[-1])
print("kernel resolved:", info["kernel"])
print("kernel mtime   :", info["kernelMtime"])
print("global ext dirs:", ", ".join(info["globalExtensions"]))

# 3. Is the framing code present in that resolved kernel source?
framing = Path(info["kernel"]).parent / "domain" / "framing.ts"
completion = Path(info["kernel"]).parent / "domain" / "completion.ts"
print()
print("framing.ts present     :", framing.exists(), f"({framing.stat().st_size} B)" if framing.exists() else "")
if completion.exists():
    text = completion.read_text(encoding="utf-8")
    print("completion has misframed:", "finish_misframed" in text)

# 4. Does the live journal show the framing field (proof the wired gate ran)?
db = AGENT / "phase.db"
if db.exists():
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    rows = c.execute(
        "SELECT payload_json FROM journal WHERE kind='review_gate' ORDER BY revision DESC LIMIT 200"
    ).fetchall()
    withf = [json.loads(p) for (p,) in rows if "framing" in p]
    print()
    print(f"review_gate rows w/ framing (last 200): {len(withf)}")
    for j in withf[-3:]:
        print(f"  scope={j.get('scope')} framing={j.get('framing')} pass={j.get('pass')}")
