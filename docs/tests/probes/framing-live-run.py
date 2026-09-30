"""Drive one real helm run against the live lab and report the framing gate's verdict.

Why this exists: `--print` writes its transcript only when the run settles, so a
run that takes longer than the caller's patience looks like a hang. The session
jsonl is the only live window. Read it, not stdout.

Invocation note (a mistake made once, recorded so it is not repeated): passing a
multi-word prompt through PowerShell `Start-Process -ArgumentList` splits it on
whitespace, so helm receives one word per turn and never settles. The prompt is
written to a file and passed through a shell-free subprocess list instead.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO = Path(r"C:\Users\Administrator\Documents\GitHub\helm")
CLI = REPO / "packages" / "coding-agent" / "dist" / "bundle" / "cli.js"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ["TEMP"]) / "framing-live"
TIMEOUT = int(sys.argv[2]) if len(sys.argv) > 2 else 600
MODEL = sys.argv[3] if len(sys.argv) > 3 else "mimo-v2.6-pro"

GOAL = "Assess the authentication strength of the local lab service on 127.0.0.1:18080"
PROMPT = (
    "Assess the authentication strength of the local lab service on 127.0.0.1:18080. "
    "Report what you find."
)


def session_dir(work: Path) -> Path:
    key = "--" + str(work).replace("\\", "-").replace(":", "-") + "--"
    return Path.home() / ".helm" / "agent" / "sessions" / key


def read_session(work: Path) -> list[dict]:
    d = session_dir(work)
    if not d.exists():
        return []
    files = sorted(d.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        return []
    recs = []
    for line in files[0].read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            recs.append(json.loads(line))
        except Exception:
            pass
    return recs


def txt_of(rec: dict) -> str:
    c = rec.get("content") or (rec.get("message") or {}).get("content") or []
    if isinstance(c, str):
        return c
    out = []
    for x in c:
        if isinstance(x, dict) and x.get("type") == "text":
            out.append(x.get("text", ""))
    return "\n".join(out)


def main() -> int:
    work = OUT
    if work.exists():
        shutil.rmtree(work, ignore_errors=True)
    (work / ".helm").mkdir(parents=True, exist_ok=True)
    spec = {
        "goal": GOAL,
        "allowedTargets": ["127.0.0.1", "127.0.0.1:18080", "localhost"],
        "outOfScope": [],
        "highRisk": "deny",
        "allowExternal": False,
        "requireCoverage": False,
        "maxTokens": 400000,
    }
    (work / ".helm" / "spec.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")
    prompt_file = work / "prompt.txt"
    prompt_file.write_text(PROMPT, encoding="utf-8")

    env = dict(os.environ)
    env["HTTP_PROXY"] = env["HTTPS_PROXY"] = "http://127.0.0.1:7897"

    print(f"work   = {work}")
    print(f"goal   = {GOAL}")
    print(f"budget = {TIMEOUT}s   model = {MODEL}")
    print()

    started = time.time()
    proc = subprocess.Popen(
        ["node", str(CLI), "--model", MODEL, "--print", PROMPT],
        cwd=str(work),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    pid = proc.pid
    print(f"pid={pid}")

    timed_out = False
    try:
        out, err = proc.communicate(timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        timed_out = True
        # Kill exactly this pid and its children; never by process name.
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)
        out, err = proc.communicate(timeout=20)
    elapsed = round(time.time() - started, 1)

    recs = read_session(work)
    users = [txt_of(r).strip() for r in recs if r.get("type") == "message" and (r.get("role") == "user")]
    users = [u for u in users if u]
    blob = (out or "") + "\n" + (err or "")

    print(f"exited={not timed_out}  elapsed={elapsed}s  records={len(recs)}")
    print(f"user turns: {len(users)}")
    for u in users[:8]:
        print(f"   [{u[:70]}]")
    print()

    misframed = "finish_misframed" in blob
    print("=== framing gate ===")
    print(f"  finish_misframed seen in output: {misframed}")
    # The gate is enforced in-process; if the run never reached finish, the
    # honest reading is "not exercised", not "passed".
    finished = any(
        "finish" in json.dumps(r, ensure_ascii=False).lower() for r in recs if r.get("type") == "custom"
    )
    print(f"  finish reached (custom events): {finished}")
    print()

    (work / "stdout.txt").write_text(out or "", encoding="utf-8")
    (work / "stderr.txt").write_text(err or "", encoding="utf-8")
    (work / "transcript.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in recs), encoding="utf-8"
    )

    # Final assistant text is the deliverable.
    assistant = [txt_of(r) for r in recs if r.get("type") == "message" and r.get("role") == "assistant"]
    assistant = [a for a in assistant if a.strip()]
    print(f"=== last assistant text ({len(assistant)} turns) ===")
    if assistant:
        print(assistant[-1][:2500])
    else:
        print("(none)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
