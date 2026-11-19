"""SERVICE: one row per job, even when several sites or cities post it.

Two rows are the same job when their company + title match after cleanup
("Electronic Arts (EA)" / "JAVA Software Engineer Intern" ==
 "Electronic Arts" / "Java Software Engineer Intern"). Location is left out:
Glassdoor often has none, and one role is often posted in several cities.
"""
from __future__ import annotations

import re
from pathlib import Path

from ...repositories.scraper_csv import _read

_COMPANY_SUFFIX = re.compile(r"\b(pvt|private|ltd|limited|llp|inc|co|corp|corporation)\b")


def fingerprint(company: str, title: str) -> str:
    """Same company + same title = same job, whatever site or city posted it.
    "WeIntern Pvt Ltd" / "Full-Stack Developer" == "weintern" / "Fullstack developer"."""
    clean = lambda s: re.sub(r"[^a-z0-9]", "", s)
    # "Electronic Arts (EA)" == "Electronic Arts"
    company = re.sub(r"\([^)]*\)", " ", (company or "").lower())
    return f"{clean(_COMPANY_SUFFIX.sub(' ', company))}|{clean((title or '').lower())}"


def _row_fingerprint(r: dict) -> str:
    # No company name: two different jobs would share a fingerprint, so use the link.
    if (r.get("Company") or "").strip():
        return fingerprint(r["Company"], r.get("Role") or "")
    return r.get("Link") or ""


def merge_duplicates(rows: list[dict], saved: set[str]) -> tuple[list[dict], int]:
    """One row per job. A repeat of an earlier row (another site or city) adds its
    location to that row and its site + link to "Also On"; a job already in any
    site's CSV (`saved` fingerprints) is skipped. Returns (rows, how many dropped)."""
    kept: dict[str, dict] = {}
    dropped = 0
    for r in rows:
        fp = _row_fingerprint(r)
        if fp in saved:
            dropped += 1
            continue
        first = kept.get(fp)
        if first is None:
            kept[fp] = dict(r)
            continue
        dropped += 1
        if r["Location"] and r["Location"] not in first["Location"]:
            first["Location"] = ", ".join(p for p in (first["Location"], r["Location"]) if p)
        if r["Link"] != first["Link"]:
            other = f"{r['Site']}: {r['Link']}"
            first["Also On"] = "; ".join(p for p in (first["Also On"], other) if p)
    return list(kept.values()), dropped


def saved_fingerprints(out_dir: Path) -> set[str]:
    """Fingerprints of every job already in any <site>_jobs.csv."""
    found = set()
    for path in sorted(out_dir.glob("*_jobs.csv")):
        try:
            found |= {_row_fingerprint(r) for r in _read(path) if r.get("Link")}
        except (OSError, KeyError):
            continue
    return found
