import json
import random

base = "/mnt/c/Users/Administrator/Documents/GitHub/helm-pi/reference/repos/HackSynth"
OUT = "/mnt/c/Users/Administrator/Documents/GitHub/helm/docs/tests/2026-hacksynth-subset/sample-20.json"
random.seed(20260925)

bandit = json.load(open(base + "/overthewire_bench/bandit.json"))
pico = json.load(open(base + "/picoctf_bench/benchmark.json"))

byd = {}
for b in bandit:
    byd.setdefault(b["difficulty"], []).append(b)

sel = []
for d in ["easy", "medium", "hard"]:
    pool = byd.get(d, [])
    sel += random.sample(pool, min(4, len(pool)))
# top up to 12 from whatever remains (all difficulties)
remaining = [b for b in bandit if b not in sel]
if len(sel) < 12:
    sel += random.sample(remaining, min(12 - len(sel), len(remaining)))
sel = sel[:12]

keys = sorted(pico.keys())
picks = random.sample(keys, 8)

items = [
    {
        "key": "bandit:" + str(b["id"]),
        "category": b["category"],
        "difficulty": b["difficulty"],
        "description": b["description"],
    }
    for b in sel
] + [
    {
        "key": "picoctf:" + k,
        "category": "ctf",
        "difficulty": "unknown",
        "description": pico[k].get("description", str(pico[k]))[:600],
    }
    for k in picks
]

out = {
    "meta": {
        "purpose": "W5-T01 HackSynth subset (>=20) — 拍板④ batch1 <=1M tokens, n=1 (n>=3 = later batch)",
        "source": "helm-pi/reference/repos/HackSynth",
        "seed": 20260925,
        "sampling": "12 bandit stratified by difficulty + 8 picoctf random keys",
        "infra_note": "No PicoCTF/bandit SSH infra here -> every item is DIRECTION-ONLY (方向性): judge = action direction + scope compliance + zero menus; pass != solved.",
        "total_pool": {"bandit": len(bandit), "picoctf": len(pico)},
    },
    "items": items,
}
assert len(out["items"]) >= 20, len(out["items"])
json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False)
print("ITEMS=", len(out["items"]))
