"""MODEL: JobSpy row -> Job -> CSV row."""
import math

from jobhunt.services.filters import too_experienced
from jobhunt.models.scraped_row import HEADER, _to_job, to_row, work_mode


def test_naukri_experience_range_feeds_the_experience_filter():
    j = _to_job("naukri", {"id": "nk-1", "title": "Java React Developer", "company": "Infosys",
                           "location": "Pune, India", "job_url": "https://naukri.com/x",
                           "description": None, "experience_range": "2-6 Yrs",
                           "date_posted": "2026-10-16", "min_amount": math.nan})
    assert j.job_id == "naukri:nk-1"
    assert j.description == "Experience: 2-6 Yrs"
    assert too_experienced(j, 1)
    assert j.salary is None


def test_naukri_range_beats_the_description():
    row = {"id": "nk-2", "title": "Python Developer", "job_url": "u",
           "experience_range": "0-1 Yrs", "description": "Team of 10 with 5+ years in fintech"}
    j = _to_job("naukri", row)
    assert to_row("naukri", j, row, "t")["Experience (yrs)"] == "0-1"


def test_remote_without_city_reads_remote():
    j = _to_job("glassdoor", {"id": "gd-1", "title": "Frontend Engineer", "location": "",
                              "is_remote": True, "job_url": "https://glassdoor.co.in/j"})
    assert j.location == "Remote"


def test_salary_is_formatted():
    j = _to_job("indeed", {"id": "in-1", "title": "MERN Developer", "job_url": "u",
                           "min_amount": 15000.0, "max_amount": 35000.0,
                           "currency": "INR", "interval": "monthly"})
    assert j.salary == "INR 15,000-35,000 /monthly"


def test_work_mode():
    assert work_mode({"work_from_home_type": "Work from office"}) == "On-site"
    assert work_mode({"work_from_home_type": "Hybrid"}) == "Hybrid"
    assert work_mode({"work_from_home_type": "Temp. WFH"}) == "Remote"
    assert work_mode({"title": "Backend Engineer (Hybrid)", "is_remote": True}) == "Hybrid"
    assert work_mode({"location": "Remote, India"}) == "Remote"
    assert work_mode({"is_remote": True}) == "Remote"
    assert work_mode({"description": "Hybrid work model, 3 days a week in Pune"}) == "Hybrid"
    assert work_mode({"description": "Bengaluru (hybrid, three days a week in office)"}) == "Hybrid"
    assert work_mode({"description": "Expect 2 days per week in the office"}) == "Hybrid"
    assert work_mode({"description": "This is a fully remote position."}) == "Remote"
    assert work_mode({"description": "This is not a remote role. Work from office."}) == "On-site"
    # Tech words are not a work mode.
    assert work_mode({"description": "Experience with hybrid cloud and remote debugging"}) \
        == "Not mentioned"
    assert work_mode({"title": "SDE", "location": "Pune, India"}) == "Not mentioned"


def test_row_has_every_detail():
    row = {"id": "li-9", "title": "Associate Software Engineer", "company": "Acme",
           "location": "Bengaluru, India", "job_url": "https://linkedin.com/9",
           "job_url_direct": "https://acme.com/apply/9", "job_type": "fulltime, internship",
           "job_level": "entry level", "company_industry": "Software", "skills": "React, SQL",
           "company_rating": 4.0, "company_reviews_count": 120.0,
           "description": 'svg]:w-[18px] [&>svg]:shrink-0"> Fresher role.\n\n  Build   APIs.',
           "is_remote": False}
    r = to_row("linkedin", _to_job("linkedin", row), row, "fresher")
    assert list(r) == HEADER
    assert r["Apply Link"] == "https://acme.com/apply/9"
    assert r["Job Type"] == "Full-time, Internship"
    assert r["Job Level"] == "Entry level"
    assert r["Company Rating"] == "4" and r["Company Reviews"] == "120"
    assert r["Experience (yrs)"] == "0"
    assert r["Description"] == "Fresher role. Build APIs."
