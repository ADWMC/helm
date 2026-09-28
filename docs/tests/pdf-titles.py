#!/usr/bin/env python3
"""Extract the title (and abstract head) of every paper in the xuexi folder.

Reads raw PDF bytes and pulls the first plausible title line without a PDF
library: decompresses FlateDecode streams and mines text-showing operators.
Falls back to the filename when nothing usable is found.
"""

from __future__ import annotations

import re
import sys
import zlib
from pathlib import Path

TITLE_OP = re.compile(rb"\((?:\\.|[^\\()])*\)\s*Tj|\[(?:[^\[\]]*)\]\s*TJ")


def streams(data: bytes):
    for m in re.finditer(rb"stream\r?\n", data):
        start = m.end()
        end = data.find(b"endstream", start)
        if end < 0:
            continue
        raw = data[start:end]
        try:
            yield zlib.decompress(raw)
        except zlib.error:
            continue


def decode_pdf_string(raw: bytes) -> str:
    out: list[str] = []
    i = 0
    while i < len(raw):
        c = raw[i : i + 1]
        if c == b"\\" and i + 1 < len(raw):
            nxt = raw[i + 1 : i + 2]
            if nxt in (b"(", b")", b"\\"):
                out.append(nxt.decode("latin-1"))
                i += 2
                continue
            if nxt in (b"n", b"r", b"t"):
                out.append({"n": "\n", "r": "\r", "t": "\t"}[nxt.decode()])
                i += 2
                continue
            if nxt.isdigit():
                j = i + 1
                oct_digits = b""
                while j < len(raw) and raw[j : j + 1].isdigit() and len(oct_digits) < 3:
                    oct_digits += raw[j : j + 1]
                    j += 1
                try:
                    out.append(chr(int(oct_digits, 8)))
                except ValueError:
                    pass
                i = j
                continue
            i += 2
            continue
        out.append(c.decode("latin-1", "replace"))
        i += 1
    return "".join(out)


def page_text(stream: bytes) -> str:
    parts: list[str] = []
    for m in TITLE_OP.finditer(stream):
        token = m.group(0)
        for s in re.finditer(rb"\((?:\\.|[^\\()])*\)", token):
            parts.append(decode_pdf_string(s.group(0)[1:-1]))
    return "".join(parts)


def looks_like_title(text: str) -> bool:
    t = text.strip()
    if not (12 <= len(t) <= 220):
        return False
    if t.count(" ") < 2 and len(t) < 30:
        return False
    # Skip math/ligature soup and obvious body sentences.
    letters = sum(ch.isalpha() for ch in t)
    if letters < len(t) * 0.55:
        return False
    if t.startswith(("arXiv:", "Preprint", "ABSTRACT")):
        return False
    # Body prose leaks in when the title sits on a page whose first text run is
    # a continuation fragment. Titles do not end mid-word and rarely start with
    # a lowercase letter or a sentence-final period.
    if t[0].islower():
        return False
    if t.endswith((".", ",", ";", ":", "and", "the", "of", "to")):
        return False
    return True


def title_for(path: Path) -> str:
    try:
        data = path.read_bytes()
    except OSError as exc:
        return f"<unreadable: {exc}>"
    candidates: list[str] = []
    for stream in streams(data):
        txt = page_text(stream)
        if not txt:
            continue
        for line in txt.splitlines():
            if looks_like_title(line):
                candidates.append(line.strip())
        if len(candidates) >= 4:
            break
    if candidates:
        # First long-enough candidate is almost always the title on page 1.
        return max(candidates[:4], key=len)
    return "<no title extracted>"


def safe_write(text: str) -> None:
    """Write UTF-8 to stdout regardless of the console codepage."""
    buf = getattr(sys.stdout, "buffer", None)
    if buf is None:
        sys.stdout.write(text.encode("ascii", "replace").decode("ascii"))
        return
    buf.write((text + "\n").encode("utf-8", "replace"))
    buf.flush()


def main(argv: list[str]) -> int:
    root = Path(argv[1]) if len(argv) > 1 else Path(".")
    pdfs = sorted(p for p in root.rglob("*.pdf"))
    safe_write(f"papers: {len(pdfs)}\n")
    for p in pdfs:
        safe_write(f"{p.stem}\t{title_for(p)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
