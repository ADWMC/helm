"""Fetch arXiv papers with a compliant User-Agent.

The arxiv-skill's cache_paper.py fails here for two reasons, neither of them
configurable from outside:
  1. It calls Result.download_pdf(), which exists in arxiv 2.x/3.x but was
     removed in arxiv 4.x. Their pyproject pins "arxiv>=2.1.0" with no upper
     bound, so a clean install resolves to 4.x and the call vanishes.
  2. It sends no User-Agent, and arXiv answers the PDF endpoint with HTTP 406.

This script does one job: take arXiv IDs, download the PDF with a polite UA,
convert to markdown, and store it. The conversion reuses pymupdf4llm, the same
library the skill uses, so the output shape matches what it expects.
"""

from __future__ import annotations

import sys
import time
import urllib.request
from pathlib import Path

import pymupdf4llm

UA = "helm-research/0.1 (arxiv reference harvest; contact: local)"
STORE = Path(sys.argv[1])
IDS = sys.argv[2:]


def fetch(arxiv_id: str) -> tuple[Path, Path]:
    pdf = STORE / f"{arxiv_id}.pdf"
    md = STORE / f"{arxiv_id}.md"
    if md.exists():
        return pdf, md
    url = f"https://arxiv.org/pdf/{arxiv_id}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        pdf.write_bytes(resp.read())
    md.write_text(pymupdf4llm.to_markdown(str(pdf), show_progress=False), encoding="utf-8")
    pdf.unlink()
    return pdf, md


def main() -> None:
    STORE.mkdir(parents=True, exist_ok=True)
    for arxiv_id in IDS:
        try:
            _, md = fetch(arxiv_id)
            print(f"  OK   {arxiv_id}  {md.stat().st_size:>7} B  {len(md.read_text(encoding='utf-8').splitlines()):>5} lines")
        except Exception as exc:  # noqa: BLE001 - report and continue the batch
            print(f"  FAIL {arxiv_id}  {type(exc).__name__}: {exc}")
        time.sleep(3)  # arXiv asks for a delay between requests


if __name__ == "__main__":
    main()
