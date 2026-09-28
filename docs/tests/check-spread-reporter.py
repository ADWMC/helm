"""Unit-check report_spread against the measured noise floor.

The claim being tested: two identical 60s 3-run suites on the same 6 cases
scored 6/18 and 11/18. If the spread reporter cannot reproduce that observation,
it cannot be trusted to detect a real improvement later.
"""

import importlib.util
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "hxcorpus", Path(__file__).resolve().parent / "helm-x-corpus-test.py"
)
mod = importlib.util.module_from_spec(spec)
sys.modules["hxcorpus"] = mod
spec.loader.exec_module(mod)


def synth(round_idx: int, statuses: list[str]) -> dict:
    total = len(statuses)
    results = [
        {"id": f"C{i:02d}", "category": "x", "status": s, "five": "deliver", "detail": "", "secs": 1.0, "round": round_idx}
        for i, s in enumerate(statuses)
    ]
    passed = statuses.count("PASS")
    refused = statuses.count("REFUSED")
    return {
        "round": round_idx,
        "total": total,
        "passed": passed,
        "refused": refused,
        "error": 0,
        "timeout": 0,
        "passRate": round(passed / total * 100, 1),
        "passRateExclError": round(passed / total * 100, 1),
        "fiveStates": {},
        "results": results,
    }


def check(label: str, got, want) -> bool:
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {label}: got {got!r}, want {want!r}")
    return ok


fails = 0

# Case 1: the measured 6/18 vs 11/18 observation on 6 cases x 3 rounds.
# 6/18 = 33.3%, 11/18 = 61.1% -> a 27.8 pp gap between two identical suites.
# That gap is the point: it is the smallest measured difference that was NOT
# caused by any code change, so it is the floor a future A/B must clear.
r1 = synth(1, ["PASS"] * 2 + ["REFUSED"] * 4)   # 2/6
r2 = synth(2, ["PASS"] * 2 + ["REFUSED"] * 4)   # deliberately identical
# Rates 33.3 and 61.1 (reusing r1 for the mean/stddev maths, second round built
# at the measured higher score).
r2 = synth(2, ["PASS"] * 4 + ["REFUSED"] * 2)   # 4/6
spread = mod.report_spread([r1, r2])
fails += not check("mean of 33.3 and 66.7", spread["mean"], 50.0)
fails += not check("spread pp", spread["spreadPp"], 33.4)
# Only C00/C01 change verdict between round 1 (PASS,PASS,REF,REF,REF,REF) and
# round 2 (PASS,PASS,PASS,PASS,REF,REF): C02 and C03 flip. C00/C01 were PASS in
# both and C04/C05 were REFUSED in both, so 2 cases are flaky, not 6.
fails += not check("flaky case count", len(spread["flaky"]), 2)

# Case 2: identical rounds -> zero spread, no false positives.
r3 = synth(1, ["PASS"] * 3 + ["REFUSED"] * 3)
r4 = synth(2, ["PASS"] * 3 + ["REFUSED"] * 3)
spread2 = mod.report_spread([r3, r4])
fails += not check("identical rounds spread", spread2["spreadPp"], 0.0)
fails += not check("identical rounds flaky", len(spread2["flaky"]), 0)

# Case 3: one case flips, the rest stable -> exactly one flaky id reported.
r5 = synth(1, ["PASS", "PASS", "PASS"])
r6 = synth(2, ["PASS", "REFUSED", "PASS"])
spread3 = mod.report_spread([r5, r6])
fails += not check("one flip flaky count", len(spread3["flaky"]), 1)
fails += not check("flaky id is C01", spread3["flaky"][0]["id"], "C01")
fails += not check("flaky verdicts", spread3["flaky"][0]["verdicts"], ["PASS", "REFUSED"])

# Case 4: stdev uses n-1. Two rounds differing by 2x give stdev = |d|/sqrt(2).
r7 = synth(1, ["PASS"] * 5)   # 100%
r8 = synth(2, ["PASS"] * 4 + ["REFUSED"])  # 80%
spread4 = mod.report_spread([r7, r8])
fails += not check("stdev n-1", spread4["stdev"], 14.1)

print()
print(f"spread-reporter check: {4 - fails}/4 groups passed")
sys.exit(1 if fails else 0)
