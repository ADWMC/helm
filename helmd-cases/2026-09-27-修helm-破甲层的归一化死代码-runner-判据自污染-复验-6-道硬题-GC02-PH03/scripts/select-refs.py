# SkillOpt candidate selection: turn per-doc scores into a port set.
#
# A pure numeric cutoff is not sufficient. Calibration showed cutoff=4.5 dropping
# web/auth-sec.md, web/authbypass-authentication-flaws.md and
# native/ntlm-relay-coercion.md, which are core methodology. The fix is a rule
# set, not a lower threshold: a lower threshold pulls in 46% of the corpus.
#
# Rules, in order:
#   1. always: every domain's index.md (navigation; rebuilt, not copied)
#   2. always: every *principles.md (scope statements, highest value density)
#   3. always: every *methodology.md (the method, not the lookup)
#   4. always: every *playbook*.md (sample-type routing)
#   5. by score: anything at or above the cutoff
#   6. floor: every domain keeps at least its top N docs, so no domain is
#      represented only by an index

import csv
import json
import sys
from pathlib import Path

FORCED_SUFFIXES = ("principles.md", "methodology.md")
FORCED_CONTAINS = ("playbook",)
FLOOR_PER_DOMAIN = 8


def main() -> int:
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    cutoff = float(sys.argv[3]) if len(sys.argv) > 3 else 4.5

    rows = list(csv.DictReader(src.open(encoding="utf-8")))
    docs = [r for r in rows if r["kind"] == "doc"]
    navs = [r for r in rows if r["kind"] == "nav"]
    for r in rows:
        r["net"] = None if r["net"] == "" else float(r["net"])
        r["kb"] = float(r["kb"])
        r["bytes"] = int(r["bytes"])

    chosen: dict[str, dict] = {}
    reason: dict[str, str] = {}

    def take(r: dict, why: str) -> None:
        if r["rel"] not in chosen:
            chosen[r["rel"]] = r
            reason[r["rel"]] = why

    for r in navs:
        take(r, "rule1: index")

    for r in docs:
        n = r["name"].lower()
        if n.endswith(FORCED_SUFFIXES):
            take(r, "rule2/3: principles|methodology")
        elif any(w in n for w in FORCED_CONTAINS):
            take(r, "rule4: playbook")
        elif r["net"] >= cutoff:
            take(r, "rule5: score>=%.1f" % cutoff)

    # rule 6: floor per domain
    for dom in sorted({r["domain"] for r in docs}):
        picked = [r for r in docs if r["domain"] == dom and r["rel"] in chosen]
        if len(picked) >= FLOOR_PER_DOMAIN:
            continue
        rest = sorted(
            (r for r in docs if r["domain"] == dom and r["rel"] not in chosen),
            key=lambda x: -x["net"],
        )
        for r in rest[: FLOOR_PER_DOMAIN - len(picked)]:
            take(r, "rule6: domain floor")

    sel = sorted(chosen.values(), key=lambda r: (r["domain"], -999 if r["net"] is None else -r["net"]))
    total_kb = round(sum(r["kb"] for r in sel), 1)

    print(f"cutoff={cutoff}  selected {len(sel)} / {len(rows)} docs  ({total_kb} KB of 3220 KB)")
    print()
    print("by reason:")
    tally: dict[str, int] = {}
    for rel, why in reason.items():
        tally[why] = tally.get(why, 0) + 1
    for why, n in sorted(tally.items()):
        print(f"  {n:>4}  {why}")
    print()
    print("by domain:")
    for dom in sorted({r["domain"] for r in sel}):
        g = [r for r in sel if r["domain"] == dom]
        kb = round(sum(r["kb"] for r in g), 1)
        total = len([r for r in rows if r["domain"] == dom])
        print(f"  {dom:<14} {len(g):>3} / {total:>3}  ({100 * len(g) // max(total, 1):>3}%)  {kb:>7} KB")

    with out.open("w", encoding="utf-8") as fh:
        json.dump(
            {
                "cutoff": cutoff,
                "rules": [
                    "rule1: every domain index.md (navigation, rebuilt)",
                    "rule2: every *principles.md",
                    "rule3: every *methodology.md",
                    "rule4: every *playbook*.md",
                    f"rule5: net score >= {cutoff}",
                    f"rule6: each domain keeps at least {FLOOR_PER_DOMAIN} docs",
                ],
                "selected": [
                    {"rel": r["rel"], "domain": r["domain"], "net": r["net"], "kb": r["kb"], "reason": reason[r["rel"]]}
                    for r in sel
                ],
                "total_kb": total_kb,
            },
            fh,
            ensure_ascii=False,
            indent=2,
        )
    print()
    print(f"manifest -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
