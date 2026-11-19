"""VIEW: everything `start:scraper` prints. No logic here.

Terminal: one header, then per site one line per search term, what the
filters dropped, and a site total; at the end the summary table.
Log file: the same lines with a timestamp, one file per run in
output/scraper/logs/ (the newest 10 are kept).

  ✓ done   ⊘ dropped / nothing found   ✗ failed   ! warning   → working
"""
from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path

KEEP_LOGS = 10
NAMES = {"linkedin": "LinkedIn", "zip_recruiter": "ZipRecruiter", "bdjobs": "BDJobs",
         "hellowork": "HelloWork"}

_log_file: Path | None = None
_started = time.time()


def nice(site: str) -> str:
    return NAMES.get(site, site.replace("_", " ").title())


def _out(line: str = "") -> None:
    """Print a line and add it (timestamped) to this run's log file."""
    print(line, flush=True)
    if _log_file:
        try:
            with _log_file.open("a", encoding="utf-8") as fh:
                fh.write(f"[{datetime.now():%H:%M:%S}] {line}\n")
        except OSError:
            pass  # a locked log file must never stop the scrape


def _took(seconds: float) -> str:
    s = round(seconds)
    return f"{s}s" if s < 60 else f"{s // 60}m {s % 60:02d}s"


def start_log(out_dir: Path) -> None:
    """New log file for this run in <out_dir>/logs/, keeping only the newest few."""
    global _log_file, _started
    _started = time.time()
    logs = out_dir / "logs"
    try:
        logs.mkdir(parents=True, exist_ok=True)
        _log_file = logs / f"{datetime.now():%Y-%m-%d_%H-%M-%S}.log"
        _log_file.write_text("", encoding="utf-8")
        for old in sorted(logs.glob("*.log"), reverse=True)[KEEP_LOGS:]:
            old.unlink(missing_ok=True)
    except OSError:
        _log_file = None


def start(sites: list[str], terms: list[str], sc: dict, apply_filters: bool,
          windows: dict[str, int], results: dict[str, int]) -> None:
    """━━ Scraper · 22 Oct 2026, 10:15
         sites, terms, per-site results / time window, filters, log file"""
    _out()
    _out(f"━━ Scraper · {datetime.now():%d %b %Y, %H:%M}")
    _out(f"   {len(terms)} search term(s) · location {sc.get('location') or 'India'}"
         f" · filters {'on' if apply_filters else 'OFF (saving everything)'}")
    for s in sites:
        window = f", last {windows[s]}h" if s in windows else ""
        _out(f"   {nice(s):<10} {results[s]} results per search{window}")
    if _log_file:
        _out(f"   log file: {_log_file}")


def site_start(site: str) -> None:
    _out()
    _out(f"▸ {nice(site)}")


def term_done(site: str, term: str, found: int, kept: int) -> None:
    if found:
        _out(f"  ✓ {term[:38]:<38} {found:>3} found → {kept:>3} kept")
    else:
        _out(f"  ⊘ {term[:38]:<38} nothing found")


def search_failed(site: str, term: str, err: Exception) -> None:
    _out(f"  ✗ {term[:38]:<38} {type(err).__name__}: {str(err)[:100]}")


def site_warning(site: str, message: str) -> None:
    """A problem JobSpy reported (blocked, rate limited, page changed)."""
    _out(f"  ! {message[:140]}")


def loading_pages(site: str, count: int) -> None:
    _out(f"  → opening {count} job page(s) for the full description …")


def pages_done(site: str, kept: int, dropped: int, failed: int) -> None:
    parts = [f"{kept} kept"]
    if dropped:
        parts.append(f"{dropped} dropped (too much experience / too old)")
    _out(f"  ✓ job pages read: {', '.join(parts)}")
    if failed:
        _out(f"  ! {failed} page(s) didn't load (site blocking? they are saved without a description)")


def pages_unavailable(site: str, err: Exception) -> None:
    _out(f"  ! can't open job pages one by one ({type(err).__name__}: {err}); saving without descriptions")


def unpaid_dropped(site: str, count: int) -> None:
    _out(f"  ⊘ {count} unpaid internship post(s) dropped")


def site_done(site: str, found: int, passed: int, seconds: float) -> None:
    _out(f"  = {found} found · {passed} passed the filters · {_took(seconds)}")


def summary(table: list[tuple[str, int, int, int, int, Path | None]]) -> None:
    """Found = the site returned it, Passed = it passed the filters,
    Dupes = another site/city (or an earlier run) already had it, New = saved now."""
    _out()
    _out(f"  {'Site':<10} {'Found':>6} {'Passed':>7} {'Dupes':>6} {'New':>5}  File")
    for site, found, passed, dupes, added, path in table:
        _out(f"  {nice(site):<10} {found:>6} {passed:>7} {dupes:>6} {added:>5}  {path.name if path else '-'}")
    tot = [sum(row[i] for row in table) for i in range(1, 5)]
    _out(f"  {'Total':<10} {tot[0]:>6} {tot[1]:>7} {tot[2]:>6} {tot[3]:>5}")
    folder = next((p.parent for *_, p in table if p), None)
    _out()
    _out(f"✓ {tot[3]} new job(s) saved{f' to {folder}' if folder else ''} · done in {_took(time.time() - _started)}")


def unknown_sites(bad: list[str], known: tuple[str, ...]) -> None:
    _out(f"✗ unknown site(s): {', '.join(bad)}. Choose from: {', '.join(known)}")


def nothing_found() -> None:
    _out()
    _out("✗ no site returned anything: check your internet connection, or a site may be "
         "blocking you (wait an hour, or lower results_wanted)")
