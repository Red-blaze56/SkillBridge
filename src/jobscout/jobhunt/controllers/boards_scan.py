"""`pnpm start:jobscout-boards`: scan EVERY company board for your profile.

Reads companies.yaml and every ats_matcher/*.csv, calls each company's public
ATS API (no scraper, no LLM, no email), applies the filters in config.yaml and
prints how many jobs were scanned / dropped / kept. Read-only: it never edits
companies.yaml, the CSVs, strikes or seen.json.
"""
from __future__ import annotations

import contextlib
import csv
import io
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

from ..config.settings import load_config, output_path
from ..services.boards import ENDPOINTS, hydrate
from ..services.company_finder import probe_detail
from ..services.experience import experience
from ..services.filters import prefilter_stats, too_experienced

WORKERS = 12
FIELDS = ["company", "ats", "title", "location", "experience", "posted_at", "salary", "url"]


def _targets(cfg: dict) -> tuple[list[dict], list[str]]:
    """Unique {ats, slug, name, source} from companies.yaml + ats_matcher CSVs."""
    seen: set[str] = set()
    out: list[dict] = []
    skipped: list[str] = []

    def add(ats: str, slug: str, name: str, source: str) -> None:
        ats, slug = ats.strip().lower(), slug.strip()
        if not ats or not slug:
            return
        if ats not in ENDPOINTS:
            skipped.append(f"{source}: {ats}:{slug}")
            return
        key = f"{ats}:{slug}"
        if key not in seen:
            seen.add(key)
            out.append({"ats": ats, "slug": slug, "name": name or slug, "source": source})

    yaml_name = cfg.get("companies_file", "companies.yaml")
    for c in load_config(yaml_name).get("companies") or []:
        if isinstance(c, dict) and c.get("ats") and c.get("slug"):
            add(str(c["ats"]), str(c["slug"]), str(c.get("name") or c["slug"]), yaml_name)

    folder = Path(cfg.get("ats_matcher_dir") or "ats_matcher")
    for path in sorted(folder.glob("*.csv")) if folder.is_dir() else []:
        with path.open(newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                tok = (r.get("token") or "").strip()
                add(r.get("provider") or "", tok, tok.replace("-", " ").replace("_", " ").title(), path.name)
    return out, skipped


def _fetch(t: dict) -> tuple[dict, str, str, list]:
    kind, status, jobs = probe_detail(t["ats"], t["slug"], requests.Session(), company=t["name"])
    return t, kind, status, jobs


def cmd_boards(args) -> int:
    cfg = load_config(args.config)
    filters = cfg.get("filters", {}) or {}
    targets, skipped = _targets(cfg)
    print(f"\n[1/3] calling {len(targets)} company board APIs ({WORKERS} at a time, no scraper, no LLM)")
    for s in skipped:
        print(f"  ! unsupported ATS, skipped: {s}")

    jobs, results = [], Counter()
    with ThreadPoolExecutor(WORKERS) as ex:
        for i, (t, kind, status, got) in enumerate(ex.map(_fetch, targets), 1):
            results[kind] += 1
            jobs.extend(got)
            if i % 50 == 0 or i == len(targets):
                print(f"  {i}/{len(targets)} boards done, {len(jobs)} jobs so far")

    print("\n[2/3] filtering for your profile")
    with contextlib.redirect_stdout(io.StringIO()):
        kept, dropped = prefilter_stats(jobs, filters)
    hydrate(kept)  # SmartRecruiters / Breezy lists have no description yet
    max_years = filters.get("max_experience_years")
    if max_years is not None:
        late = [j for j in kept if too_experienced(j, int(max_years))]
        dropped["experience"] += len(late)
        kept = [j for j in kept if j not in late]

    print("\n[3/3] saving")
    kept.sort(key=lambda j: (j.company.lower(), j.title.lower()))
    path = output_path("boards_scan.csv")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(FIELDS)
        for j in kept:
            w.writerow([j.company, j.ats, j.title, j.location, experience(j.title, j.description),
                        (j.posted_at or "")[:10], j.salary or "", j.url])

    by_company = Counter(j.company for j in kept)
    print(f"\n  companies: {len(targets)} called -> {results['ok']} ok, "
          f"{results['not_found'] + results['wrong_link']} dead/wrong link, "
          f"{results['temporary']} temporary errors")
    print(f"  jobs scanned: {len(jobs)}")
    print(f"  dropped: title={dropped['title']} location={dropped['location']} "
          f"experience={dropped['experience']} stale={dropped['age']} "
          f"(total {sum(dropped.values())})")
    print(f"  KEPT for your profile: {len(kept)} jobs from {len(by_company)} companies")
    for j in kept:
        print(f"    {j.company} | {j.title} | {j.location} | exp {experience(j.title, j.description)} | {j.url}")
    print(f"\n  saved: {path}")
    return 0
