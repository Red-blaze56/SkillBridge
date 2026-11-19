"""SERVICE: the CSV files in output/scraper/ (one per site).

  save()            append new rows to <site>_jobs.csv
  _cleanup_old_rows() delete rows older than retention_days
  load_saved()      unscored rows -> Jobs, for `start:jobscout` to score
  sample_per_site() pick a few of them per site per run
  write_scores()    put the AI score back into the row
"""
from __future__ import annotations

import csv
import random
import re
from datetime import datetime, timedelta
from pathlib import Path

from ..models.job import Job
from ..models.scraped_row import HEADER

ROOT = Path(__file__).resolve().parents[2]          # src/jobscout
DEFAULT_OUT = ROOT.parent.parent / "output" / "scraper"
SITES = ("linkedin", "indeed", "glassdoor", "naukri", "google",
         "zip_recruiter", "bayt", "bdjobs", "hellowork")


def _saved_links(path: Path) -> set[str]:
    """Links already in the CSV. A file written with other columns is rewritten
    under HEADER first, keeping every row (new columns start empty)."""
    if not path.exists():
        return set()
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)
    if reader.fieldnames != HEADER:
        _write(path, rows)
    return {r.get("Link", "") for r in rows}


def _read(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _write(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=HEADER, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def load_saved(out_dir: Path) -> list[Job]:
    """Saved scraper rows not scored yet, as Jobs for `run` to filter and score.
    job_id is "<site>:<link>", so seen.json keeps each one to a single scoring."""
    jobs = []
    for path in sorted(out_dir.glob("*_jobs.csv")):
        site = path.name[:-len("_jobs.csv")]
        for r in _read(path):
            link = r.get("Link") or ""
            if not link or (r.get("Score") or "").strip():
                continue
            location = r.get("Location") or ""
            if r.get("Work Mode") == "Remote" and "remote" not in location.lower():
                location = f"{location} / Remote" if location else "Remote"
            years = r.get("Experience (yrs)") or ""
            desc = r.get("Description") or ""
            if re.match(r"\d", years):
                desc = f"Experience: {years} years\n\n{desc}"
            jobs.append(Job(job_id=f"{site}:{link}", ats=site, company=r.get("Company") or "",
                            title=r.get("Role") or "", location=location, url=link,
                            description=desc, posted_at=r.get("Posted") or None,
                            salary=r.get("Salary") or None))
    return jobs


def sample_per_site(jobs: list[Job], per_site: int) -> tuple[list[Job], int]:
    """Keep every board job and at most `per_site` random scraper jobs per site.
    The rest are not scored, so they stay unseen and get picked in a later run.
    Returns (kept, how many scraper jobs wait)."""
    by_site: dict[str, list[Job]] = {}
    for j in jobs:
        if j.ats in SITES:
            by_site.setdefault(j.ats, []).append(j)
    picked = {id(j) for group in by_site.values()
              for j in random.sample(group, min(per_site, len(group)))}
    kept = [j for j in jobs if j.ats not in SITES or id(j) in picked]
    return kept, len(jobs) - len(kept)


def _cleanup_old_rows(out_dir: Path, max_age_days: int = 4,
                      per_site: dict[str, int] | None = None) -> None:
    """Delete job rows older than max_age_days from each site CSV; a site in
    `per_site` uses its own number of days (e.g. {"linkedin": 2}).
    Rows with an unparseable Date are kept (never silently dropped)."""
    if not out_dir.exists():
        return
    for path in sorted(out_dir.glob("*_jobs.csv")):
        site = path.name[:-len("_jobs.csv")]
        cutoff = datetime.now() - timedelta(days=(per_site or {}).get(site, max_age_days))
        try:
            rows = _read(path)
        except OSError:
            continue
        if not rows:
            continue
        kept = []
        for r in rows:
            date_str = (r.get("Date") or "")[:10]
            try:
                row_date = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                kept.append(r)
                continue
            if row_date >= cutoff:
                kept.append(r)
        if len(kept) != len(rows):
            _write(path, kept)


def write_scores(out_dir: Path, jobs: list[Job]) -> None:
    """Fill Score + AI Reason into each scored job's row in its site CSV. Never raises."""
    by_site: dict[str, dict[str, Job]] = {}
    for j in jobs:
        if j.ats in SITES and j.score is not None:
            by_site.setdefault(j.ats, {})[j.url] = j
    for site, by_link in by_site.items():
        path = out_dir / f"{site}_jobs.csv"
        try:
            if not path.exists():
                continue
            rows = _read(path)
            for r in rows:
                j = by_link.get(r.get("Link") or "")
                if j:
                    r["Score"], r["AI Reason"] = f"{j.score:.1f}", j.reason or ""
            _write(path, rows)
        except OSError as e:  # usually the CSV is open in Excel
            print(f"  ! could not write scores to {path} ({e}) — close it in Excel; "
                  f"the scores are still in the email and jobs.csv")


def save(site: str, rows: list[dict], out_dir: Path) -> tuple[int, Path | None]:
    """Append rows to <out_dir>/<site>_jobs.csv, skipping links already saved.
    Returns (rows added, path)."""
    path = out_dir / f"{site}_jobs.csv"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        seen = _saved_links(path)
        new_file = not path.exists()
        added = 0
        with path.open("a", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=HEADER)
            if new_file:
                w.writeheader()
            for r in rows:
                if not r["Link"] or r["Link"] in seen:
                    continue
                seen.add(r["Link"])
                w.writerow(r)
                added += 1
        return added, path
    except OSError as e:  # usually the CSV is open in Excel
        print(f"  ! could not write {path} ({e}) — close it in Excel and re-run")
        return 0, None
