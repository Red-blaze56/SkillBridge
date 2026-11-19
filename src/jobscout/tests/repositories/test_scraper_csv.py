"""STORE: the per-site CSV files."""
import csv
from datetime import datetime, timedelta

from jobhunt.models.job import Job
from jobhunt.models.scraped_row import HEADER, _to_job, to_row
from jobhunt.repositories.scraper_csv import (_cleanup_old_rows, _read, _write, load_saved,
                                   sample_per_site, save, write_scores)


def test_save_writes_one_file_per_site_and_skips_saved_links(tmp_path):
    row = {"id": "li-1", "title": "Associate Software Engineer",
           "location": "Bengaluru, India", "job_url": "https://linkedin.com/1"}
    r = to_row("linkedin", _to_job("linkedin", row), row, "fresher")
    assert save("linkedin", [r], tmp_path)[0] == 1
    assert save("linkedin", [r], tmp_path)[0] == 0
    rows = list(csv.DictReader((tmp_path / "linkedin_jobs.csv").open(encoding="utf-8")))
    assert len(rows) == 1 and rows[0]["Experience (yrs)"] == "Not loaded"


def _saved(tmp_path, site, raw_rows):
    rows = [to_row(site, _to_job(site, r), r, "t") for r in raw_rows]
    save(site, rows, tmp_path)


def test_load_saved_turns_rows_into_jobs_and_skips_scored_ones(tmp_path):
    _saved(tmp_path, "naukri", [
        {"id": "nk-1", "title": "React Developer", "company": "Acme", "location": "India",
         "job_url": "https://naukri.com/1", "work_from_home_type": "Remote",
         "experience_range": "0-1 Yrs", "description": "Build UIs."},
        {"id": "nk-2", "title": "Node Developer", "location": "Pune, India",
         "job_url": "https://naukri.com/2", "description": "APIs"}])
    jobs = load_saved(tmp_path)
    assert [j.job_id for j in jobs] == ["naukri:https://naukri.com/1", "naukri:https://naukri.com/2"]
    assert jobs[0].ats == "naukri" and jobs[0].company == "Acme"
    assert jobs[0].location == "India / Remote"
    assert jobs[0].description.startswith("Experience: 0-1 years")

    jobs[0].score, jobs[0].reason = 8.0, "React match"
    write_scores(tmp_path, jobs[:1])
    assert [j.url for j in load_saved(tmp_path)] == ["https://naukri.com/2"]


def test_write_scores_keeps_every_other_cell(tmp_path):
    _saved(tmp_path, "indeed", [
        {"id": "in-1", "title": "SDE", "company": "Acme", "job_url": "https://x/1",
         "min_amount": 15000.0, "currency": "INR", "interval": "monthly", "description": "fresher"},
        {"id": "in-2", "title": "SDE 2", "company": "Beta", "job_url": "https://x/2"}])
    jobs = load_saved(tmp_path)
    jobs[0].score, jobs[0].reason = 7.5, "good fit"
    write_scores(tmp_path, jobs)        # jobs[1] has no score: left alone
    rows = list(csv.DictReader((tmp_path / "indeed_jobs.csv").open(encoding="utf-8")))
    assert list(rows[0]) == HEADER
    assert (rows[0]["Score"], rows[0]["AI Reason"]) == ("7.5", "good fit")
    assert rows[0]["Salary"] == "INR 15,000 /monthly" and rows[0]["Company"] == "Acme"
    assert rows[1]["Score"] == "" and rows[1]["Company"] == "Beta"


def test_sample_per_site_caps_scraper_jobs_and_keeps_board_jobs():
    mk = lambda ats, i: Job(job_id=f"{ats}:{i}", ats=ats, company="A", title="SDE",
                            location="India", url=f"https://{ats}/{i}", description="")
    jobs = ([mk("linkedin", i) for i in range(12)] + [mk("naukri", i) for i in range(3)]
            + [mk("greenhouse", i) for i in range(9)])
    kept, waiting = sample_per_site(jobs, 5)
    count = lambda ats: sum(j.ats == ats for j in kept)
    assert (count("linkedin"), count("naukri"), count("greenhouse")) == (5, 3, 9)
    assert waiting == 7


def test_old_columns_are_upgraded_in_place(tmp_path):
    path = tmp_path / "indeed_jobs.csv"
    path.write_text("Date,Site,Company,Role,Link\n2026-10-01,indeed,Acme,SDE,https://x/1\n",
                    encoding="utf-8")
    row = {"id": "in-2", "title": "SDE", "location": "Pune, India", "job_url": "https://x/2"}
    assert save("indeed", [to_row("indeed", _to_job("indeed", row), row, "t")], tmp_path)[0] == 1
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    assert list(rows[0]) == HEADER
    assert [r["Link"] for r in rows] == ["https://x/1", "https://x/2"]
    assert rows[0]["Company"] == "Acme"


def _row(site, company, title, location, link):
    raw = {"id": link, "title": title, "company": company, "location": location, "job_url": link}
    return to_row(site, _to_job(site, raw), raw, "t")


def test_rows_older_than_retention_are_deleted(tmp_path):
    day = lambda n: (datetime.now() - timedelta(days=n)).strftime("%Y-%m-%d")
    rows = [dict(_row("naukri", "A", "SDE", "India", f"https://nk/{n}"), Date=day(n))
            for n in (0, 2, 4, 10)]
    _write(tmp_path / "naukri_jobs.csv", rows)
    _cleanup_old_rows(tmp_path, max_age_days=3)
    assert [r["Link"] for r in _read(tmp_path / "naukri_jobs.csv")] == ["https://nk/0", "https://nk/2"]


def test_linkedin_rows_go_after_2_days_the_rest_after_3(tmp_path):
    day = lambda n: (datetime.now() - timedelta(days=n)).strftime("%Y-%m-%d")
    for site in ("linkedin", "indeed"):
        rows = [dict(_row(site, "A", "SDE", "India", f"https://{site}/{n}"), Date=day(n))
                for n in (1, 2, 3)]
        _write(tmp_path / f"{site}_jobs.csv", rows)
    _cleanup_old_rows(tmp_path, max_age_days=3, per_site={"linkedin": 2})
    links = lambda site: [r["Link"] for r in _read(tmp_path / f"{site}_jobs.csv")]
    assert links("linkedin") == ["https://linkedin/1"]
    assert links("indeed") == ["https://indeed/1", "https://indeed/2"]
