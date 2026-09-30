"""
Clean-install verification for helm distribution, using npm's `file:` protocol.

Why this shape: hand-building node_modules by extracting tarballs does NOT resolve
transitive deps (which, shebang-regex, isexe, ...), so it produces failures that
are artifacts of the harness rather than real packaging bugs. Declaring the local
tarballs with `file:` lets npm do real dependency resolution while still bypassing
the registry -- which is the only way to test distribution before publishing.

Run from the repo root: python docs/tests/helm-clean-install.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO = Path(__file__).resolve().parents[2]
STAGE = Path(os.environ.get("TEMP", "/tmp")) / "helm-clean-install"
PKGS = STAGE / "pkgs"
APP = STAGE / "app"

# Workspace packages helm needs at runtime, in dependency order.
WORKSPACE_PKGS = [
    ("chord", "@adwmc/helm-chord"),
    ("helmpi-kernel", "@adwmc/helm-kernel"),
    ("helmpi-tools", "@adwmc/helm-tools"),
    ("tui", "@adwmc/helm-tui"),
    ("agent", "@adwmc/helm-agent-core"),
    ("ai", "@adwmc/helm-ai"),
    # transitive: agent-core and ai both depend on telemetry
    ("telemetry", "@adwmc/helm-telemetry"),
]


def run(cmd: list[str], cwd: Path, timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, cwd=str(cwd), capture_output=True, text=True,
        shell=(os.name == "nt"), timeout=timeout,
    )


def pack(pkg_dir: str, dest: Path) -> Path | None:
    """npm pack a workspace package; return the produced tarball."""
    before = set(dest.glob("*.tgz"))
    r = run(["npm", "pack", "--pack-destination", str(dest)], REPO / "packages" / pkg_dir, 900)
    after = set(dest.glob("*.tgz"))
    new = list(after - before)
    if r.returncode != 0 or not new:
        print(f"    FAILED: {(r.stderr or r.stdout).strip()[:200]}")
        return None
    return new[0]


def main() -> int:
    for d in (PKGS, APP):
        shutil.rmtree(d, ignore_errors=True)
        d.mkdir(parents=True, exist_ok=True)

    print("1. packing workspace packages")
    versions: dict[str, str] = {}
    for pkg_dir, name in WORKSPACE_PKGS:
        tgz = pack(pkg_dir, PKGS)
        if not tgz:
            print(f"   {name}: FAILED")
            return 1
        versions[name] = tgz.name
        print(f"   {name:<26} {tgz.name} ({tgz.stat().st_size / 1e6:.2f} MB)")

    helm_tgz = pack("coding-agent", PKGS)
    if not helm_tgz:
        print("   helm coding-agent: FAILED")
        return 1
    print(f"   {'@adwmc/helm-coding-agent':<26} {helm_tgz.name} ({helm_tgz.stat().st_size / 1e6:.2f} MB)")

    print("\n2. writing package.json with file: tarball deps (bypasses the registry)")
    deps = {name: f"file:./pkgs/{fn}" for name, fn in versions.items()}
    deps["@adwmc/helm-coding-agent"] = f"file:./pkgs/{helm_tgz.name}"
    (APP / "package.json").write_text(
        json.dumps({"name": "helm-install-test", "private": True, "dependencies": deps}, indent=2),
        encoding="utf-8",
    )
    shutil.copytree(PKGS, APP / "pkgs", dirs_exist_ok=True)

    print("\n3. npm install --ignore-scripts")
    r = run(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"], APP, 1800)
    if r.returncode != 0:
        err = (r.stderr or r.stdout).strip().splitlines()
        print("   install FAILED:")
        for line in err[:14]:
            print("     " + line[:150])
        return 1
    print("   install OK")

    cli = APP / "node_modules" / "@adwmc" / "helm-coding-agent" / "dist" / "bundle" / "cli.js"
    if not cli.exists():
        print(f"   FATAL: cli not found at {cli}")
        return 1

    print("\n4. running from the install dir (outside the repo)")
    ok = True
    for args, label in [(["--version"], "version"), (["--print", "say ok"], "real session")]:
        r = run(["node", str(cli), *args], APP, 300)
        out = (r.stdout or r.stderr).strip().splitlines()
        first = out[0][:100] if out else "(no output)"
        status = "PASS" if r.returncode == 0 else "FAIL"
        ok = ok and r.returncode == 0
        print(f"   {label:<14} exit={r.returncode} {status}  {first}")

    # The i18n fix has to have travelled into the installed package.
    i18n = APP / "node_modules" / "@adwmc" / "helm-coding-agent" / "dist" / "i18n"
    print(f"\n5. dist/i18n shipped: {i18n.exists()}", sorted(p.name for p in i18n.iterdir()) if i18n.exists() else "")

    print("\n" + ("ALL CHECKS PASSED" if ok and i18n.exists() else "FAILURES PRESENT"))
    return 0 if (ok and i18n.exists()) else 1


if __name__ == "__main__":
    sys.exit(main())
