"""Check whether pi-footer's extension contract is satisfied by helm's fork.

pi-footer imports 4 things from the host and calls 6 host methods. helm is a pi
fork, so the contract is likely satisfied, but "likely" is not "verified". This
checks each symbol against helm's actual source.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HELM = Path(r"C:\Users\Administrator\Documents\GitHub\helm\packages")
# (symbol, why it matters to pi-footer)
NEEDED = [
    ("ExtensionAPI", "the pi argument passed to the extension default export"),
    ("ExtensionContext", "ctx on every lifecycle callback"),
    ("ExtensionCommandContext", "ctx in registerCommand handler"),
    ("setFooter", "ctx.ui.setFooter(renderer)"),
    ("setStatus", "ctx.ui.setStatus(key, text)"),
    ("registerCommand", "pi.registerCommand('footer', ...)"),
    ("getContextUsage", "ctx.getContextUsage() for the context widgets"),
    ("sessionManager", "ctx.sessionManager for token metrics"),
    ("hasUI", "ctx.hasUI guard"),
    ("cwd", "ctx.cwd for git + runtime widgets"),
    ("before_provider_request", "pi.on hook that captures text.verbosity"),
    ("session_start", "pi.on lifecycle"),
    ("session_shutdown", "pi.on lifecycle"),
    ("model_select", "pi.on lifecycle"),
]


def find(sym: str) -> list[str]:
    hits = []
    for p in HELM.rglob("*.ts"):
        if p.name.endswith(".test.ts") or "node_modules" in str(p):
            continue
        txt = p.read_text(encoding="utf-8", errors="replace")
        if re.search(rf"\b{re.escape(sym)}\b", txt):
            rel = str(p.relative_to(HELM.parent))
            # Prefer a declaration site over a mere usage.
            decl = re.search(rf"\b(interface|type|class|const|function)\s+{re.escape(sym)}\b", txt)
            hits.append(("DECL " if decl else "use  ") + rel)
    decls = [h for h in hits if h.startswith("DECL")]
    return (decls or hits)[:3]


print(f"{'symbol':<24} {'found':<6} evidence")
print("-" * 100)
missing = []
for sym, why in NEEDED:
    hits = find(sym)
    if not hits:
        missing.append(sym)
    print(f"{sym:<24} {'yes' if hits else 'NO':<6} {hits[0] if hits else why}")

print()
print(f"missing: {missing if missing else 'none'}")
