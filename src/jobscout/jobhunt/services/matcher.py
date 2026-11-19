"""Per-run company batch.

Each run checks a random slice of companies.yaml plus a few picks from each
ats_matcher/*.csv. CSV picks with a live board always move into companies.yaml.
0 jobs matching the filters is a strike (shared with `check`); at
`zero_match_limit` strikes the company is removed to failed_max_retries.csv. A
dead link is removed to failed_not_found.csv. Temporary errors remove nothing.
"""
from __future__ import annotations

import contextlib
import csv
import io
import random
import re
import time
from pathlib import Path

import requests

from ..models.job import Job
from ..repositories.companies_yaml import (MAX_RETRIES_FILE, NOT_FOUND_FILE, PASSED_FILE,
                                          STATE_FILE, add_to_companies_yaml, load_streaks,
                                          log_rows, remove_from_companies_yaml, save_streaks,
                                          today)
from .company_finder import probe_detail
from .boards import ENDPOINTS
from .filters import prefilter

PASSED_FIELDS = ["date", "company", "ats", "slug", "jobs_mailed", "roles"]


# ------------------------------------------------------------------ CSVs ---

def _read_csv(path: Path) -> tuple[list[str], list[dict]]:
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), list(reader)


def _pretty(token: str) -> str:
    return re.sub(r"[-_]+", " ", token).strip().title() or token


def pick_from_csvs(folder: Path, per_file: int) -> list[dict]:
    picks = []
    for path in sorted(folder.glob("*.csv")):
        _, rows = _read_csv(path)
        rows = [r for r in rows if (r.get("provider") or "").strip() and (r.get("token") or "").strip()]
        usable = [r for r in rows if r["provider"].strip().lower() in ENDPOINTS]
        if len(usable) < len(rows):
            print(f"  ! {path.name}: {len(rows) - len(usable)} row(s) use an ATS this tool can't read — skipped")
        for r in random.sample(usable, min(per_file, len(usable))):
            token = r["token"].strip()
            picks.append({"ats": r["provider"].strip().lower(), "slug": token,
                          "name": _pretty(token), "source": path})
    return picks


def remove_rows(path: Path, slugs: set[str]) -> None:
    fields, rows = _read_csv(path)
    kept = [r for r in rows if (r.get("token") or "").strip() not in slugs]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(kept)


def csv_rows_left(folder: Path) -> int:
    return sum(len(_read_csv(p)[1]) for p in folder.glob("*.csv")) if folder.is_dir() else 0


# ------------------------------------------------------------------- run ---

def run_batch(companies_path: Path, companies: list[dict], cfg: dict,
              filters: dict) -> tuple[list[Job], dict[str, int]]:
    """Probe this run's companies once each, apply the add/remove rules, and
    return the jobs from every company that stays, plus the counts the digest
    shows (companies checked from each source, added, removed)."""
    yaml_n = int(cfg.get("companies_sample_size") or 0)
    per_file = int(cfg.get("ats_matcher_per_file") or 0)
    limit = max(1, int(cfg.get("zero_match_limit") or 3))
    folder = Path(cfg.get("ats_matcher_dir") or "ats_matcher")
    state_path = Path(cfg.get("matcher_state_file") or STATE_FILE)

    streaks = load_streaks(state_path)
    in_yaml = {f"{c['ats']}:{c['slug']}" for c in companies}
    yaml_picks = random.sample(companies, yaml_n) if yaml_n and len(companies) > yaml_n else list(companies)
    csv_picks = pick_from_csvs(folder, per_file) if per_file and folder.is_dir() else []
    print(f"  checking {len(yaml_picks)} random from {companies_path.name} + "
          f"{len(csv_picks)} from {folder.name}/")

    batch = [{**c, "source": None} for c in yaml_picks] + csv_picks

    session = requests.Session()
    jobs: list[Job] = []
    table, not_found, max_retries = [], [], []
    add_yaml: list[dict] = []
    drop_yaml: set[tuple[str, str]] = set()
    drop_csv: dict[Path, set[str]] = {}
    kept = 0

    for c in batch:
        ats, slug = str(c["ats"]), str(c["slug"])
        name = str(c.get("name") or slug)
        key = f"{ats}:{slug}"
        from_csv = c["source"] is not None
        src = c["source"].name if from_csv else companies_path.name
        if ats not in ENDPOINTS:
            table.append((name, src, "SKIP", "0", "-", f"unknown ats '{ats}'"))
            continue
        if from_csv and key in in_yaml:
            drop_csv.setdefault(c["source"], set()).add(slug)
            table.append((name, src, "SKIP", "-", "-", f"already in {companies_path.name}"))
            continue

        kind, status, got = probe_detail(ats, slug, session, company=name)
        time.sleep(0.25)
        matching = 0
        if kind == "ok":
            with contextlib.redirect_stdout(io.StringIO()):
                matching = len(prefilter(got, filters))
        log = {"date": today(), "company": name, "ats": ats, "slug": slug,
               "source": c["source"].name if from_csv else companies_path.name,
               "jobs": len(got), "matching": matching}

        if kind == "temporary" or (kind == "wrong_link" and not from_csv):
            result, reason = "KEPT", f"{status}, retry next time"
            kept += 1
        elif kind in ("not_found", "wrong_link"):
            result, reason = "FAILED", "not found"
            not_found.append({**log, "reason": reason})
            if from_csv:
                drop_csv.setdefault(c["source"], set()).add(slug)
            else:
                drop_yaml.add((ats, slug))
            streaks.pop(key, None)
        else:
            jobs.extend(got)
            if from_csv:
                drop_csv.setdefault(c["source"], set()).add(slug)
            if matching:
                streaks.pop(key, None)
                result, reason = ("ADDED", f"added to {companies_path.name}") if from_csv else ("OK", "")
                if from_csv:
                    add_yaml.append(c)
            else:
                streaks[key] = streaks.get(key, 0) + 1
                if streaks[key] >= limit:
                    result, reason = "FAILED", f"0 matching jobs {limit} runs"
                    max_retries.append({**log, "reason": reason})
                    streaks.pop(key)
                    if not from_csv:
                        drop_yaml.add((ats, slug))
                elif from_csv:
                    result, reason = "ADDED", f"added, 0 matching jobs (strike {streaks[key]}/{limit})"
                    add_yaml.append(c)
                else:
                    result, reason = "OK", f"0 matching jobs (strike {streaks[key]}/{limit})"
        table.append((name, src, result, str(len(got)), str(matching), reason))

    for path, slugs in drop_csv.items():
        remove_rows(path, slugs)
    added = add_to_companies_yaml(companies_path, add_yaml)
    removed = remove_from_companies_yaml(companies_path, drop_yaml)
    save_streaks(state_path, streaks)
    nf_path = log_rows(not_found, NOT_FOUND_FILE)
    mr_path = log_rows(max_retries, MAX_RETRIES_FILE)

    header = ("Company", "From", "Result", "Jobs", "Matching", "Reason")
    widths = [max(len(r[i]) for r in [header, *table]) for i in range(len(header))]
    print()
    for r in [header, *table]:
        print("  " + "  ".join(
            cell.rjust(w) if i in (3, 4) else cell.ljust(w)
            for i, (cell, w) in enumerate(zip(r, widths))).rstrip())
    print(f"\n  {len(table)} checked, +{added} added to {companies_path.name}, "
          f"-{removed} removed from it, {len(not_found)} not found, "
          f"{len(max_retries)} hit {limit} strikes, {kept} kept (temporary errors), "
          f"{csv_rows_left(folder)} CSV rows left")
    for label, p in (("not found", nf_path), ("max retries", mr_path)):
        if p:
            print(f"  {label}: {p}")
    return jobs, {"from_yaml": len(yaml_picks), "from_csv": len(csv_picks),
                  "added": added, "removed": removed}


def log_passed(jobs: list[Job]) -> Path | None:
    """One passed.csv row per company whose jobs were just emailed."""
    by_company: dict[tuple[str, str, str], list[str]] = {}
    for j in jobs:
        if j.ats not in ENDPOINTS:  # LinkedIn/Naukri... jobs from the scraper have no board
            continue
        ats, slug, _ = j.job_id.split(":", 2)
        by_company.setdefault((j.company, ats, slug), []).append(j.title)
    rows = [{"date": today(), "company": company, "ats": ats, "slug": slug,
             "jobs_mailed": len(titles), "roles": " | ".join(titles)}
            for (company, ats, slug), titles in by_company.items()]
    path = log_rows(rows, PASSED_FILE, PASSED_FIELDS)
    if path:
        print(f"  passed: {len(rows)} compan{'y' if len(rows) == 1 else 'ies'} mailed -> {path}")
    return path
