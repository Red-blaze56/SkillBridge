"""Fetch jobs from public ATS APIs (Greenhouse, Lever, Ashby, ...). No auth, no scraping."""
from __future__ import annotations

import html
import json
import re
import time
from typing import Any

import requests

from ..models.job import Job

UA = {"User-Agent": "jobhunt/1.0 (personal job search agent)"}
TIMEOUT = 20

_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t\r\f\v]+")
_NL = re.compile(r"\n{3,}")


def strip_html(raw: str | None) -> str:
    if not raw:
        return ""
    text = html.unescape(raw)
    text = re.sub(r"<\s*(br|/p|/div|/li|/h[1-6])\s*/?>", "\n", text, flags=re.I)
    text = _TAG.sub(" ", text)
    text = html.unescape(text)
    text = _WS.sub(" ", text)
    text = _NL.sub("\n\n", text)
    return text.strip()


# --------------------------------------------------------------------------
# Adapters. Each takes the raw JSON body and returns list[Job].
# Keeping parse separate from HTTP is what makes offline testing possible.
# --------------------------------------------------------------------------

def parse_greenhouse(slug: str, company: str, body: Any) -> list[Job]:
    out = []
    for j in (body or {}).get("jobs", []):
        loc = (j.get("location") or {}).get("name") or ""
        out.append(Job(
            job_id=f"greenhouse:{slug}:{j.get('id')}",
            ats="greenhouse",
            company=company,
            title=(j.get("title") or "").strip(),
            location=loc.strip(),
            url=j.get("absolute_url") or "",
            description=strip_html(j.get("content")),
            posted_at=j.get("updated_at") or j.get("first_published"),
        ))
    return out


def parse_lever(slug: str, company: str, body: Any) -> list[Job]:
    out = []
    for j in (body or []):
        cats = j.get("categories") or {}
        # Lever splits the JD across descriptionPlain + a `lists` array.
        chunks = [j.get("descriptionPlain") or strip_html(j.get("description"))]
        for lst in (j.get("lists") or []):
            chunks.append(str(lst.get("text") or ""))
            chunks.append(strip_html(lst.get("content")))
        chunks.append(j.get("additionalPlain") or strip_html(j.get("additional")))
        ts = j.get("createdAt")
        posted = None
        if isinstance(ts, (int, float)):
            posted = time.strftime("%Y-%m-%d", time.gmtime(ts / 1000))
        out.append(Job(
            job_id=f"lever:{slug}:{j.get('id')}",
            ats="lever",
            company=company,
            title=(j.get("text") or "").strip(),
            location=(cats.get("location") or "").strip(),
            url=j.get("hostedUrl") or j.get("applyUrl") or "",
            description="\n\n".join(c for c in chunks if c).strip(),
            posted_at=posted,
            salary=cats.get("commitment"),
        ))
    return out


def parse_ashby(slug: str, company: str, body: Any) -> list[Job]:
    out = []
    for j in (body or {}).get("jobs", []):
        if j.get("isListed") is False:
            continue
        comp = j.get("compensation") or {}
        salary = None
        summary = comp.get("compensationTierSummary") or comp.get("summaryComponents")
        if isinstance(summary, str):
            salary = summary
        out.append(Job(
            job_id=f"ashby:{slug}:{j.get('id')}",
            ats="ashby",
            company=company,
            title=(j.get("title") or "").strip(),
            location=(j.get("location") or "").strip(),
            url=j.get("jobUrl") or j.get("applyUrl") or "",
            description=(j.get("descriptionPlain") or strip_html(j.get("descriptionHtml")) or "").strip(),
            posted_at=j.get("publishedAt"),
            salary=salary,
        ))
    return out


def _join_place(*parts: str | None) -> str:
    return ", ".join(p.strip() for p in parts if p and p.strip())


def parse_workable(slug: str, company: str, body: Any) -> list[Job]:
    out = []
    for j in (body or {}).get("jobs", []):
        places = [_join_place(l.get("city"), l.get("country"))
                  for l in (j.get("locations") or []) if not l.get("hidden")]
        places = places or [_join_place(j.get("city"), j.get("country"))]
        if j.get("telecommuting"):
            places.append("Remote")
        out.append(Job(
            job_id=f"workable:{slug}:{j.get('shortcode')}",
            ats="workable",
            company=company,
            title=(j.get("title") or "").strip(),
            location=" / ".join(p for p in places if p),
            url=j.get("url") or j.get("shortlink") or "",
            description=strip_html(j.get("description")),
            posted_at=j.get("published_on") or j.get("created_at"),
        ))
    return out


def parse_smartrecruiters(slug: str, company: str, body: Any) -> list[Job]:
    """The list has no job description; hydrate() fills it in for the few
    jobs that survive the prefilter, instead of one request per posting."""
    out = []
    for j in (body or {}).get("content", []):
        loc = j.get("location") or {}
        place = re.sub(r"(,\s*)+", ", ", loc.get("fullLocation") or "").strip(", ")
        if loc.get("remote"):
            place = _join_place(place, "Remote")
        out.append(Job(
            job_id=f"smartrecruiters:{slug}:{j.get('id')}",
            ats="smartrecruiters",
            company=company,
            title=(j.get("name") or "").strip(),
            location=place,
            url=f"https://jobs.smartrecruiters.com/{slug}/{j.get('id')}",
            description="",
            posted_at=(j.get("releasedDate") or "")[:10] or None,
        ))
    return out


def parse_recruitee(slug: str, company: str, body: Any) -> list[Job]:
    out = []
    for j in (body or {}).get("offers", []):
        place = j.get("location") or _join_place(j.get("city"), j.get("country"))
        if j.get("remote"):
            place = _join_place(place, "Remote")
        out.append(Job(
            job_id=f"recruitee:{slug}:{j.get('id')}",
            ats="recruitee",
            company=company,
            title=(j.get("title") or "").strip(),
            location=place,
            url=j.get("careers_url") or "",
            description="\n\n".join(
                t for t in (strip_html(j.get("description")), strip_html(j.get("requirements"))) if t),
            # "2026-10-05 15:07:51 UTC" is not ISO; the date is all the prefilter needs.
            posted_at=(j.get("published_at") or j.get("created_at") or "")[:10] or None,
        ))
    return out


def parse_breezy(slug: str, company: str, body: Any) -> list[Job]:
    """The list has no job description; hydrate() loads it from the posting page."""
    out = []
    for j in (body or []):
        locs = [l for l in (j.get("locations") or [j.get("location")]) if isinstance(l, dict)]
        places = [l.get("name") or "" for l in locs]
        if any(l.get("is_remote") for l in locs):
            places.append("Remote")
        out.append(Job(
            job_id=f"breezy:{slug}:{j.get('id')}",
            ats="breezy",
            company=company,
            title=(j.get("name") or "").strip(),
            location=" / ".join(p for p in places if p),
            url=j.get("url") or "",
            description="",
            posted_at=j.get("published_date"),
            salary=j.get("salary") or None,
        ))
    return out


def parse_teamtailor(slug: str, company: str, body: Any) -> list[Job]:
    """jobs.json is a JSON Feed; location lives in the schema.org `_jobposting`."""
    out = []
    for j in (body or {}).get("items", []):
        posting = j.get("_jobposting") or {}
        locs = posting.get("jobLocation") or []
        if isinstance(locs, dict):
            locs = [locs]
        places = []
        for loc in locs:
            a = (loc or {}).get("address") or {}
            places.append(_join_place(a.get("addressLocality"), a.get("addressRegion"),
                                      a.get("addressCountry")))
        if posting.get("jobLocationType") == "TELECOMMUTE":
            places.append("Remote")
        out.append(Job(
            job_id=f"teamtailor:{slug}:{j.get('id')}",
            ats="teamtailor",
            company=company,
            title=(j.get("title") or "").strip(),
            location=" / ".join(p for p in places if p),
            url=j.get("url") or "",
            description=strip_html(j.get("content_html") or posting.get("description")),
            posted_at=j.get("date_published") or posting.get("datePosted"),
        ))
    return out


ENDPOINTS = {
    "greenhouse": ("https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true", parse_greenhouse),
    "lever":      ("https://api.lever.co/v0/postings/{slug}?mode=json", parse_lever),
    "ashby":      ("https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true", parse_ashby),
    "workable":   ("https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true", parse_workable),
    "smartrecruiters": ("https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100", parse_smartrecruiters),
    "recruitee":  ("https://{slug}.recruitee.com/api/offers/", parse_recruitee),
    "breezy":     ("https://{slug}.breezy.hr/json", parse_breezy),
    "teamtailor": ("https://{slug}.teamtailor.com/jobs.json", parse_teamtailor),
}

TEAMTAILOR_MAX_PAGES = 10
_LD_JSON = re.compile(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", re.S | re.I)


def _ld_description(page_html: str) -> str:
    """Job description from a page's schema.org JobPosting block, or ''."""
    for blob in _LD_JSON.findall(page_html):
        try:
            data = json.loads(blob)
        except ValueError:
            continue
        for d in (data if isinstance(data, list) else [data]):
            if isinstance(d, dict) and d.get("@type") == "JobPosting":
                return strip_html(d.get("description"))
    return ""


def get_board(ats: str, slug: str, session) -> tuple[int, Any]:
    """(HTTP status, decoded body). SmartRecruiters pages at 100, so follow it."""
    r = session.get(ENDPOINTS[ats][0].format(slug=slug), headers=UA, timeout=TIMEOUT)
    if r.status_code != 200:
        return r.status_code, None
    body = r.json()
    if ats == "smartrecruiters":
        while len(body["content"]) < body.get("totalFound", 0):
            more = session.get(ENDPOINTS[ats][0].format(slug=slug) + f"&offset={len(body['content'])}",
                               headers=UA, timeout=TIMEOUT).json().get("content") or []
            if not more:
                break
            body["content"].extend(more)
    if ats == "teamtailor":
        nxt, pages = body.get("next_url"), 1
        while nxt and pages < TEAMTAILOR_MAX_PAGES:
            page = session.get(nxt, headers=UA, timeout=TIMEOUT).json()
            if not page.get("items"):
                break
            body["items"].extend(page["items"])
            nxt, pages = page.get("next_url"), pages + 1
    return 200, body


def hydrate(jobs: list[Job], session: requests.Session | None = None) -> None:
    """Fetch the job description for SmartRecruiters and Breezy jobs, whose lists omit it."""
    sess = session or requests.Session()
    for j in jobs:
        if j.ats not in ("smartrecruiters", "breezy") or j.description:
            continue
        try:
            if j.ats == "breezy":
                j.description = _ld_description(sess.get(j.url, headers=UA, timeout=TIMEOUT).text)
                continue
            _, slug, posting_id = j.job_id.split(":", 2)
            d = sess.get(f"https://api.smartrecruiters.com/v1/companies/{slug}/postings/{posting_id}",
                         headers=UA, timeout=TIMEOUT).json()
            sections = (d.get("jobAd") or {}).get("sections") or {}
            j.description = "\n\n".join(
                strip_html((sections.get(k) or {}).get("text"))
                for k in ("jobDescription", "qualifications", "additionalInformation")
                if (sections.get(k) or {}).get("text"))
            j.url = d.get("postingUrl") or j.url
        except Exception as e:  # keep the job; the scorer just sees less text
            print(f"  ! could not load description for {j.company} — {j.title} ({type(e).__name__})")

