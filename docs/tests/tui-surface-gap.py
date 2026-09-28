#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SkillOpt harvest: which helm features shipped without a TUI surface?

SkillOpt's harvest step turns run signals into candidates mechanically. Here the
signal source is git history instead of a run journal: every helm-epoch feat
commit is a shipped capability, and the question is whether an operator can
reach it from the interactive surface.

Method (deliberately mechanical, so the list is auditable):
  1. Take feat commits after the helm fork point (the last upstream commit).
  2. Collect each commit's touched paths + subject keywords.
  3. Cross-reference two TUI surfaces:
     - settings rows: `id: "..."` in settings-selector.ts (the /settings panel)
     - slash commands: the interactive command registry
  4. A feature is "exposed" when its subject keywords or paths match a surface.

Classes emitted:
  EXPOSED      a TUI row or slash command names it
  MISSING      no surface names it, and the feature is operator-facing
  NOT-APPLICABLE  no surface expected (library/test/docs/infra only)

Usage:
  python docs/tests/tui-surface-gap.py
  python docs/tests/tui-surface-gap.py --json
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SETTINGS_FILE = REPO / "packages/coding-agent/src/modes/interactive/components/settings-selector.ts"
HELM_CLI_FILE = REPO / "packages/coding-agent/src/cli/helm-commands.ts"
INTERACTIVE_FILE = REPO / "packages/coding-agent/src/modes/interactive/interactive-mode.ts"
FORK_POINT = "74886f7d5"  # feat(fork): rename brand to helm — first helm commit

# Authoritative map: feat scope label -> (TUI tokens expected, CLI entry).
# Exact scope keys beat substring matching: a subject-keyword scheme mis-assigned
# `feat(scope)` and `feat(spec)` commits because their text also contains words
# owned by other features. The scope label is unambiguous.
BY_SCOPE: dict[str, tuple[tuple[str, ...], str]] = {
	"mcp": (("mcp",), ""),
	"sandbox": (("sandbox", "docker"), ""),
	"guard": (("guard", "injection"), ""),
	"report": (("sarif",), "report"),
	"playbook": (("playbook",), "attack-coverage"),
	"supervise/report": (("supervise", "escalation"), "report"),
	"memory": (("tool-memory", "memory"), "doctor"),
	"scope": (("target-kind", "scope"), "validate-scope"),
	"spec": (("engagement",), "spec"),
	"solpi": (("efficiency-",), ""),
	"i18n": (("language",), ""),
	"settings": (("efficiency-",), ""),
	"cli": ((), ""),
	"kernel": ((), ""),
	"extensions": ((), ""),
	"fork": ((), ""),
	"skillopt": ((), ""),
	"tools": ((), ""),
	"tools/task": ((), ""),
	"references": ((), ""),
	"ux": ((), ""),
	"gates": ((), ""),
	"agent,coding-agent,kernel": (("cvm", "breach", "gateway", "review-gate"), "doctor"),
}

# Subject keyword -> the TUI surface we expect to exist for it.
# Empty tuple = no operator surface is expected (library / test / docs / infra).
EXPECTATIONS: dict[str, tuple[str, ...]] = {
	"破甲/CVM/ToolGateway/ReviewGate": ("cvm", "breach", "gateway", "review-gate"),
	"SARIF": ("sarif",),
	"scope targetKind": ("target-kind", "scope"),
	"playbook": ("playbook",),
	"supervise": ("supervise", "escalation"),
	"sandbox": ("sandbox", "docker"),
	"guard": ("guard", "injection"),
	"spec engagement": ("engagement", "spec"),
	"G5 finish": (),
	"G4 supervision": ("defense-watcher", "budget"),
	"G2 scope intercept": ("scope",),
	"G1 forced prompt": (),
	"tool-memory": ("tool-memory", "memory"),
	"config separation": (),
	"double-load guard": ("efficiency-",),
	"solpi": ("efficiency-",),
	"cli shell commands": (),
	"kernel migration": (),
	"i18n": ("language",),
	"settings efficiency": ("efficiency-",),
	"skillopt": (),
	"mcp": ("mcp",),
	"references": (),
	"ux six-pack": (),
}

# Subject keyword -> the CLI subcommand that is the intended non-TUI entry point.
CLI_ENTRY: dict[str, str] = {
	"SARIF": "report",
	"supervise": "report",
	"scope targetKind": "validate-scope",
	"spec engagement": "spec",
	"tool-memory": "doctor",
	"playbook": "attack-coverage",
	"破甲/CVM/ToolGateway/ReviewGate": "doctor",
}


def run(args: list[str]) -> str:
	return subprocess.run(
		args, cwd=str(REPO), capture_output=True, text=True, encoding="utf-8", errors="replace"
	).stdout


def helm_feat_commits() -> list[tuple[str, str, str]]:
	"""(sha, subject, changed paths) for feat commits at/after the fork point.

	Two git calls rather than one: `--pretty` with `--name-only` interleaves the
	format separators with the file list, and parsing that is what produced an
	empty commit list on the first attempt.
	"""
	subject_raw = run(["git", "log", f"{FORK_POINT}^..HEAD", "--pretty=format:%h\x1f%s"])
	commits: list[tuple[str, str]] = []
	for line in subject_raw.splitlines():
		if "\x1f" not in line:
			continue
		sha, subject = line.split("\x1f", 1)
		if subject.startswith("feat"):
			commits.append((sha.strip(), subject.strip()))

	out: list[tuple[str, str, str]] = []
	for sha, subject in commits:
		paths = run(["git", "show", "--pretty=format:", "--name-only", sha])
		out.append((sha, subject, paths.strip()))
	return out


def settings_ids() -> set[str]:
	text = SETTINGS_FILE.read_text(encoding="utf-8", errors="replace")
	return set(re.findall(r'id:\s*"([^"]+)"', text))


def slash_commands() -> set[str]:
	"""Interactive slash commands.

	They are hardcoded `text === "/x"` branches inside interactive-mode.ts rather
	than a registry object, so the literal comparison is the only reliable handle.
	"""
	file = REPO / "packages/coding-agent/src/modes/interactive/interactive-mode.ts"
	if not file.is_file():
		return set()
	text = file.read_text(encoding="utf-8", errors="replace")
	return set(re.findall(r'text === "(/[a-z-]+)"', text))


def cli_subcommands() -> set[str]:
	"""`helm <sub>` verbs from the CLI dispatcher."""
	if not HELM_CLI_FILE.is_file():
		return set()
	text = HELM_CLI_FILE.read_text(encoding="utf-8", errors="replace")
	return set(re.findall(r'case\s+"([a-z-]+)"', text))


def feature_scope(subject: str) -> str:
	"""The `feat(<scope>)` label, which is the most stable feature identifier."""
	m = re.match(r"feat\(([^)]+)\)", subject)
	return m.group(1) if m else ""


def classify(
	subject: str, ids: set[str], slashes: set[str], cli: set[str]
) -> tuple[str, list[str], str]:
	"""Returns (class, matched tokens, cli entry or empty).

	Three outcomes, because "not in the TUI" is not the same as "unreachable":
	  EXPOSED         a /settings row or slash command names it
	  CLI-ONLY        reachable from `helm <sub>`, absent from the TUI
	  MISSING         no surface at all, and the feature is operator-facing
	  NOT-APPLICABLE  no operator surface expected

	Matching uses the exact `feat(<scope>)` label, longest key first as a fallback
	for scopes not listed in BY_SCOPE.
	"""
	scope = feature_scope(subject)
	spec = BY_SCOPE.get(scope)
	if spec is not None:
		wanted, entry = spec
	else:
		hay = f"{scope} {subject}".lower()
		expected_key = None
		for key in sorted(EXPECTATIONS, key=len, reverse=True):
			if key.lower() in hay:
				expected_key = key
				break
		if expected_key is None:
			return "NOT-APPLICABLE", [], ""
		wanted = EXPECTATIONS[expected_key]
		entry = CLI_ENTRY.get(expected_key, "")
	if not wanted:
		return "NOT-APPLICABLE", [], ""

	rows = " ".join(sorted(ids))
	matches = [t for t in wanted if t in rows or any(t in s for s in slashes)]
	if matches:
		return "EXPOSED", matches, ""
	if entry and entry in cli:
		return "CLI-ONLY", [], entry
	return "MISSING", [], entry


def safe_write(text: str) -> None:
	buf = getattr(sys.stdout, "buffer", None)
	if buf is None:
		sys.stdout.write(text.encode("ascii", "replace").decode("ascii"))
		return
	buf.write((text + "\n").encode("utf-8", "replace"))
	buf.flush()


def main(argv: list[str]) -> int:
	ap = argparse.ArgumentParser()
	ap.add_argument("--json", action="store_true")
	args = ap.parse_args(argv[1:])

	ids = settings_ids()
	slashes = slash_commands()
	cli = cli_subcommands()
	commits = helm_feat_commits()

	rows = []
	for sha, subject, paths in commits:
		label = subject.split(":")[0]
		klass, matches, entry = classify(subject, ids, slashes, cli)
		rows.append(
			{
				"sha": sha,
				"subject": subject,
				"scope": label,
				"klass": klass,
				"matched": matches,
				"cli_entry": entry,
				"paths": paths.splitlines()[:6],
			}
		)

	if args.json:
		safe_write(
			json.dumps(
				{
					"settings_rows": len(ids),
					"slash_commands": sorted(slashes),
					"cli_subcommands": sorted(cli),
					"rows": rows,
				},
				ensure_ascii=False,
				indent=2,
			)
		)
		return 0

	safe_write(
		f"TUI settings rows: {len(ids)} · slash commands: {len(slashes)} · "
		f"CLI subcommands: {len(cli)} ({', '.join(sorted(cli))})"
	)
	safe_write(f"helm feat commits since {FORK_POINT}: {len(commits)}\n")
	for klass in ("MISSING", "CLI-ONLY", "EXPOSED", "NOT-APPLICABLE"):
		group = [r for r in rows if r["klass"] == klass]
		safe_write(f"== {klass} ({len(group)})")
		for r in group:
			m = f"  tui={r['matched']}" if r["matched"] else ""
			c = f"  cli={r['cli_entry']}" if r["cli_entry"] else ""
			safe_write(f"   {r['sha']}  {r['subject'][:96]}{m}{c}")
		safe_write("")
	return 0


if __name__ == "__main__":
	sys.exit(main(sys.argv))
