"""Triage the arXiv candidate set: dedupe across queries, rank by topic fit, emit markdown."""
from __future__ import annotations

import json
import sys
from pathlib import Path

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "AppData/Local/Temp/arxiv-results"
TOPICS = ["intent", "context", "memory", "clarify", "planning"]

# Relevance to helm's own gaps. helm already has: a phase contract in the system
# prompt, a same-kind step limit, finish-basis grounding, a tool-memory recall
# segment, and a CVM strategy projection. What it does NOT have is any mechanism
# for reading an underspecified request, and its context management is per-turn
# prompt assembly rather than a managed budget.
WANT = {
    "intent": "读不准用户要什么——helm 直接执行 Spec 目标，没有消歧环节",
    "clarify": "该不该问、什么时候问——与 helm 的「run 中不问人」条款直接冲突",
    "context": "上下文预算管理——helm 只有每轮拼装，没有预算调度",
    "memory": "跨会话记忆取舍——helm 有 tool-memory 但没有记忆选择策略",
    "planning": "计划表示与重规划——helm 用 10 类 StepKind 硬编码阶段",
}


def main() -> None:
    seen: dict[str, dict] = {}
    for topic in TOPICS:
        path = OUT / f"{topic}.json"
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for paper in data.get("papers", []):
            pid = paper["id"].split("v")[0]
            entry = seen.setdefault(pid, {**paper, "topics": []})
            if topic not in entry["topics"]:
                entry["topics"].append(topic)

    papers = sorted(seen.values(), key=lambda p: p["published"], reverse=True)
    recent = [p for p in papers if p["published"][:7] >= "2024-01"]

    lines = [
        "# arXiv 候选：AI Agent 意图理解 / 上下文优化",
        "",
        f"抓取查询：{len(TOPICS)} 条 · 去重后 {len(papers)} 篇 · 2024-01 之后 {len(recent)} 篇",
        "",
        "## helm 的对应缺口",
        "",
    ]
    for topic in TOPICS:
        lines.append(f"- **{topic}**：{WANT[topic]}")

    lines += ["", "## 候选（2024-01 之后，按时间倒序）", ""]
    lines.append("| 日期 | arXiv ID | 命中主题 | 标题 |")
    lines.append("|---|---|---|---|")
    for p in recent:
        lines.append(
            f"| {p['published'][:7]} | `{p['id']}` | {','.join(p['topics'])} | {p['title']} |"
        )

    older = [p for p in papers if p["published"][:7] < "2024-01"]
    if older:
        lines += ["", "## 更早（背景/经典，2024 之前）", ""]
        for p in older:
            lines.append(f"- `{p['id']}` ({p['published'][:7]}) {p['title']}")

    dest = Path("docs/tests/arxiv-agent-candidates.md")
    dest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {dest} — {len(papers)} unique, {len(recent)} recent, {len(older)} older")


if __name__ == "__main__":
    main()
