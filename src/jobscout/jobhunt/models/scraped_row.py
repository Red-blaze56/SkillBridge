"""MODEL: what a scraped job looks like.

JobSpy gives one dict per job (a "raw row"). This file turns it into
  - a Job   (the same object the main run filters and scores), and
  - a CSV row with the HEADER columns below (what <site>_jobs.csv holds).
No network and no files here: just data in, data out.
"""
from __future__ import annotations

import math
import re
from datetime import datetime

from ..services.experience import experience, role_category
from .job import Job

HEADER = ["Date", "Company", "Role", "Role Category", "Experience (yrs)", "Work Mode",
          "Score", "AI Reason", "Location","Link", "Apply Link", "Job Type", "Job Level", "Salary", "Posted",
          "Skills", "Industry", "Job Function", "Company Size", "Company Rating",
          "Company Reviews", "Openings", "Emails", "Company Page", "Search Term", "Site",
          "Also On", "Description"]

MAX_CELL = 32_000  # Excel cuts a cell off at 32,767 characters

JOB_TYPES = {"fulltime": "Full-time", "parttime": "Part-time", "internship": "Internship",
             "contract": "Contract", "temporary": "Temporary"}

# Title, location and the sites' own labels are short, so a bare word decides.
_HYBRID = re.compile(r"\bhybrid\b", re.I)
_REMOTE = re.compile(r"\b(remote|work from home|wfh|anywhere)\b", re.I)
_ONSITE = re.compile(r"\b(on[\s-]?site|in[\s-]office|work from office|wfo)\b", re.I)
# A description says "hybrid cloud" and "remote debugging", so it needs a phrase.
_DESC_HYBRID = re.compile(r"\bhybrid[\s-]+(work|working|role|model|mode|position|job|setup|"
                          r"arrangement|schedule)\b|\b(work\s*mode|workplace|work\s*type|"
                          r"location)\s*[:\-–]\s*hybrid\b|\(\s*hybrid\b|\bhybrid\s*\)|"
                          r"\b(\d|one|two|three|four)\s+days?\s+(a|per|each|every)\s+week\s+"
                          r"(in|at|from)\s+(the\s+|our\s+)?office\b", re.I)
_DESC_REMOTE = re.compile(r"\b(fully|100%|completely|permanently)\s+remote\b|"
                          r"\bremote[\s-]+(first|role|position|job|work|working|opportunity|"
                          r"friendly|only)\b|\bwork(ing)?\s+(from\s+home|remotely)\b|\bwfh\b|"
                          r"\b(work\s*mode|workplace|work\s*type|location)\s*[:\-–]\s*remote\b",
                          re.I)
_NOT_REMOTE = re.compile(r"\b(no|not|non)[\s-]+(an?\s+)?remote\b", re.I)
# Leftover markup some postings carry, e.g. 'svg]:w-[18px] [&>svg]:shrink-0">'.
_JUNK = re.compile(r'\S*\]:\S*|"\s*>')


def _val(row: dict, key: str) -> str:
    """Cell as a clean string; pandas gives NaN/None for empty cells and 12.0 for 12."""
    v = row.get(key)
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def _salary(row: dict) -> str:
    lo, hi = _val(row, "min_amount"), _val(row, "max_amount")
    if not (lo or hi):
        return ""
    fmt = lambda x: f"{float(x):,.0f}" if x else ""
    amount = "-".join(a for a in (fmt(lo), fmt(hi)) if a)
    return " ".join(p for p in (_val(row, "currency"), amount,
                                f"/{_val(row, 'interval')}" if _val(row, "interval") else "") if p)


def _description(row: dict) -> str:
    # Naukri's "2-6 Yrs" is more reliable than whatever the text says, so it
    # goes first: the experience filter and the CSV column read the first match.
    desc = _val(row, "description")
    years = _val(row, "experience_range")
    return f"Experience: {years}\n\n{desc}".strip() if years else desc


def work_mode(row: dict) -> str:
    """Remote / Hybrid / On-site, or "Not mentioned". The site's own label wins,
    then the title and location, then a clear phrase in the description."""
    label = _val(row, "work_from_home_type")  # Naukri: "Hybrid", "Remote", "Work from office"
    if label:
        return "Hybrid" if _HYBRID.search(label) else "Remote" if _REMOTE.search(label) else "On-site"
    short = f"{_val(row, 'title')} {_val(row, 'location')}"
    if _HYBRID.search(short):
        return "Hybrid"
    if _val(row, "is_remote").lower() == "true" or _REMOTE.search(short):
        return "Remote"
    if _ONSITE.search(short):
        return "On-site"
    desc = _val(row, "description")
    if _DESC_HYBRID.search(desc):
        return "Hybrid"
    if _DESC_REMOTE.search(_NOT_REMOTE.sub("", desc)):
        return "Remote"
    if _ONSITE.search(desc) or _NOT_REMOTE.search(desc):
        return "On-site"
    return "Not mentioned"


def _to_job(site: str, row: dict) -> Job:
    location = _val(row, "location")
    if work_mode(row) == "Remote" and "remote" not in location.lower():
        # The prefilter reads "remote" from the location, so say it there.
        location = f"{location} / Remote" if location else "Remote"
    return Job(
        job_id=f"{site}:{_val(row, 'id') or _val(row, 'job_url')}",
        ats=site,
        company=_val(row, "company"),
        title=_val(row, "title"),
        location=location,
        url=_val(row, "job_url") or _val(row, "job_url_direct"),
        description=_description(row),
        posted_at=_val(row, "date_posted")[:10] or None,
        salary=_salary(row) or None,
    )


def to_row(site: str, job: Job, row: dict, term: str) -> dict:
    """One CSV row: every field JobSpy returned, plus our role / experience / work mode."""
    direct = _val(row, "job_url_direct")
    job_types = [JOB_TYPES.get(t.strip(), t.strip()) for t in _val(row, "job_type").split(",")]
    level = _val(row, "job_level")
    return {
        "Date": datetime.now().strftime("%Y-%m-%d"),
        "Company": job.company,
        "Role": job.title,
        "Role Category": role_category(job.title, job.description),
        "Experience (yrs)": experience(job.title, job.description) if job.description else "Not loaded",
        "Work Mode": work_mode(row),
        "Score": "",       # filled in by `run`, which AI-scores saved jobs
        "AI Reason": "",
        "Location": _val(row, "location"),
        "Link": job.url,
        "Apply Link": direct if direct != job.url else "",
        "Job Type": ", ".join(t for t in job_types if t),
        "Job Level": level[:1].upper() + level[1:],
        "Salary": job.salary or "",
        "Posted": job.posted_at or "",
        "Skills": _val(row, "skills"),
        "Industry": _val(row, "company_industry"),
        "Job Function": _val(row, "job_function"),
        "Company Size": _val(row, "company_num_employees"),
        "Company Rating": _val(row, "company_rating"),
        "Company Reviews": _val(row, "company_reviews_count"),
        "Openings": _val(row, "vacancy_count"),
        "Emails": _val(row, "emails"),
        "Company Page": _val(row, "company_url_direct") or _val(row, "company_url"),
        "Search Term": term,
        "Site": site,
        "Also On": "",     # filled in by merge_duplicates
        "Description": " ".join(_JUNK.sub(" ", _val(row, "description")).split())[:MAX_CELL],
    }
