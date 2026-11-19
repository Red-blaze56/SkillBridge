"""SERVICE: talking to the job sites (through JobSpy).

  search()        one site + one search term -> raw rows
  load_details()  open each job's own page for its description (LinkedIn, Naukri)

Everything that knows about JobSpy lives here, so if JobSpy changes, only
this file changes.
"""
from __future__ import annotations

import logging
import random
import time
from datetime import datetime

from ...models.job import Job
from ...models.scraped_row import _to_job, _val
from ...views import scraper_console as view

# These sites open one page per job for its description, so `run` asks for the
# cards first and loads descriptions only for jobs that pass the filters.
# Indeed and Google carry the description in the search reply already, and
# Glassdoor loads a whole page of descriptions in one request.
DETAIL_SITES = ("linkedin", "naukri")


def _linkedin_newest_first() -> None:
    """Make LinkedIn sort results newest first (sortBy=DD). JobSpy has no option
    for it, so its search params are wrapped once; if JobSpy changes, nothing happens."""
    try:
        from jobspy.linkedin import LinkedIn
        original = LinkedIn._search_params
    except (ImportError, AttributeError):
        return
    if getattr(original, "newest_first", False):
        return

    def params(self) -> dict:
        return {**original(self), "sortBy": "DD"}

    params.newest_first = True
    LinkedIn._search_params = params


def per_site(site: str, cfg: dict, key: str) -> int | None:
    """A scraper setting for one site: `<site>_<key>` wins over `<key>`.
    e.g. linkedin_results_wanted: 20 for LinkedIn, results_wanted: 25 for the rest."""
    value = cfg.get(f"{site}_{key}") or cfg.get(key)
    return int(value) if value else None


def hours_old(site: str, cfg: dict) -> int | None:
    """Only jobs posted in the last N hours (linkedin_hours_old / hours_old)."""
    return per_site(site, cfg, "hours_old")


def results_wanted(site: str, cfg: dict) -> int:
    """Jobs to ask for per search (linkedin_results_wanted / results_wanted)."""
    return per_site(site, cfg, "results_wanted") or 30


def two_pass(site: str, cfg: dict) -> bool:
    """True when `site` is searched cards-only and descriptions load after the filters."""
    return site in DETAIL_SITES and bool(cfg.get("fetch_description", True))


class _JobSpyToView(logging.Handler):
    """JobSpy's own error lines ("LinkedIn response status code 429") shown as
    our warnings, instead of JobSpy's timestamped log format."""

    def emit(self, record: logging.LogRecord) -> None:
        view.site_warning(record.name.removeprefix("JobSpy:"), record.getMessage())


def _route_jobspy_logs() -> None:
    for name, lg in list(logging.root.manager.loggerDict.items()):
        if name.startswith("JobSpy:") and isinstance(lg, logging.Logger):
            if not any(isinstance(h, _JobSpyToView) for h in lg.handlers):
                lg.handlers = [_JobSpyToView()]


def search(site: str, term: str, cfg: dict) -> list[tuple[Job, dict]] | None:
    """One site, one search term -> (job, raw JobSpy row) pairs, or None when the
    search failed (blocked, rate limited, site changed). Never raises."""
    from jobspy import scrape_jobs  # imported here so the main run never needs it

    _route_jobspy_logs()
    if site == "linkedin":
        _linkedin_newest_first()
    try:
        df = scrape_jobs(
            site_name=site,
            search_term=term,
            google_search_term=f"{term} jobs in {cfg.get('location') or 'India'}",
            location=cfg.get("location") or "India",
            country_indeed=cfg.get("country_indeed") or "india",
            results_wanted=results_wanted(site, cfg),
            hours_old=hours_old(site, cfg),
            is_remote=bool(cfg.get("remote_only", False)),
            fetch_description=bool(cfg.get("fetch_description", True)) and not two_pass(site, cfg),
            description_format=cfg.get("description_format") or "plain",
            linkedin_company_ids=[int(i) for i in cfg.get("linkedin_company_ids") or []] or None,
            verbose=0,
        )
    except Exception as e:  # blocked, rate limited, site changed its HTML
        view.search_failed(site, term, e)
        return None
    return [(_to_job(site, r), r) for r in df.to_dict("records")]


def detail_fetcher(site: str, cfg: dict):
    """A function job_id -> details dict, using JobSpy's own job-page reader for
    `site`. Returns None when JobSpy's internals have changed."""
    try:
        from jobspy.model import DescriptionFormat, ScraperInput
        from jobspy.util import create_session
        if site == "linkedin":
            from jobspy.linkedin import LinkedIn
            scraper = LinkedIn()
        else:
            from jobspy.naukri import Naukri
            scraper = Naukri()
            scraper.session = create_session()
        scraper.scraper_input = ScraperInput(
            fetch_description=True,
            description_format=DescriptionFormat(cfg.get("description_format") or "plain"))
        prefix = {"linkedin": "li-", "naukri": "nk-"}[site]
        return lambda job_id: scraper._fetch_details(job_id.removeprefix(prefix))
    except Exception as e:
        view.pages_unavailable(site, e)
        return None


def _add_details(row: dict, details: dict) -> dict:
    """Copy what a job page added onto the search row, in JobSpy's column format."""
    row = dict(row)
    for key in ("description", "job_level", "job_function", "company_industry",
                "company_description", "company_addresses", "vacancy_count", "job_url_direct"):
        if details.get(key):
            row[key] = details[key]
    if details.get("emails"):
        row["emails"] = ", ".join(details["emails"])
    if details.get("job_type"):
        row["job_type"] = ", ".join(t.value[0] for t in details["job_type"])
    if pay := details.get("compensation"):
        row |= {"min_amount": pay.min_amount, "max_amount": pay.max_amount,
                "currency": pay.currency, "interval": pay.interval.value if pay.interval else None}
    if details.get("posted"):  # Naukri: the search row has no date, the job page does
        row["date_posted"] = datetime.fromtimestamp(details["posted"]).strftime("%Y-%m-%d")
    return row


def load_details(site: str, pairs: list[tuple[Job, dict]], cfg: dict,
                 pause: float = 1.0, stats: dict | None = None) -> list[tuple[Job, dict]]:
    """Open each job's page for its description. A page that fails keeps the
    job as it was (no description), like JobSpy does. A job page dated before
    the site's hours_old window is dropped, as JobSpy does when it loads pages.
    `stats` (optional) gets "failed": how many pages didn't load."""
    stats = stats if stats is not None else {}
    stats["failed"] = 0
    fetch = detail_fetcher(site, cfg)
    if fetch is None:
        stats["failed"] = len(pairs)
        return pairs
    window = hours_old(site, cfg)
    cutoff = time.time() - window * 3600 if window else None
    out = []
    for i, (job, row) in enumerate(pairs):
        if i:
            time.sleep(random.uniform(pause, pause * 2))
        try:
            details = fetch(_val(row, "id")) or {}
        except Exception:
            details = {}
        if not details:
            stats["failed"] += 1
        if cutoff and details.get("posted") and details["posted"] < cutoff:
            continue
        if details:
            row = _add_details(row, details)
            job = _to_job(site, row)
        out.append((job, row))
    return out
