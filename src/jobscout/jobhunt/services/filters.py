"""Deterministic filter that runs BEFORE any LLM call.

This is the whole cost story: ~2000 raw jobs -> ~40 candidates for ~0 rupees,
so Claude only ever reads jobs that already passed title + location +
experience + freshness.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from .experience import _FRESHER, experience
from ..models.job import Job

# Checked against the location only: "distributed" used to match job titles
# like "Distributed Systems Engineer" and let onsite US roles through.
REMOTE_HINTS = re.compile(r"\b(remote|anywhere|work from home|wfh)\b", re.I)


def _any_match(patterns: list[str], text: str) -> bool:
    return any(re.search(p, text, re.I) for p in patterns)


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    v = value.replace("Z", "+00:00")
    for fmt in (None, "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S"):
        try:
            dt = datetime.fromisoformat(v) if fmt is None else datetime.strptime(v, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def min_years(job: Job) -> int | None:
    """Lowest years of experience the JD asks for, or None if it doesn't say."""
    label = experience(job.title, job.description)
    m = re.match(r"\d+", label)
    return int(m.group()) if m else None


def too_experienced(job: Job, max_years: int | None) -> bool:
    if max_years is None or not job.description:
        return False  # no description yet (SmartRecruiters/Breezy): checked after hydrate()
    if _FRESHER.search(job.title):
        return False  # "Intern" / "New Grad" in the title beats a stray "3+ years" in the JD
    years = min_years(job)
    return years is not None and years > max_years


def prefilter_stats(jobs: list[Job], cfg: dict) -> tuple[list[Job], dict[str, int]]:
    """(kept jobs, drop counts by reason: title / location / experience / age)."""
    inc = cfg.get("include_titles") or [r"."]
    exc = cfg.get("exclude_titles") or []
    locs = [l.lower() for l in (cfg.get("locations") or [])]
    india = re.compile(r"\b(" + "|".join(re.escape(l) for l in locs) + r")\b", re.I) if locs else None
    allow_remote = bool(cfg.get("allow_remote", True))
    max_years = cfg.get("max_experience_years")
    max_years = int(max_years) if max_years is not None else None
    max_age = cfg.get("max_age_days")
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age) if max_age else None

    kept, stats = [], {"title": 0, "location": 0, "experience": 0, "age": 0}
    for j in jobs:
        if not _any_match(inc, j.title) or (exc and _any_match(exc, j.title)):
            stats["title"] += 1
            continue

        # Anywhere in India passes; outside India only remote passes.
        if india:
            in_india = bool(india.search(j.location or "")) or bool(india.search(j.title))
            is_remote = allow_remote and bool(REMOTE_HINTS.search(j.location or ""))
            if not in_india and not is_remote:
                stats["location"] += 1
                continue

        if too_experienced(j, max_years):
            stats["experience"] += 1
            continue

        if cutoff:
            posted = _parse_date(j.posted_at)
            if posted and posted < cutoff:
                stats["age"] += 1
                continue

        kept.append(j)

    print(f"  prefilter: {len(jobs)} -> {len(kept)} "
          f"(dropped title={stats['title']} location={stats['location']} "
          f"experience={stats['experience']} stale={stats['age']})")
    return kept, stats


def prefilter(jobs: list[Job], cfg: dict) -> list[Job]:
    return prefilter_stats(jobs, cfg)[0]
