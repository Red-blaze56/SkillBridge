"""Parsers + prefilter, run against the fixtures in their native ATS shapes.

No network, no API key. This is the suite that catches the two bugs that cost
me an evening each: Lever's epoch-milliseconds timestamps, and a bare `sde`
regex that silently matches nothing.
"""
from __future__ import annotations

import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from jobhunt.dev import mock
from jobhunt.services.boards import (hydrate, parse_ashby, parse_greenhouse, parse_lever, parse_recruitee,
                           parse_smartrecruiters, parse_workable, strip_html)
from jobhunt.dev.mock import fetch_all_mock
from jobhunt.services.filters import prefilter

CONFIG = yaml.safe_load((Path(__file__).resolve().parents[2] / "config.yaml")
                        .read_text(encoding="utf-8"))
FILTERS = CONFIG["filters"]


# ------------------------------------------------------------- strip_html ---

def test_strip_html_unescapes_twice():
    """Greenhouse ships HTML-entity-escaped HTML: unescape, strip, unescape."""
    raw = "&lt;p&gt;Go &amp;amp; Java&lt;/p&gt;"
    assert strip_html(raw) == "Go & Java"


def test_strip_html_turns_block_tags_into_newlines():
    out = strip_html("<p>One</p><p>Two</p><ul><li>a</li><li>b</li></ul>")
    assert "One" in out and "Two" in out and "a" in out and "b" in out
    assert "<" not in out


def test_strip_html_handles_none_and_empty():
    assert strip_html(None) == ""
    assert strip_html("") == ""


# ---------------------------------------------------------------- parsers ---

def test_greenhouse_maps_every_field():
    jobs = parse_greenhouse("acme-edge", "Acme Edge", mock.GREENHOUSE["acme-edge"])
    j = next(j for j in jobs if j.title.startswith("Software Engineer II"))
    assert j.job_id == "greenhouse:acme-edge:5501001"
    assert j.ats == "greenhouse"
    assert j.company == "Acme Edge"
    assert j.location == "Bangalore, India"
    assert j.url.startswith("https://boards.greenhouse.io/")
    assert "distributed services" in j.description


def test_lever_concatenates_description_lists_and_additional():
    """The requirements live in lists[], not descriptionPlain. Drop the
    concatenation and every Lever job looks unqualified."""
    jobs = parse_lever("quantstack", "QuantStack", mock.LEVER["quantstack"])
    j = next(j for j in jobs if j.title == "Backend Engineer (Go)")
    assert "market data pipeline" in j.description      # descriptionPlain
    assert "Requirements" in j.description              # lists[].text
    assert "2-5 years backend experience" in j.description  # lists[].content
    assert "No take-home" in j.description              # additionalPlain


def test_lever_createdAt_is_epoch_milliseconds():
    """1.7e12 is milliseconds. Reading it as seconds dates the post to 1970
    and the freshness filter eats the whole board without a word."""
    two_days_ago = (datetime.now(timezone.utc) - timedelta(days=2)).date()
    jobs = parse_lever("quantstack", "QuantStack", mock.LEVER["quantstack"])
    j = next(j for j in jobs if j.title == "Backend Engineer (Go)")
    assert j.posted_at == two_days_ago.isoformat()


def test_ashby_skips_unlisted_drafts():
    jobs = parse_ashby("helioscale", "Helioscale", mock.ASHBY["helioscale"])
    assert all("unlisted" not in j.url for j in jobs)
    assert len(jobs) == 2   # 3 postings, one isListed: false


def test_ashby_reads_compensation_and_html_fallback():
    jobs = parse_ashby("helioscale", "Helioscale", mock.ASHBY["helioscale"])
    networking = next(j for j in jobs if j.title == "Software Engineer, Networking")
    assert networking.salary == "₹32L – ₹48L"
    ds = next(j for j in jobs if j.title == "Data Scientist, Growth")
    assert "Causal inference" in ds.description   # descriptionHtml fallback


def test_job_ids_are_globally_unique_and_namespaced():
    jobs = fetch_all_mock()
    ids = [j.job_id for j in jobs]
    assert len(ids) == len(set(ids))
    assert all(re.match(r"^(greenhouse|lever|ashby):[^:]+:.+$", i) for i in ids)


def test_parsers_take_decoded_json_not_a_response():
    """Parsers are pure: body in, list[Job] out. That is what makes --mock
    exercise the real code path instead of a second implementation."""
    assert parse_greenhouse("x", "X", {}) == []
    assert parse_lever("x", "X", []) == []
    assert parse_ashby("x", "X", {}) == []


# ------------------------------------- Workable / SmartRecruiters / Recruitee ---
# Trimmed copies of real responses (2026-10-08), only the fields the parsers read.

WORKABLE = {"name": "Hugging Face", "jobs": [{
    "title": "Backend Engineer", "shortcode": "81B46579FE", "telecommuting": True,
    "url": "https://apply.workable.com/j/81B46579FE", "published_on": "2026-05-29",
    "city": "Paris", "country": "France",
    "locations": [{"city": "Bengaluru", "country": "India", "hidden": False},
                  {"city": "Secret", "country": "Nowhere", "hidden": True}],
    "description": "<p>Build APIs in Python &amp; Rust.</p>",
}]}

SMARTRECRUITERS = {"offset": 0, "limit": 100, "totalFound": 1, "content": [{
    "id": "744000154351019", "name": "Software Engineer - Full Stack",
    "releasedDate": "2026-10-08T06:17:26.279Z",
    "location": {"city": "Chennai", "country": "in", "remote": False,
                 "fullLocation": "Chennai, , India"},
}]}

SMARTRECRUITERS_DETAIL = {
    "postingUrl": "https://jobs.smartrecruiters.com/Freshworks/744000154351019-software-engineer",
    "jobAd": {"sections": {
        "companyDescription": {"text": "<p>About us</p>"},
        "jobDescription": {"text": "<p>Ship React features.</p>"},
        "qualifications": {"text": "<ul><li>Node.js</li></ul>"},
    }},
}

RECRUITEE = {"offers": [{
    "id": 2771667, "title": "Frontend Developer", "location": "Pune, Maharashtra, India",
    "remote": True, "careers_url": "https://acme.recruitee.com/o/frontend-developer",
    "description": "<p>Own the web app.</p>", "requirements": "<p>React, TypeScript</p>",
    "published_at": "2026-10-05 15:07:51 UTC",
}]}


def test_workable_maps_fields_and_skips_hidden_locations():
    [j] = parse_workable("huggingface", "Hugging Face", WORKABLE)
    assert j.job_id == "workable:huggingface:81B46579FE"
    assert j.location == "Bengaluru, India / Remote"
    assert j.url == "https://apply.workable.com/j/81B46579FE"
    assert j.description == "Build APIs in Python & Rust."
    assert j.posted_at == "2026-05-29"


def test_smartrecruiters_list_has_no_description_until_hydrated():
    [j] = parse_smartrecruiters("freshworks", "Freshworks", SMARTRECRUITERS)
    assert j.job_id == "smartrecruiters:freshworks:744000154351019"
    assert j.location == "Chennai, India"
    assert j.posted_at == "2026-10-08"
    assert j.description == ""

    class FakeSession:
        def get(self, url, **_):
            assert url.endswith("/companies/freshworks/postings/744000154351019")
            return type("R", (), {"json": lambda self: SMARTRECRUITERS_DETAIL})()

    hydrate([j], session=FakeSession())
    assert "Ship React features." in j.description and "Node.js" in j.description
    assert "About us" not in j.description
    assert j.url == SMARTRECRUITERS_DETAIL["postingUrl"]


def test_recruitee_joins_description_and_requirements_and_trims_date():
    [j] = parse_recruitee("acme", "Acme", RECRUITEE)
    assert j.job_id == "recruitee:acme:2771667"
    assert j.location == "Pune, Maharashtra, India, Remote"
    assert "Own the web app." in j.description and "React, TypeScript" in j.description
    assert j.posted_at == "2026-10-05"


def test_new_boards_pass_the_prefilter_like_the_old_ones():
    jobs = (parse_workable("huggingface", "HF", WORKABLE)
            + parse_smartrecruiters("freshworks", "Freshworks", SMARTRECRUITERS)
            + parse_recruitee("acme", "Acme", RECRUITEE))
    filters = dict(FILTERS, max_age_days=None)
    assert len(prefilter(jobs, filters)) == 3


# -------------------------------------------------------------- prefilter ---

@pytest.mark.parametrize("title", [
    "Software Engineer II, Distributed Systems",
    "Software Development Engineer, Core Infra",
    "Backend Engineer (Go)",
    "Site Reliability Engineer",
    "SDE II",
])
def test_include_titles_match_real_titles(title):
    inc = FILTERS["include_titles"]
    assert any(re.search(p, title, re.I) for p in inc), title


def test_bare_sde_regex_does_not_match_the_spelled_out_title():
    """The bug: `sde` looks like it covers "Software Development Engineer".
    It does not — they share no substring. \\bsde\\b plus the spelled-out
    variant is why both titles survive the filter."""
    assert not re.search(r"\bsde\b", "Software Development Engineer", re.I)
    assert re.search(r"\bsde\b", "SDE II", re.I)
    inc = FILTERS["include_titles"]
    assert any(re.search(p, "Software Development Engineer, Core Infra", re.I) for p in inc)


@pytest.mark.parametrize("title", [
    "Staff Software Engineer, Storage",       # too senior
    "Engineering Manager, Platform",          # management track
    "Enterprise Account Executive",           # wrong function
    "Data Scientist, Growth",                 # wrong discipline
    "Software Dev Engineer III",              # above fresher level
    "Software Engineer II, Frontend",
    "Data Engineer (SDE 2)",
    "SDE-II, Payments",
    "Intermediate Backend Engineer, India",
    "Lead Backend Engineer",
    "Sr. Software Engineer",
    "Registered Clinical Social Work Intern (RCSWI) - Remote",  # non-tech intern
])
def test_junk_titles_are_rejected(title):
    inc, exc = FILTERS["include_titles"], FILTERS["exclude_titles"]
    included = any(re.search(p, title, re.I) for p in inc)
    excluded = any(re.search(p, title, re.I) for p in exc)
    assert excluded or not included, f"{title!r} would have survived"


@pytest.mark.parametrize("title", [
    "Software Engineer Intern",
    "Software Development Engineer Intern",
    "Full Stack Developer Intern",
    "Internship - Backend Development",
    "Associate Software Development Engineer (SDE)",
    "Graduate Engineer Trainee",
    "SDE-1",
    "SDE 1, Platform",
    "University Grad Software Engineer 2027",
    "Junior Frontend Developer",
    "Python Developer",
    "Software Engineer (Web3)",          # the 3 in Web3 is not a level
    "Software Engineer, 2027 Grad",      # nor is the 2 in 2027
])
def test_fresher_titles_are_kept(title):
    inc, exc = FILTERS["include_titles"], FILTERS["exclude_titles"]
    included = any(re.search(p, title, re.I) for p in inc)
    excluded = any(re.search(p, title, re.I) for p in exc)
    assert included and not excluded, f"{title!r} would have been dropped"


def test_full_mock_funnel_keeps_only_the_fresher_reachable_roles():
    # Every other mock posting asks for 2+ years, is senior, or is non-tech.
    kept = prefilter(fetch_all_mock(), FILTERS)
    titles = sorted(j.title for j in kept)
    assert titles == [
        "Frontend Engineer, Design Systems",
        "Site Reliability Engineer",
    ]


def _job(title="Software Engineer", location="Bengaluru, India", description=""):
    from jobhunt.models.job import Job
    return Job(job_id="lever:x:1", ats="lever", company="X", title=title,
               location=location, url="https://example.com", description=description)


@pytest.mark.parametrize("location,kept", [
    ("Bengaluru", True),               # any Indian city, onsite
    ("Kochi, Kerala", True),
    ("Hybrid - Pune, India", True),
    ("Remote (India)", True),
    ("Remote, US", True),              # abroad, but remote
    ("Remote - Europe", True),
    ("San Francisco, CA", False),      # abroad and onsite
    ("Indianapolis, Indiana", False),  # "india" is not a substring match any more
    ("London, UK", False),
])
def test_india_anywhere_abroad_remote_only(location, kept):
    assert bool(prefilter([_job(location=location)], FILTERS)) is kept


def test_distributed_in_the_title_is_not_remote():
    job = _job(title="Distributed Systems Engineer", location="San Francisco, CA")
    assert prefilter([job], FILTERS) == []


@pytest.mark.parametrize("description,kept", [
    ("We want 2+ years of experience with React.", False),
    ("3-5 years of experience building APIs.", False),
    ("Minimum 4 years experience in backend.", False),
    ("0-1 years of experience. Freshers welcome.", True),
    ("0-2 years of experience.", True),
    ("1-3 years experience preferred.", True),
    ("Build things with React and Node.", True),      # not mentioned
])
def test_experience_gate(description, kept):
    assert bool(prefilter([_job(description=description)], FILTERS)) is kept


def test_intern_title_beats_a_stray_year_count_in_the_jd():
    job = _job(title="Software Engineer Intern", description="Mentors with 5+ years experience.")
    assert len(prefilter([job], FILTERS)) == 1


def test_prefilter_stats_counts_every_drop_reason():
    from jobhunt.services.filters import prefilter_stats
    jobs = [_job(title="Account Executive"),
            _job(location="San Francisco, CA"),
            _job(description="5+ years of experience."),
            _job()]
    kept, stats = prefilter_stats(jobs, dict(FILTERS, max_age_days=None))
    assert len(kept) == 1
    assert stats == {"title": 1, "location": 1, "experience": 1, "age": 0}


def test_stale_posting_is_dropped_by_freshness_gate():
    kept = prefilter(fetch_all_mock(), FILTERS)
    assert not any("Senior Software Engineer, Platform" == j.title for j in kept)


def test_wrong_city_dropped_but_remote_kept():
    kept = prefilter(fetch_all_mock(), FILTERS)
    assert not any("San Francisco" in (j.location or "") for j in kept)
    assert any("Remote" in (j.location or "") for j in kept)


def test_allow_remote_is_what_lets_an_out_of_region_remote_role_through():
    """"Remote (India)" already matches the `india` location, so it is the
    wrong fixture for this. Use a remote role that names no allowed city."""
    from jobhunt.models.job import Job
    remote = Job(job_id="lever:x:1", ats="lever", company="X",
                 title="Backend Engineer", location="Remote - Global",
                 url="https://example.com", description="Go")

    kept_on = prefilter([remote], dict(FILTERS, allow_remote=True))
    kept_off = prefilter([remote], dict(FILTERS, allow_remote=False))

    assert len(kept_on) == 1
    assert kept_off == []


def test_empty_filters_keep_everything():
    jobs = fetch_all_mock()
    assert len(prefilter(jobs, {})) == len(jobs)
