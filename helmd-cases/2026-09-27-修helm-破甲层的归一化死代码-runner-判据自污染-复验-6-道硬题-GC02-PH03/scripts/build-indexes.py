# Generate each domain index.md from what is actually on disk.
#
# Hand-writing eight indexes guarantees drift: the previous index.md promised 14
# paths that did not exist. Generating from the directory listing makes the index
# a projection of disk state, and the companion test asserts the two agree.
#
# Descriptions are taken from each document's first H1 or blockquote. If neither
# exists, the filename is used and the file is reported as needing a description.

import re
import sys
from pathlib import Path

DST = Path(r"C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\references")

DOMAIN_TITLES = {
    "native": "Native 二进制",
    "web": "Web 安全",
    "android": "Android 逆向",
    "ai-security": "AI 安全",
    "malware": "恶意代码分析",
    "protocol": "网络协议",
    "evidence": "证据与报告",
    "toolbox": "工具箱",
}

H1 = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
BLOCKQUOTE = re.compile(r"^>\s*(.+?)\s*$", re.MULTILINE)


def describe(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    m = H1.search(text)
    if m:
        title = m.group(1).strip()
        title = re.sub(r"\s*[—-]\s*(Expert )?(Attack )?Playbook.*$", "", title, flags=re.IGNORECASE)
        title = re.sub(r"\s*(速查表?|手册|指南)$", "", title)
        title = title.strip()
        if title and not title.lower().endswith(".md"):
            return title
    q = BLOCKQUOTE.search(text)
    if q:
        line = re.sub(r"\*\*|`", "", q.group(1)).strip()
        return line[:80]
    return ""


def main() -> int:
    dry = "--dry-run" in sys.argv
    missing_desc: list[str] = []
    written = 0

    for dom, label in DOMAIN_TITLES.items():
        d = DST / dom
        if not d.is_dir():
            continue
        docs = sorted(p for p in d.glob("*.md") if p.name != "index.md")
        lines = [
            f"# {label} references index",
            "",
            "知识按需读，模型自主判断，不作为硬性规则。",
            "",
            f"共 {len(docs)} 篇。",
            "",
        ]
        for p in docs:
            desc = describe(p)
            if not desc:
                missing_desc.append(f"{dom}/{p.name}")
                desc = "(no description in document)"
            # Emit a real markdown link, not a code span. The index integrity test
            # resolves links and asserts every document is reachable; a code span
            # is invisible to that check, which is how an index silently rots.
            lines.append(f"- [{p.name}]({p.name}) — {desc}")
        lines.append("")

        if not dry:
            (d / "index.md").write_text("\n".join(lines), encoding="utf-8")
        written += 1

    print(f"{'would write' if dry else 'wrote'}: {written} domain indexes")
    if missing_desc:
        print(f"documents needing a description: {len(missing_desc)}")
        for m in missing_desc:
            print(f"  {m}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
