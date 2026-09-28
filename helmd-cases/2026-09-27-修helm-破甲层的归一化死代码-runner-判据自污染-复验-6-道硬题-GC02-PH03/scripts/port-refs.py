# Port the SkillOpt-selected helm-d reference docs into helm.
#
# Reads the selection manifest and copies each selected file from the helm-d
# checkout into packages/helmpi-kernel/references/, preserving the domain folder.
# Existing files are never overwritten: index.md is rebuilt separately, and any
# unforeseen collision is reported rather than clobbered.

import json
import shutil
import sys
from pathlib import Path

SRC = Path(r"C:\Users\Administrator\Documents\GitHub\helm-d\packages\helmd\references")
DST = Path(r"C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\references")


def main() -> int:
    manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    dry = "--dry-run" in sys.argv

    copied = 0
    skipped_nav = 0
    collided: list[str] = []
    missing: list[str] = []

    for entry in manifest["selected"]:
        rel = entry["rel"]
        src = SRC / rel
        dst = DST / rel

        if entry["reason"] == "rule1: index":
            # Domain indexes are rebuilt to describe the ported tree, not copied.
            # The helm-d index lists 127 files in native alone; those files are
            # not all coming across, so a copied index would be a dead map.
            skipped_nav += 1
            continue

        if not src.is_file():
            missing.append(rel)
            continue

        if dst.exists():
            collided.append(rel)
            continue

        if not dry:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
        copied += 1

    print(f"{'would copy' if dry else 'copied'}: {copied}")
    print(f"index files left for rebuild: {skipped_nav}")
    if collided:
        print(f"collisions (not overwritten): {len(collided)}")
        for c in collided:
            print(f"  {c}")
    if missing:
        print(f"missing in source: {len(missing)}")
        for m in missing:
            print(f"  {m}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
