"""SOURCES: JobSpy settings and job-page loading (no network)."""
import time
from datetime import datetime

from jobhunt.services.scraper import sources
from jobhunt.models.scraped_row import _to_job


def test_naukri_page_date_fills_posted_and_old_pages_are_dropped(monkeypatch):
    now = time.time()
    pages = {"nk-1": {"description": "fresher", "posted": now - 3600},
             "nk-2": {"description": "fresher", "posted": now - 72 * 3600}}
    monkeypatch.setattr(sources, "detail_fetcher", lambda site, cfg: pages.get)
    rows = [{"id": k, "title": "SDE", "company": "A", "job_url": f"https://nk/{k}"} for k in pages]
    out = sources.load_details("naukri", [(_to_job("naukri", r), r) for r in rows],
                              {"hours_old": 48}, pause=0)
    assert [j.url for j, _ in out] == ["https://nk/nk-1"]
    assert out[0][0].posted_at == datetime.fromtimestamp(now - 3600).strftime("%Y-%m-%d")


def test_hours_old_per_site():
    cfg = {"hours_old": 48, "linkedin_hours_old": 12}
    assert sources.hours_old("linkedin", cfg) == 12
    assert sources.hours_old("naukri", cfg) == 48
    assert sources.hours_old("linkedin", {"hours_old": 48}) == 48


def test_linkedin_search_is_newest_first():
    from jobspy.linkedin import LinkedIn
    from jobspy.model import ScraperInput
    sources._linkedin_newest_first()
    sources._linkedin_newest_first()        # wrapping twice must not stack
    li = LinkedIn()
    li.scraper_input = ScraperInput(search_term="sde", location="India", hours_old=12)
    params = li._search_params()
    assert params["sortBy"] == "DD" and params["f_TPR"] == "r43200"


def test_a_site_setting_wins_over_the_shared_one():
    cfg = {"results_wanted": 25, "linkedin_results_wanted": 20, "retention_days": 3}
    assert sources.results_wanted("linkedin", cfg) == 20
    assert sources.results_wanted("indeed", cfg) == 25
    assert sources.results_wanted("indeed", {}) == 30
    assert sources.per_site("naukri", cfg, "retention_days") == 3


def test_failed_job_pages_are_counted(monkeypatch):
    pages = {"li-1": {"description": "fresher"}, "li-2": {}}          # li-2 didn't load
    monkeypatch.setattr(sources, "detail_fetcher", lambda site, cfg: pages.get)
    rows = [{"id": k, "title": "SDE", "company": "A", "job_url": f"https://li/{k}"} for k in pages]
    stats = {}
    out = sources.load_details("linkedin", [(_to_job("linkedin", r), r) for r in rows], {},
                               pause=0, stats=stats)
    assert len(out) == 2 and stats == {"failed": 1}


def test_only_the_newest_logs_are_kept(tmp_path):
    from jobhunt.views import scraper_console as view
    logs = tmp_path / "logs"
    logs.mkdir()
    for i in range(12):
        (logs / f"2026-01-{i + 1:02d}_00-00-00.log").write_text("x", encoding="utf-8")
    view.start_log(tmp_path)
    names = sorted(p.name for p in logs.glob("*.log"))
    assert len(names) == view.KEEP_LOGS and "2026-01-01_00-00-00.log" not in names
    view._log_file = None
