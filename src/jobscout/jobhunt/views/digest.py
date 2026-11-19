"""Build the daily HTML digest. Inline CSS only — Gmail strips <style> blocks."""
from __future__ import annotations

import html
from datetime import datetime
from pathlib import Path

from ..models.job import Job

BG = "#0f1115"
CARD = "#171a21"
LINE = "#262b36"
TEXT = "#e6e8ec"
MUTED = "#8b93a3"
ACCENT = "#7c9cff"

# Site-specific badge colors for scraped jobs
SITE_COLORS = {
    "linkedin": "#0077b5",
    "indeed": "#003399",
    "glassdoor": "#082635",
    "naukri": "#d62323",
}


def _site_badge(j: Job) -> str:
    """Colored chip showing which site the job came from."""
    color = SITE_COLORS.get(j.ats, MUTED)
    return (f'<span style="display:inline-block;background:{color};color:#fff;'
            f'font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;'
            f'text-transform:uppercase;letter-spacing:.04em;margin-right:8px;">{j.ats}</span>')


def _badge(score: float | None) -> str:
    s = score or 0
    color = "#3fb950" if s >= 8.5 else "#d29922" if s >= 7 else "#8b949e"
    return (f'<span style="background:{color};color:#0f1115;font-weight:700;'
            f'padding:3px 9px;border-radius:999px;font-size:13px;">{s:.1f}</span>')


def _chance(score: float | None) -> str:
    """The score as a plain word: how well this job matches profile.json."""
    s = score or 0
    label, color = (("High chance", "#3fb950") if s >= 8.5 else
                    ("Good chance", "#d29922") if s >= 7.5 else ("Fair chance", MUTED))
    return f'<span style="color:{color};font-size:12px;font-weight:700;"> {label}</span>'


def _snippet(text: str, n: int = 300) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= n else text[:n].rsplit(" ", 1)[0] + " …"


def _bullets(items: list[str]) -> str:
    if not items:
        return ""
    lis = "".join(
        f'<li style="margin:0 0 6px 0;color:{TEXT};font-size:14px;line-height:1.5;">'
        f'{html.escape(str(i))}</li>' for i in items)
    return f'<ul style="margin:8px 0 0 0;padding-left:18px;">{lis}</ul>'


def _section(label: str, body: str) -> str:
    if not body:
        return ""
    return (f'<div style="margin-top:14px;">'
            f'<div style="color:{MUTED};font-size:11px;letter-spacing:.09em;'
            f'text-transform:uppercase;font-weight:700;">{label}</div>{body}</div>')


def _card(j: Job) -> str:
    d = j.draft or {}
    meta = " · ".join(x for x in [j.company, j.location or "—"] if x)

    para = lambda t: (f'<p style="margin:8px 0 0 0;color:{TEXT};font-size:14px;'
                      f'line-height:1.6;">{html.escape(t)}</p>') if t else ""
    # No AI summary (draft failed / skipped): show the start of the JD instead.
    about = d.get("jd_summary") or _snippet(j.description, 400)
    skills = ", ".join(d.get("key_skills") or [])

    return f"""
<div style="background:{CARD};border:1px solid {LINE};border-radius:12px;padding:18px;margin-bottom:14px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;">
    <div style="font-size:17px;font-weight:700;color:{TEXT};">{html.escape(j.title)}</div>
    <div style="padding-left:12px;white-space:nowrap;">{_badge(j.score)}{_chance(j.score)}</div>
    {_site_badge(j)}
  </div>
  <div style="color:{MUTED};font-size:13px;margin-top:5px;">{html.escape(meta)}</div>
  {para(j.reason or "")}
  {_section("About the role", para(about))}
  {_section("Skills asked", para(skills))}
  {_section("Matches your resume", _bullets(d.get("resume_match", [])))}
  <div style="margin-top:16px;">
    <a href="{html.escape(j.url)}" style="display:inline-block;background:{ACCENT};
       color:#0f1115;font-weight:700;font-size:14px;text-decoration:none;
       padding:10px 18px;border-radius:8px;">Open &amp; apply →</a>
    <span style="color:{MUTED};font-size:11px;margin-left:10px;">{html.escape(j.job_id)}</span>
  </div>
</div>"""


def _row(label: str, value, note: str = "") -> str:
    note_html = (f'<span style="color:{MUTED};font-size:12px;"> {html.escape(note)}</span>'
                 if note else "")
    return (f'<tr><td style="padding:4px 12px 4px 0;color:{MUTED};font-size:13px;'
            f'white-space:nowrap;">{html.escape(label)}</td>'
            f'<td style="padding:4px 0;color:{TEXT};font-size:13px;">'
            f'<b>{html.escape(str(value))}</b>{note_html}</td></tr>')


def _summary(f: dict) -> str:
    """Run numbers as a table. Built from counts only: no LLM call."""
    drop = f.get("dropped") or {}
    rows = []
    if "from_yaml" in f:
        rows.append(_row("Companies checked", f.get("from_yaml", 0) + f.get("from_csv", 0),
                         f"{f.get('from_yaml', 0)} from companies.yaml + "
                         f"{f.get('from_csv', 0)} from ats_matcher CSVs"))
    if f.get("from_scraper"):
        rows.append(_row("From scraper CSVs", f["from_scraper"],
                         "LinkedIn / Indeed / Glassdoor / Naukri jobs not scored yet"))
    rows += [
        _row("Jobs scanned", f.get("scanned", 0)),
        _row("Dropped by title", drop.get("title", 0), "not a tech / fresher title"),
        _row("Dropped by location", drop.get("location", 0), "outside India and not remote"),
        _row("Dropped by experience", drop.get("experience", 0), "asks 2+ years / SDE 2 / Lead"),
        _row("Dropped as old", drop.get("age", 0), "older than max_age_days"),
        _row("Passed filters", f.get("passed_filters", 0)),
        _row("Already seen", f.get("already_seen", 0), "shown in an earlier run"),
        _row("New", f.get("new", 0)),
    ]
    if f.get("waiting"):
        rows.append(_row("Scraper jobs waiting", f["waiting"],
                         "not scored this run (score_per_site), picked in later runs"))
    if f.get("scored") is not None:
        rows.append(_row("Scored by AI", f.get("scored", 0),
                         f"({f['provider']})" if f.get("provider") else ""))
    if f.get("unscored"):
        rows.append(_row("Could not be scored", f["unscored"], "will retry next run"))
    rows.append(_row(f"Cleared {f.get('threshold', 0):g}", f.get("matches", 0)))
    if "added" in f:
        rows.append(_row("Companies this run", f"+{f.get('added', 0)} / -{f.get('removed', 0)}",
                         "added to / removed from companies.yaml"))
    return (f'<div style="background:{CARD};border:1px solid {LINE};border-radius:12px;'
            f'padding:16px 18px;margin-bottom:14px;">'
            f'<table style="border-collapse:collapse;">{"".join(rows)}</table></div>')


def _job_list(title: str, jobs: list[Job], with_jd: bool = False) -> str:
    """Compact rows: score, company — role (linked), location, reason, and
    optionally the start of the JD. No AI call."""
    if not jobs:
        return ""
    jd = lambda j: (f'<div style="color:{TEXT};font-size:13px;line-height:1.5;margin-top:4px;">'
                    f'{html.escape(_snippet(j.description))}</div>') if with_jd and j.description else ""
    items = "".join(
        f'<div style="padding:8px 0;border-top:1px solid {LINE};">{_badge(j.score)}'
        f'{_chance(j.score) if with_jd else ""} '
        f'<a href="{html.escape(j.url)}" style="color:{TEXT};font-size:14px;font-weight:700;'
        f'text-decoration:none;">{html.escape(j.company)} — {html.escape(j.title)}</a>'
        f'<span style="color:{MUTED};font-size:12px;"> ({html.escape(j.location or "—")})</span>'
        f'<div style="color:{MUTED};font-size:13px;margin-top:4px;">'
        f'{html.escape(j.reason or "")}</div>{jd(j)}</div>' for j in jobs)
    return (f'<div style="background:{CARD};border:1px solid {LINE};border-radius:12px;'
            f'padding:16px 18px;margin-bottom:14px;">'
            f'<div style="color:{MUTED};font-size:11px;letter-spacing:.09em;'
            f'text-transform:uppercase;font-weight:700;margin-bottom:6px;">{title}</div>'
            f'{items}</div>')


def build(jobs: list[Job], funnel: dict, stats: dict,
          near_misses: list[Job] | None = None, top_n: int = 5,
          scraped: list[Job] | None = None) -> tuple[str, str]:
    """Match digest or, with no jobs, the fixed 0-match template. Blocks, in
    order: the first `top_n` board jobs as full cards, the best `scraped`
    (LinkedIn / Indeed / Glassdoor / Naukri) jobs, then the other board jobs.
    Both start with the run summary; nothing here calls an LLM."""
    today = datetime.now().strftime("%d %b %Y")
    near_misses = near_misses or []
    scraped = scraped or []
    total = len(jobs) + len(scraped)
    if total:
        subject = f"{total} job{'s' if total != 1 else ''} worth your time — {today}"
    else:
        best = f", best {near_misses[0].score:.1f}" if near_misses else ""
        subject = (f"0 matches today — scanned {funnel.get('scanned', 0)}, "
                   f"{funnel.get('new', 0)} new{best} — {today}")

    warning = ""
    if funnel.get("warning"):
        warning = (f'<div style="background:#3a2a0f;border:1px solid #d29922;border-radius:12px;'
                   f'padding:12px 18px;margin-bottom:14px;color:{TEXT};font-size:14px;">'
                   f'{html.escape(funnel["warning"])}</div>')

    if total:
        bar = f"{funnel.get('threshold', 0):g}+"
        body = "".join(_card(j) for j in jobs[:top_n]) + \
            _job_list("Best from LinkedIn / Indeed / Glassdoor / Naukri", scraped, with_jd=True) + \
            _job_list(f"More {bar} matches", jobs[top_n:], with_jd=True)
    else:
        body = (f'<div style="background:{CARD};border:1px solid {LINE};border-radius:12px;'
                f'padding:16px 18px;margin-bottom:14px;color:{MUTED};font-size:14px;">'
                f'No job cleared the bar this run. The numbers above show where they dropped out.'
                f'</div>{_job_list("Closest misses", near_misses)}')

    html_doc = f"""<!doctype html><html><body style="margin:0;padding:20px;background:{BG};
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:640px;margin:0 auto;">
  <div style="color:{TEXT};font-size:22px;font-weight:800;">Your job digest</div>
  <div style="color:{MUTED};font-size:13px;margin:6px 0 20px 0;">
    {today} · {total} made the cut ·
    tracker: {stats.get('tracked', 0)} seen · {stats.get('applied', 0)} applied
  </div>
  {warning}
  {_summary(funnel)}
  {body}
  <div style="color:{MUTED};font-size:11px;line-height:1.6;margin-top:18px;
       border-top:1px solid {LINE};padding-top:14px;">
    Score = how well the job matches your resume (profile.json), 0-10.
    8.5+ high chance · 7.5+ good chance · 7+ fair chance. Open the link and apply yourself.
  </div>
</div></body></html>"""
    return subject, html_doc


def write(html_doc: str, path: str | Path = "out/digest.html") -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html_doc, encoding="utf-8")
    return path
