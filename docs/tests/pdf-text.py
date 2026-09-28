#!/usr/bin/env python3
"""Extract readable body text from one PDF without a PDF library.

Pulls FlateDecode content streams and mines text-showing operators, then
reflows to a rough prose order. Good enough to read a paper's method section;
not a layout-accurate converter.

Usage: python pdf-text.py <file.pdf> [max_pages] [start_page]
"""

from __future__ import annotations

import re
import sys
import zlib
from pathlib import Path

# Text-showing operators across PDF content streams.
SHOW = re.compile(rb"\((?:\\.|[^\\()])*\)\s*Tj|\[(?:[^\[\]]*)\]\s*TJ")
STR = re.compile(rb"\((?:\\.|[^\\()])*\)")
# Page objects so we can walk pages in order.
PAGE = re.compile(rb"/Type\s*/Page\b")


def content_streams(data: bytes):
    for m in re.finditer(rb"stream\r?\n", data):
        start = m.end()
        end = data.find(b"endstream", start)
        if end < 0:
            continue
        raw = data[start:end]
        try:
            yield zlib.decompress(raw)
        except zlib.error:
            # Some streams are stored uncompressed.
            if b" Tj" in raw or b" TJ" in raw:
                yield raw


def pdf_string(raw: bytes) -> str:
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
                j, oct_digits = i + 1, b""
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


def stream_text(stream: bytes) -> str:
    """Rebuild readable text; TJ arrays and Tj strings are concatenated."""
    chunks: list[str] = []
    for m in SHOW.finditer(stream):
        token = m.group(0)
        seg = "".join(pdf_string(s.group(0)[1:-1]) for s in STR.finditer(token))
        chunks.append(seg)
    text = "".join(chunks)
    # A tight kern between glyph runs arrives as adjacent CJK/latin; keep as-is.
    return text


LIGATURES = {
    "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl",
    "\u00a0": " ", "\u2019": "'", "\u201c": '"', "\u201d": '"',
    "\u2013": "-", "\u2014": " -- ", "\u2026": "...",
}


def normalize(text: str) -> str:
    for bad, good in LIGATURES.items():
        text = text.replace(bad, good)
    # Insert spaces where a lowercase->uppercase join lost its separator, but
    # never inside CJK runs (CJK is written without spaces).
    text = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def safe_write(text: str) -> None:
    buf = getattr(sys.stdout, "buffer", None)
    if buf is None:
        sys.stdout.write(text.encode("ascii", "replace").decode("ascii"))
        return
    buf.write((text + "\n").encode("utf-8", "replace"))
    buf.flush()


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        safe_write(__doc__)
        return 2
    path = Path(argv[1])
    max_pages = int(argv[2]) if len(argv) > 2 else 999
    start_page = int(argv[3]) if len(argv) > 3 else 0
    if not path.is_file():
        safe_write(f"not found: {path}")
        return 2

    data = path.read_bytes()
    pages = [content_streams(data)]
    # Re-derive per-page streams by walking the raw file once and splitting on
    # page boundaries. Cheap approximation: every stream in file order.
    all_streams = list(content_streams(data))
    del pages

    safe_write(f"==== {path.name} : {len(all_streams)} content streams ====")
    shown = 0
    for idx, stream in enumerate(all_streams):
        text = normalize(stream_text(stream))
        if len(text) < 40:
            continue
        if idx < start_page:
            continue
        if shown >= max_pages:
            break
        shown += 1
        safe_write(f"\n----- stream {idx} -----\n{text}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
