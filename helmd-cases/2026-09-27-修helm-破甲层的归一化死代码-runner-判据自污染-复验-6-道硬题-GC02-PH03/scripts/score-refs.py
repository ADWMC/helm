# SkillOpt harvest: score helm-d reference docs for porting into helm.
#
# Scoring dimensions are structural and reproducible. No manual per-file judgement.
#
# value  = how much the doc teaches a METHOD (transferable) vs a LOOKUP (perishable)
# decay  = how fast the content rots (CVE pins, tool versions, payload strings)
# cost   = context bytes the doc consumes when loaded
#
# A doc is worth porting when value is high AND decay is low. Cost only breaks ties.

import csv
import json
import re
import sys
from pathlib import Path

SRC = Path(r"C:\Users\Administrator\Documents\GitHub\helm-d\packages\helmd\references")

# Names that signal a methodology rather than a lookup table.
METHOD_WORDS = (
    "methodology", "workflow", "playbook", "principles", "casebook",
    "decision", "intake", "approach", "strategy", "guide",
)
# Names that signal a perishable lookup.
LOOKUP_WORDS = (
    "reference", "cheatsheet", "cheat-sheet", "api", "templates",
    "recommendations", "setup", "installation", "checklist",
)

# Navigation files are a different kind. Scoring them on explanation density is
# a category error: an index explains nothing and is judged by whether its links
# resolve. They are classified, not ranked, and handled by a separate rule.
#
# Some routers are not named index.md. web/auth-sec.md opens with "This is the
# routing entry point for ..." and carries a When-to-Use block, which is
# navigation content. Detect that shape, not just the filename.
NAV_NAMES = {"index.md"}
# A router must present itself as one. "## When to Use" alone is too weak: many
# real methodology docs carry it (web/recon-for-sec.md scores 10.8 and is
# methodology). Require an explicit routing claim in the opening or the title.
NAV_MARKERS = re.compile(
    r"routing entry point"
    r"|This is the routing"
    r"|^# .*\bRouter\b"
    r"|^\s*(?:This\s+)?(?:is|serves as)\s+the\s+(?:routing|entry)\b"
    r"|you need to decide (?:whether|which)",
    re.IGNORECASE | re.MULTILINE,
)

H_CODE = re.compile(r"(?m)^```")
H_HEAD = re.compile(r"(?m)^#{1,3}\s")
H_STEP = re.compile(r"(?m)^\s*(?:\d+[.)]|[-*]\s+\*\*|Step\s+\d)")
H_TABLE = re.compile(r"(?m)^\|")
H_CVE = re.compile(r"CVE-\d{4}-\d{4,}")
# Version-shaped tokens only when they look like software versions. Bare N.N is
# mostly section numbering (§1.1, 4.2) and was inflating decay on well-structured
# docs. Require a v-prefix, a three-part number, or a known software stem.
H_VER = re.compile(r"\bv\d+\.\d+(?:\.\d+)?\b|\b\d+\.\d+\.\d+\b")
H_PAYLOAD = re.compile(r"(?i)\b(shellcode|one-liner|bypass string|exploit code)\b|\bpayload\s+(?:template|string|bytes)\b")
H_URL = re.compile(r"https?://")
H_WHY = re.compile(r"(?i)\b(because|reason|why|trade-?off|however|instead|fails?|pitfall|gotcha|caveat|note that)\b")
# A scope statement says where a doc applies and where it does not. That is the
# strongest transfer signal a reference can carry: it prevents the reader from
# applying the wrong method. Counted as value, not length.
H_SCOPE = re.compile(r"适用范围|适用场景|不适用|when not to use|scope|out of scope|职责边界|适用条件")


def score(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    rel = path.relative_to(SRC).as_posix()
    name = path.name
    low = name.lower()

    heads = len(H_HEAD.findall(text))
    steps = len(H_STEP.findall(text))
    tables = len(H_TABLE.findall(text))
    cves = len(H_CVE.findall(text))
    versions = len(H_VER.findall(text))
    payloads = len(H_PAYLOAD.findall(text))
    urls = len(H_URL.findall(text))
    whys = len(H_WHY.findall(text))
    scopes = len(H_SCOPE.findall(text))

    # Navigation files are classified separately: their value is link integrity,
    # not explanation density, so they carry no net score.
    is_nav = name in NAV_NAMES or bool(NAV_MARKERS.search(text))

    # value: explanation density. A doc that says WHY transfers; a doc that lists
    # flags does not. A doc that states its own scope transfers best of all,
    # because it prevents misapplication. Normalised per kilobyte so length alone
    # cannot win.
    kb = max(len(text.encode("utf-8")) / 1024.0, 0.5)
    value = (whys * 2.0 + steps * 1.5 + heads * 0.5 + scopes * 3.0) / kb
    if any(w in low for w in METHOD_WORDS):
        value += 1.5

    # decay: perishable content per kilobyte.
    decay = (cves * 3.0 + payloads * 2.0 + versions * 0.5 + urls * 0.3) / kb
    if any(w in low for w in LOOKUP_WORDS):
        decay += 1.0

    return {
        "rel": rel,
        "domain": rel.split("/")[0] if "/" in rel else "(root)",
        "name": name,
        "kind": "nav" if is_nav else "doc",
        "bytes": len(text.encode("utf-8")),
        "kb": round(kb, 1),
        "heads": heads,
        "steps": steps,
        "tables": tables,
        "cves": cves,
        "versions": versions,
        "payloads": payloads,
        "urls": urls,
        "whys": whys,
        "scopes": scopes,
        "value": round(value, 2),
        "decay": round(decay, 2),
        "net": None if is_nav else round(value - decay, 2),
    }


def main() -> int:
    rows = [score(p) for p in sorted(SRC.rglob("*.md"))]
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("scores.csv")
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    print(f"scored {len(rows)} docs -> {out}")
    docs = [r for r in rows if r["kind"] == "doc"]
    navs = [r for r in rows if r["kind"] == "nav"]
    print(f"  docs: {len(docs)}   nav: {len(navs)}")
    print()
    print("net score distribution over docs (value - decay):")
    nets = sorted(r["net"] for r in docs)
    for pct in (10, 25, 50, 75, 90):
        print(f"  p{pct:<3} {nets[min(int(len(nets) * pct / 100), len(nets) - 1)]:>7.2f}")
    print()
    print("top 30 by net:")
    for r in sorted(docs, key=lambda x: -x["net"])[:30]:
        print(f"  {r['net']:>6.2f}  v={r['value']:>5.2f} d={r['decay']:>5.2f}  {r['rel']}")
    print()
    print("bottom 10 by net:")
    for r in sorted(docs, key=lambda x: x["net"])[:10]:
        print(f"  {r['net']:>6.2f}  v={r['value']:>5.2f} d={r['decay']:>5.2f}  {r['rel']}")
    print()
    print(f"nav files (classified, not ranked): {len(navs)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
