"""Extract the abstract plus section headings from a cached paper markdown.

Reading 1700 lines of converted PDF per paper does not scale and most of it is
references and appendices. This pulls the parts that carry the actual claims.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Windows consoles default to GBK here, which cannot encode the accents and
# math symbols that come through PDF conversion.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def sections(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        s = line.strip()
        # Converted headings are either "## **Title**" or "## 1. Title".
        m = re.match(r"^#{1,3}\s+\*{0,2}(.{3,90}?)\*{0,2}\s*$", s)
        if m and not m.group(1).startswith("Figure"):
            out.append(m.group(1))
    return out


def abstract(text: str) -> str:
    # Anchor on the first Abstract heading. A loose search matches the
    # "Abstract" that appears inside the references list instead.
    m = re.search(r"^#{1,3}\s*\*{0,2}\s*Abstract\s*\*{0,2}\s*$", text, re.M | re.I)
    if not m:
        return ""
    rest = text[m.end() :]
    stop = re.search(r"^#{1,3}\s", rest, re.M)
    body = rest[: stop.start()] if stop else rest[:2500]
    return re.sub(r"\s+", " ", body).strip()[:1600]


def main() -> None:
    for path in [Path(p) for p in sys.argv[1:]]:
        text = path.read_text(encoding="utf-8", errors="replace")
        print(f"{'=' * 70}\n{path.name}  ({len(text.splitlines())} lines)\n{'=' * 70}")
        print("ABSTRACT:", abstract(text) or "(not located)")
        heads = sections(text)
        print(f"\nSECTIONS ({len(heads)}):")
        for h in heads[:28]:
            print("  -", h)
        print()


if __name__ == "__main__":
    main()
