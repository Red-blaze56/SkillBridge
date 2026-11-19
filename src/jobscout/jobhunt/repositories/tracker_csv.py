"""Append the emailed shortlist to a CSV that is never overwritten."""
from __future__ import annotations

import csv
import os
from datetime import datetime
from pathlib import Path

from ..models.job import Job
from ..services.experience import experience, role_category

HEADER = ["Date", "Company", "Role", "Role Category", "Experience (yrs)",
          "Score", "Location", "Link"]

def _existing_links(path: Path) -> set[str]:
    if not path.exists():
        return set()
    with path.open(newline="", encoding="utf-8") as fh:
        return {row.get("Link", "") for row in csv.DictReader(fh)}


def export_jobs(jobs: list[Job], out_dir: str | Path | None = None) -> Path | None:
    """Append jobs to jobs.csv, skipping links already saved. Never raises."""
    out = Path(out_dir or os.environ.get("JOBSCOUT_OUTPUT_DIR") or "out")
    path = out / "jobs.csv"
    try:
        out.mkdir(parents=True, exist_ok=True)
        seen = _existing_links(path)
        new_file = not path.exists()
        today = datetime.now().strftime("%Y-%m-%d")
        added = 0
        with path.open("a", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            if new_file:
                w.writerow(HEADER)
            for j in jobs:
                if j.url in seen:
                    continue
                seen.add(j.url)
                w.writerow([
                    today, j.company, j.title,
                    role_category(j.title, j.description),
                    experience(j.title, j.description),
                    f"{j.score:.1f}" if j.score is not None else "",
                    j.location, j.url,
                ])
                added += 1
        print(f"  saved {added} new job(s) to {path}")
        return path
    except OSError as e:  # usually the CSV is open in Excel
        print(f"  ! could not write {path} ({e}) — close it in Excel and re-run")
        return None
