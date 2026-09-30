"""Verify the crackme fixture end to end: builds from source, passes/fails the
serial as expected, and has the enumeration surface the reverse prompts need.
"""

from __future__ import annotations

import hashlib
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

W = "wsl.exe"
BASE = "/mnt/c/Users/Administrator/Documents/GitHub/helm/docs/tests/poxian-corpus"


def wsl(cmd: str) -> str:
    r = subprocess.run([W, "--", "bash", "-lc", cmd], capture_output=True, text=True, timeout=120)
    return (r.stdout + r.stderr).strip()


print("=== build ===")
print(wsl(f"cd {BASE} && gcc -O0 -no-pie -g -Wl,--build-id crackme-src.c -o crackme && ls -la crackme"))

print("\n=== serial check (expect accept on AB-1234-ZX, reject on WRONG-1) ===")
print("accept:", wsl(f"{BASE}/crackme AB-1234-ZX"))
print("reject:", wsl(f"{BASE}/crackme WRONG-1"))

print("\n=== enumeration surface (what A21-A27 ask for) ===")
print("strings>8:", wsl(f"strings {BASE}/crackme | grep -E '.{{9,}}' | head -8"))
print("md5:", wsl(f"md5sum {BASE}/crackme"))
print("sections:", wsl(f"readelf -S {BASE}/crackme | head -12"))
print("build-id:", wsl(f"readelf -n {BASE}/crackme | sed -n 's/.*Build ID: /Build ID: /p'"))
print("nm:", wsl(f"nm {BASE}/crackme | grep -E ' [tT] ' "))
