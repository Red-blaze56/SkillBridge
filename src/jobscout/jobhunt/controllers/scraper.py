"""`pnpm start:scraper` (and `start:jobscout-delete-all`): the scraper flow, top to bottom.

  1. delete rows older than retention_days (LinkedIn: linkedin_retention_days)
  2. for each site, for each search term: search (cards only on LinkedIn/Naukri)
     and filter on title / location / age
  3. LinkedIn, Naukri: open the pages of the jobs that passed, filter again
     (now the experience check can read the description)
  4. drop unpaid internship posts (needs the description, so it comes after 3)
  5. merge the same job from several sites / cities into one row, and skip
     jobs already in any site's CSV
  6. save to output/scraper/<site>_jobs.csv and print the summary table
"""
from __future__ import annotations

import contextlib
import io
import time

from ..config.settings import load_config, scraper_dir
from ..models.job import Job
from ..models.scraped_row import to_row
from ..repositories.scraper_csv import SITES, _cleanup_old_rows, save
from ..services.filters import prefilter
from ..services.scraper.dedup import merge_duplicates, saved_fingerprints
from ..services.scraper.sources import (hours_old, load_details, per_site, results_wanted,
                                        search, two_pass)
from ..services.scraper.unpaid import is_unpaid_internship
from ..views import scraper_console as view


def run(cfg: dict, filters: dict, sites: list[str] | None = None,
        terms: list[str] | None = None, results: int | None = None,
        use_filters: bool | None = None) -> int:
    """`start:scraper`. sites / terms / results / use_filters override config.yaml
    (the --site / --term / --results / --no-filter flags). Returns an exit code."""
    sc = dict(cfg.get("scraper") or {})
    if results:                       # --results N: the same N for every site
        sc = {k: v for k, v in sc.items() if not k.endswith("_results_wanted")}
        sc["results_wanted"] = results
    sites = sites or sc.get("sites") or ["linkedin", "indeed", "glassdoor", "naukri"]
    terms = terms or sc.get("search_terms") or ["software engineer"]
    apply_filters = sc.get("apply_filters", True) if use_filters is None else use_filters
    drop_unpaid = apply_filters and sc.get("drop_unpaid_internships", True)
    out_dir = scraper_dir()
    pause = float(sc.get("pause_seconds", 3))

    bad = [s for s in sites if s not in SITES]
    if bad:
        view.unknown_sites(bad, SITES)
        return 1
    view.start_log(out_dir)

    # 1. delete old rows: retention_days, or a site's own <site>_retention_days
    _cleanup_old_rows(out_dir, max_age_days=int(sc.get("retention_days", 4)),
                      per_site={s: per_site(s, sc, "retention_days") for s in SITES
                                if sc.get(f"{s}_retention_days")})
    view.start(sites, terms, sc, apply_filters,
               windows={s: hours_old(s, sc) for s in sites if hours_old(s, sc)},
               results={s: results_wanted(s, sc) for s in sites})

    def keep(pairs: list[tuple[Job, dict]]) -> list[tuple[Job, dict]]:
        """The same title / location / experience / age filters as the main run."""
        if not apply_filters or not pairs:
            return pairs
        with contextlib.redirect_stdout(io.StringIO()):
            passed = {id(j) for j in prefilter([j for j, _ in pairs], filters)}
        return [(j, r) for j, r in pairs if id(j) in passed]

    # 2 + 3 + 4. search every site, filter, load job pages, drop unpaid internships
    stats: dict[str, dict] = {}
    rows: list[dict] = []
    for site in sites:
        view.site_start(site)
        began = time.time()
        found, passed = _search_site(site, terms, sc, keep, pause, drop_unpaid)
        rows += passed
        stats[site] = {"found": found, "passed": len(passed)}
        view.site_done(site, found, len(passed), time.time() - began)

    # 5. one row per job: the same job from another site or city is merged into
    #    the first one found, and a job already in any CSV is skipped
    rows, _ = merge_duplicates(rows, saved_fingerprints(out_dir))

    # 6. save, then show what happened
    table = []
    for site in sites:
        mine = [r for r in rows if r["Site"] == site]
        added, path = save(site, mine, out_dir)
        s = stats[site]
        table.append((site, s["found"], s["passed"], s["passed"] - len(mine), added, path))
    view.summary(table)
    if not any(found for _, found, *_ in table):
        view.nothing_found()
        return 1
    return 0


def _search_site(site: str, terms: list[str], sc: dict, keep, pause: float,
                 drop_unpaid: bool = False) -> tuple[int, list[dict]]:
    """Every term on one site -> (jobs the site returned, CSV rows that passed)."""
    found, by_url = 0, {}
    for term in terms:
        pairs = search(site, term, sc)
        if pairs is None:                            # the search failed; already reported
            time.sleep(pause)
            continue
        found += len(pairs)
        # On LinkedIn / Naukri there is no description yet, so this checks title,
        # location and age; experience is checked once the pages load below.
        got = keep(pairs)
        for j, r in got:
            by_url.setdefault(j.url, (j, r, term))   # a job found by 2 terms counts once
        view.term_done(site, term, len(pairs), len(got))
        time.sleep(pause)

    candidates = list(by_url.values())
    if two_pass(site, sc) and candidates:
        view.loading_pages(site, len(candidates))
        term_of = {j.url: t for j, _, t in candidates}
        pages: dict = {}
        loaded = keep(load_details(site, [(j, r) for j, r, _ in candidates], sc, stats=pages))
        view.pages_done(site, len(loaded), len(candidates) - len(loaded), pages.get("failed", 0))
        candidates = [(j, r, term_of.get(j.url, "")) for j, r in loaded]

    if drop_unpaid:
        paid = [(j, r, t) for j, r, t in candidates
                if not is_unpaid_internship(j.title, j.description, str(r.get("job_type") or ""))]
        if len(paid) < len(candidates):
            view.unpaid_dropped(site, len(candidates) - len(paid))
        candidates = paid
    return found, [to_row(site, j, r, t) for j, r, t in candidates]


def cmd_scrape(args) -> int:
    cfg = load_config(args.config)
    return run(cfg, cfg.get("filters", {}) or {}, sites=args.site, terms=args.term,
               results=args.results, use_filters=False if args.no_filter else None)


def cmd_delete_all(args) -> int:
    """Delete all saved scraper CSVs (LinkedIn, Indeed, Glassdoor, Naukri, ...).

    Wipes output/scraper/*_jobs.csv so jobhunt-s starts fresh. Does not touch
    seen.json or the normal ATS board run.
    """
    out_dir = scraper_dir()
    if not out_dir.exists():
        print(f"scraper dir not found: {out_dir}")
        return 0
    deleted = 0
    for path in sorted(out_dir.glob("*_jobs.csv")):
        path.unlink()
        deleted += 1
        print(f"  deleted {path.name}")
    print(f"\ndeleted {deleted} scraper CSV file(s) from {out_dir}")
    return 0
